// @lovable.dev/vite-tanstack-config already includes standard plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    ssr: {
      // ssr.external only accepts string[] | true (no RegExp) in this
      // Vite/Rolldown version — plain package names are fine here since
      // Vite resolves externals at the package level (covers subpaths
      // like "firebase-admin/app" automatically).
      external: ["firebase-admin", "google-auth-library", "node-fetch", "mongodb", "bson"],
    },
    build: {
      rollupOptions: {
        // Rollup/Rolldown's external DOES need the regex form to catch
        // deep imports like "firebase-admin/app" and "firebase-admin/auth"
        // — a plain string only matches the exact bare specifier.
        external: [
          /^firebase-admin(\/.*)?$/,
          /^google-auth-library(\/.*)?$/,
          /^node-fetch(\/.*)?$/,
          /^mongodb(\/.*)?$/,
          /^bson(\/.*)?$/,
        ],
      },
    },
  },
  nitro: {
    preset: "vercel",
    // NOTE: we do NOT rely on Nitro's `traceDeps` here. We tried it
    // (traceDeps: ["firebase-admin"]) and confirmed across two separate
    // deploys that it does not copy the package's files into the deployed
    // function on this beta Nitro version — the external import still
    // resolved to nothing at runtime. Instead, see
    // scripts/copy-firebase-admin-deps.mjs, run automatically via the
    // "postbuild" npm script, which copies firebase-admin and its full
    // dependency tree into the built function directory ourselves,
    // deterministically and verifiably.
  },
});