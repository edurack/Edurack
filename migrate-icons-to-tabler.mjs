#!/usr/bin/env node
/**
 * migrate-icons-to-tabler.mjs
 * -----------------------------------------------------------------------
 * Rewrites every `import { A, B, C } from "lucide-react"` in your codebase
 * to `import { IconA as A, IconB as B, IconC as C } from "@tabler/icons-react"`.
 *
 * Because it aliases every import back to its original name, you do NOT
 * need to touch any JSX usage sites like <A className="h-4 w-4" /> — they
 * keep compiling exactly as they are.
 *
 * USAGE:
 *   1. npm install @tabler/icons-react
 *   2. node migrate-icons-to-tabler.mjs          (scans ./src by default)
 *      node migrate-icons-to-tabler.mjs src/components   (scan a subfolder)
 *   3. Read the summary printed at the end:
 *        - "Migrated" files were fully converted, safe to review + commit.
 *        - "Icons with no mapping" lists any icon name this script didn't
 *          recognize — those files keep a (now partial) lucide-react
 *          import for just those icons so nothing breaks. Look those up on
 *          https://tabler.io/icons manually and add them to ICON_MAP below,
 *          or hand-fix the import line.
 *   4. Once every file is migrated and the app builds/runs fine:
 *        npm uninstall lucide-react
 *
 * This script only rewrites IMPORT lines. It does not change icon meaning
 * (e.g. a Cpu icon used for "Create Mentor Space" stays semantically wrong
 * after migration — see the MANUAL REVIEW list printed at the end for the
 * specific icon-meaning mismatches already flagged in this conversation).
 * -----------------------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] || "src";
const EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".vercel"]);

// ─── Lucide → Tabler name map ─────────────────────────────────────────────
// Left side: the exact named export from "lucide-react".
// Right side: the exact named export from "@tabler/icons-react".
// This covers the icons seen across your landing page, mentor onboarding,
// mentor portal, and admin files, plus the most common general-purpose
// icons. Anything used in your codebase that ISN'T in this list will be
// reported at the end instead of silently guessed.
const ICON_MAP = {
  // Navigation / UI chrome
  Menu: "IconMenu2",
  X: "IconX",
  ChevronDown: "IconChevronDown",
  ChevronUp: "IconChevronUp",
  ChevronLeft: "IconChevronLeft",
  ChevronRight: "IconChevronRight",
  ChevronsUpDown: "IconSelector",
  MoreHorizontal: "IconDots",
  MoreVertical: "IconDotsVertical",
  ArrowRight: "IconArrowRight",
  ArrowLeft: "IconArrowLeft",
  ArrowUpRight: "IconArrowUpRight",
  ArrowUp: "IconArrowUp",
  ArrowDown: "IconArrowDown",
  ExternalLink: "IconExternalLink",
  Search: "IconSearch",
  Filter: "IconFilter",
  Settings: "IconSettings",
  Home: "IconHome",
  LogOut: "IconLogout",
  LogIn: "IconLogin",

  // Status / feedback
  CheckCircle2: "IconCircleCheck",
  Check: "IconCheck",
  XCircle: "IconCircleX",
  AlertCircle: "IconAlertCircle",
  Info: "IconInfoCircle",
  HelpCircle: "IconHelpCircle",
  Loader2: "IconLoader2",
  Ban: "IconBan",
  Lock: "IconLock",
  ShieldCheck: "IconShieldCheck",
  BadgeCheck: "IconRosetteDiscountCheck",
  KeyRound: "IconKey",

  // People / identity
  User: "IconUser",
  Users: "IconUsers",
  Users2: "IconUsersGroup",
  UserCheck: "IconUserCheck",
  GraduationCap: "IconSchool",

  // Content / files
  FileText: "IconFileText",
  Image: "IconPhoto",
  ImageIcon: "IconPhoto",
  Upload: "IconUpload",
  UploadCloud: "IconCloudUpload",
  Download: "IconDownload",
  Folder: "IconFolder",
  BookMarked: "IconBookmark",
  BookOpen: "IconBook2",

  // Commerce / money
  IndianRupee: "IconCurrencyRupee",
  DollarSign: "IconCurrencyDollar",
  CreditCard: "IconCreditCard",
  ShoppingBag: "IconShoppingBag",
  ShoppingCart: "IconShoppingCart",
  Receipt: "IconReceipt",
  Tag: "IconTag",

  // Time / scheduling
  Calendar: "IconCalendar",
  CalendarDays: "IconCalendarEvent",
  CalendarCheck: "IconCalendarCheck",
  CalendarClock: "IconCalendarClock",
  Clock: "IconClock",

  // Communication
  Mail: "IconMail",
  MessageSquare: "IconMessageCircle",
  Megaphone: "IconSpeakerphone",
  Phone: "IconPhone",
  Send: "IconSend",
  AtSign: "IconAt",

  // Media
  Play: "IconPlayerPlay",
  PlayCircle: "IconPlayerPlayFilled",
  Video: "IconVideo",
  Mic: "IconMicrophone",

  // Analytics / business
  TrendingUp: "IconTrendingUp",
  LineChart: "IconChartLine",
  BarChart: "IconChartBar",
  ClipboardList: "IconClipboardList",
  Layers3: "IconStack2",
  LayoutDashboard: "IconLayoutDashboard",
  Building2: "IconBuilding",
  Award: "IconAward",
  Trophy: "IconTrophy",
  Globe: "IconWorld",
  Sparkles: "IconSparkles",
  Rocket: "IconRocket",
  Cpu: "IconCpu",
  MapPin: "IconMapPin",
  LifeBuoy: "IconLifebuoy",
  MonitorPlay: "IconDeviceDesktopAnalytics",
  Eye: "IconEye",
  Pencil: "IconPencil",
  Plus: "IconPlus",
  Minus: "IconMinus",
  Trash: "IconTrash",
  Trash2: "IconTrash",
  Copy: "IconCopy",
  Bell: "IconBell",
  Star: "IconStar",
  Heart: "IconHeart",

  // Brand icons
  Linkedin: "IconBrandLinkedin",
  Youtube: "IconBrandYoutube",
  Instagram: "IconBrandInstagram",
  Twitter: "IconBrandX",
};

// ─── Known icon-meaning mismatches from earlier review — printed as a
// reminder at the end so they get fixed by hand, since a name-for-name
// codemod can't decide "the right icon for this specific sentence". ──────
const MANUAL_REVIEW_NOTES = [
  `index.tsx: "Cpu" used for "Create Mentor Space" button — consider IconRocket or IconCirclePlus instead of IconCpu.`,
  `index.tsx: "TrendingUp" used for "Follow Corporate Updates" link — consider IconBell or IconRss instead of IconTrendingUp.`,
  `index.tsx: "CalendarCheck" used for the "Direct Mentor Marketplace" feature — consider IconBuildingStore instead of IconCalendarCheck.`,
  `mentor-onboarding/$applicationId.tsx: "MapPin" used for "Preferred batch launch date" — consider IconRocket or IconCalendarEvent instead of IconMapPin.`,
  `mentor-onboarding/$applicationId.tsx: "Tag" used for "Batch name" field — consider IconTypography or IconBook2 instead of IconTag.`,
  `mentor-overview-module.tsx: "MessageSquare" reused for the "Announcements" quick action while also used for the real chat panel — give Announcements IconSpeakerphone instead.`,
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

// Matches `import { A, B as C, D } from "lucide-react";` across single or
// multiple lines, single or double quotes, with or without trailing
// semicolon.
const IMPORT_RE = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["'];?/g;

function migrateFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let changed = false;
  const unmapped = new Set();

  const updated = original.replace(IMPORT_RE, (_match, specifierList) => {
    const specifiers = specifierList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const tablerSpecs = [];
    const leftoverLucideSpecs = [];

    for (const spec of specifiers) {
      // spec is either "IconName" or "IconName as LocalAlias"
      const asMatch = spec.match(/^(\S+)\s+as\s+(\S+)$/);
      const lucideName = asMatch ? asMatch[1] : spec;
      const localName = asMatch ? asMatch[2] : spec;

      const tablerName = ICON_MAP[lucideName];
      if (tablerName) {
        tablerSpecs.push(
          tablerName === localName ? tablerName : `${tablerName} as ${localName}`,
        );
      } else {
        unmapped.add(lucideName);
        leftoverLucideSpecs.push(spec);
      }
    }

    changed = true;
    let result = "";
    if (tablerSpecs.length > 0) {
      result += `import { ${tablerSpecs.join(", ")} } from "@tabler/icons-react";`;
    }
    if (leftoverLucideSpecs.length > 0) {
      result += `${result ? "\n" : ""}import { ${leftoverLucideSpecs.join(", ")} } from "lucide-react"; // TODO: no Tabler mapping found yet`;
    }
    return result;
  });

  if (changed) {
    fs.writeFileSync(filePath, updated, "utf8");
  }

  return { changed, unmapped };
}

function main() {
  if (!fs.existsSync(ROOT)) {
    console.error(`Directory "${ROOT}" not found. Run this from your project root, e.g.:\n  node migrate-icons-to-tabler.mjs src`);
    process.exit(1);
  }

  const files = walk(ROOT);
  const migratedFiles = [];
  const allUnmapped = new Set();

  for (const file of files) {
    const { changed, unmapped } = migrateFile(file);
    if (changed) migratedFiles.push(file);
    for (const u of unmapped) allUnmapped.add(u);
  }

  console.log("\n─── Icon migration summary ───────────────────────────────");
  console.log(`Scanned:   ${files.length} files under "${ROOT}"`);
  console.log(`Migrated:  ${migratedFiles.length} files`);
  migratedFiles.forEach((f) => console.log(`  ✓ ${f}`));

  if (allUnmapped.size > 0) {
    console.log(`\nIcons with no mapping (left as lucide-react imports, need manual fix):`);
    [...allUnmapped].sort().forEach((name) => console.log(`  ⚠ ${name} — look up the closest icon at https://tabler.io/icons`));
  } else {
    console.log(`\nEvery icon found had a Tabler mapping. Nothing left unmapped.`);
  }

  console.log(`\n─── Manual review: icon-meaning fixes (not automated) ─────`);
  MANUAL_REVIEW_NOTES.forEach((note) => console.log(`  • ${note}`));

  console.log(`\nNext steps:`);
  console.log(`  1. npm install @tabler/icons-react   (if you haven't yet)`);
  console.log(`  2. Run your app / build and visually check icon sizes — Tabler defaults to size=24, but your existing className="h-4 w-4" etc. still overrides that fine.`);
  console.log(`  3. Fix anything listed under "Icons with no mapping" above.`);
  console.log(`  4. Once confirmed clean: npm uninstall lucide-react`);
  console.log("");
}

main();
