// Runs automatically after `npm run build` (npm's built-in "postbuild"
// convention — no Vercel project settings need to change).
//
// WHY THIS EXISTS: firebase-admin must be kept external from the Vite/
// Rolldown bundle (bundling it breaks at runtime with "Cannot read
// properties of undefined (reading 'SDK_VERSION')" — a real bug we hit and
// confirmed). But once external, Nitro v3's `traceDeps` config option
// (which is supposed to copy an external package's real files into the
// deployed function) was confirmed, across two separate live deploys, to
// NOT actually copy anything — the external import then resolves to
// nothing at runtime instead ("Cannot find package 'firebase-admin'").
//
// So: we copy firebase-admin and its full dependency tree ourselves. This
// also now covers mongodb and its dependency tree, for the same reason
// (mongodb is externalized in vite.config.ts too).
//
// FIX HISTORY:
// v1: assumed every dependency was hoisted to the flat root node_modules
//     (`join(rootNodeModules, name)`). npm does NOT always hoist — nested
//     conflicting versions were silently skipped ("not found, skipping").
// v2: tried `require.resolve(name + "/package.json")` to find each
//     package's real on-disk location, mimicking Node's actual resolution.
//     This broke on packages (like firebase-admin itself) whose
//     package.json declares an "exports" map that doesn't explicitly list
//     "./package.json" as an allowed subpath — Node's exports enforcement
//     then throws ERR_PACKAGE_PATH_NOT_EXPORTED even though the file exists
//     on disk, so the whole package silently got skipped.
// v3: don't resolve "package.json" as a module subpath at all (that goes
//     through exports enforcement). Instead use `require.resolve.paths(name)`
//     to get the list of node_modules directories Node would search for
//     `name` — that's plain directory listing and does NOT go through any
//     package's exports map — then manually check each candidate directory
//     with a filesystem existsSync check for the package folder. This finds
//     the same on-disk location Node's resolver would use, without tripping
//     over exports maps.
// v4 (actual fix, mongodb tree): v3 still silently failed for any package
//     name that collides with a Node core module — e.g. "punycode" is BOTH
//     a real npm package (a transitive dep of mongodb, via
//     mongodb-connection-string-url -> whatwg-url -> tr46) AND a deprecated
//     Node core module. require.resolve.paths(request) returns null
//     whenever `request` matches a core module name, short-circuiting
//     before ever checking node_modules — so it always failed to resolve
//     "punycode" even though the real package sat right there on disk.
//     Fix: when the plain name resolves to nothing, retry with a trailing
//     slash ("punycode/") — never a valid core-module specifier, so it
//     forces genuine node_modules resolution. This is the same trick tr46
//     itself uses at runtime (its own require call is `require('punycode/')`,
//     note the slash). Only affects the lookup; the on-disk destination
//     path still uses the clean package name.
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const rootNodeModules = join(root, "node_modules");
const functionDir = join(root, ".vercel", "output", "functions", "__server.func");
const destNodeModules = join(functionDir, "node_modules");

// Handles scoped packages like "@grpc/grpc-js" -> ["@grpc", "grpc-js"]
function nameSegments(name) {
  return name.split("/");
}

// Find the real on-disk directory for `name`, searching from `fromDir` the
// same way Node's require() would (walking up through node_modules
// directories), but via plain filesystem checks so we never trigger a
// package's "exports" map restrictions.
function resolvePackageDir(name, fromDir) {
  const req = createRequire(join(fromDir, "noop.js"));

  function tryPaths(request) {
    try {
      return req.resolve.paths(request) || [];
    } catch {
      return [];
    }
  }

  // require.resolve.paths(request) returns null whenever `request` is a
  // Node core module — short-circuiting before ever checking node_modules.
  // Some npm packages (e.g. "punycode") share a name with a core module,
  // so the plain name always short-circuits even though the real package
  // is on disk. A trailing slash is never a valid core-module specifier,
  // so retrying with one forces genuine node_modules resolution instead.
  let candidateDirs = tryPaths(name);
  if (candidateDirs.length === 0) {
    candidateDirs = tryPaths(name + "/");
  }

  for (const dir of candidateDirs) {
    const candidate = join(dir, ...nameSegments(name));
    if (existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  return null;
}

function copyPackage(name, fromDir, seenPaths) {
  const src = resolvePackageDir(name, fromDir);
  if (!src) {
    console.warn(`[copy-firebase-admin-deps] could not resolve, skipping: ${name} (from ${fromDir})`);
    return;
  }

  if (seenPaths.has(src)) return; // this exact on-disk copy already handled
  seenPaths.add(src);

  // Preserve the real relative path under node_modules, not a flattened one —
  // e.g. node_modules/google-auth-library/node_modules/node-fetch stays
  // nested in the destination too, matching how it resolves at runtime.
  const relPath = relative(rootNodeModules, src);
  const dest = relPath.startsWith("..")
    ? join(destNodeModules, ...nameSegments(name)) // resolved outside root node_modules entirely (rare); fall back to flat
    : join(destNodeModules, relPath);

  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, dereference: true, force: true });
  console.log(`[copy-firebase-admin-deps] copied ${name} -> ${relative(root, dest)}`);

  const pkgJsonPath = join(src, "package.json");
  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
  for (const dep of Object.keys(deps)) {
    copyPackage(dep, src, seenPaths);
  }
}

if (!existsSync(functionDir)) {
  // Not a Vercel build (e.g. running `npm run build` for something else) —
  // nothing to do.
  console.log("[copy-firebase-admin-deps] no .vercel/output function found, skipping");
  process.exit(0);
}

const seenPaths = new Set();
copyPackage("firebase-admin", root, seenPaths);
copyPackage("json-bigint", root, seenPaths); // Force-inject json-bigint to the output
copyPackage("mongodb", root, seenPaths);
copyPackage("bson", root, seenPaths);
copyPackage("punycode", root, seenPaths);
console.log("[copy-firebase-admin-deps] done");