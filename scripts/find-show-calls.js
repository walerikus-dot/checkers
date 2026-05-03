#!/usr/bin/env node
/**
 * find-show-calls.js — list every UI-feedback call site (showInfoHint / showToast /
 * showOverlay / _dismissHint / showInfoHint vs showToast). Useful for auditing tip
 * coverage and making sure transient messages route through the info bar (showInfoHint)
 * rather than the bottom toast.
 *
 *   node scripts/find-show-calls.js [path]
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

const PATTERNS = [
  ['showInfoHint',   /showInfoHint\s*\(/],
  ['showToast',      /showToast\s*\(/],
  ['showOverlay',    /showOverlay\s*\(/],
  ['_dismissHint',   /_dismissHint\s*\(/],
  ['drawModalShow',  /drawModalShow\s*\(/],
];

const buckets = {};
for (const [name] of PATTERNS) buckets[name] = [];

lines.forEach((line, i) => {
  for (const [name, re] of PATTERNS) {
    if (re.test(line)) {
      buckets[name].push({ ln: i + 1, src: line.trim().slice(0, 110) });
    }
  }
});

for (const [name, list] of Object.entries(buckets)) {
  console.log(`\n## ${name}  (${list.length} call sites)\n`);
  if (!list.length) { console.log('  —  none'); continue; }
  for (const { ln, src } of list) {
    console.log(`  ${String(ln).padStart(5)}  ${src}`);
  }
}

// Quick suspect-summary: showToast lines that look like UI hints (could be moved to showInfoHint)
const suspectHint = buckets.showToast.filter(({ src }) =>
  /'(?:.*sign in|.*tip|tap|hold|drag|swipe|click|hint).*'|"(?:.*sign in|.*tip|tap|hold|drag|swipe|click|hint).*"/i.test(src)
);
console.log(`\n## Suspect: showToast() that looks like a hint (${suspectHint.length})\n`);
for (const { ln, src } of suspectHint) {
  console.log(`  ${String(ln).padStart(5)}  ${src}`);
}
