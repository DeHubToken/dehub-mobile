#!/usr/bin/env node
/**
 * fix-i18n-missing-keys.js
 *
 * Compares every locale JSON in i18n/locales/ against en.json (source of truth).
 * Any key path present in en.json but missing from a locale file is added with
 * the English value as a fallback so the app never displays a raw key string.
 *
 * Usage:
 *   node scripts/fix-i18n-missing-keys.js [--dry-run] [--locale xx]
 *
 * Flags:
 *   --dry-run        Print what would change without writing files
 *   --locale xx      Only process one locale (e.g. --locale fr)
 */

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(__dirname, "..", "i18n", "locales");
const SOURCE_LOCALE = "en";
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_LOCALE = (() => {
  const idx = process.argv.indexOf("--locale");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error(`  ERROR reading ${filePath}: ${e.message}`);
    return null;
  }
}

/**
 * Recursively merge `source` into `target`.
 * Only adds keys that are completely missing — never overwrites existing values.
 * Returns { updated: obj, addedPaths: string[] }
 */
function mergeDeep(target, source, parentPath = "") {
  const result = Object.assign({}, target);
  const addedPaths = [];

  for (const key of Object.keys(source)) {
    const fullPath = parentPath ? `${parentPath}.${key}` : key;

    if (!(key in result)) {
      // Key entirely missing — add with English fallback
      result[key] = source[key];
      addedPaths.push(fullPath);
    } else if (
      typeof source[key] === "object" &&
      source[key] !== null &&
      !Array.isArray(source[key]) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      // Both are objects — recurse
      const child = mergeDeep(result[key], source[key], fullPath);
      result[key] = child.updated;
      addedPaths.push(...child.addedPaths);
    }
    // If target already has a scalar value for this key, leave it alone
  }

  return { updated: result, addedPaths };
}

// ── main ─────────────────────────────────────────────────────────────────────

const sourceFile = path.join(LOCALES_DIR, `${SOURCE_LOCALE}.json`);
const source = readJson(sourceFile);
if (!source) {
  console.error(`Cannot read source file: ${sourceFile}`);
  process.exit(1);
}

const allFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json") && f !== `${SOURCE_LOCALE}.json`)
  .sort();

const targets = ONLY_LOCALE
  ? allFiles.filter((f) => f === `${ONLY_LOCALE}.json`)
  : allFiles;

if (targets.length === 0) {
  console.log(ONLY_LOCALE ? `No file found for locale: ${ONLY_LOCALE}` : "No locale files found.");
  process.exit(0);
}

console.log(`\nSource of truth : ${SOURCE_LOCALE}.json`);
console.log(`Locale files    : ${targets.length}`);
console.log(`Mode            : ${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}\n`);
console.log("─".repeat(60));

let totalAdded = 0;
let totalFiles = 0;

for (const file of targets) {
  const locale = file.replace(".json", "");
  const filePath = path.join(LOCALES_DIR, file);
  const target = readJson(filePath);
  if (!target) continue;

  const { updated, addedPaths } = mergeDeep(target, source);

  if (addedPaths.length === 0) {
    // Nothing to add
    continue;
  }

  totalFiles++;
  totalAdded += addedPaths.length;

  console.log(`\n[${locale}]  +${addedPaths.length} missing key(s)`);
  addedPaths.slice(0, 20).forEach((p) => console.log(`  + ${p}`));
  if (addedPaths.length > 20) {
    console.log(`  ... and ${addedPaths.length - 20} more`);
  }

  if (!DRY_RUN) {
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2) + "\n", "utf8");
  }
}

console.log("\n" + "─".repeat(60));
console.log(
  `Done. ${totalFiles} file(s) updated, ${totalAdded} key(s) added in total.`
);
if (DRY_RUN) {
  console.log("(dry-run — no files were written)");
}
