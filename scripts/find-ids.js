#!/usr/bin/env node
/**
 * find-ids.js — find duplicate id="…" declarations in index.html and any
 * `getElementById('x')` references that point at IDs that don't exist in markup.
 *
 *   node scripts/find-ids.js [path]
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

// Collect declared IDs (only attribute form)
const idCount = new Map();
const ID_RE = /\sid\s*=\s*"([^"]+)"/g;
let m;
while ((m = ID_RE.exec(html))) idCount.set(m[1], (idCount.get(m[1]) || 0) + 1);

const duplicates = [...idCount].filter(([, n]) => n > 1);
console.log(`# Duplicate IDs in ${path.basename(FILE)} (${duplicates.length})\n`);
for (const [id, n] of duplicates) console.log(`  ❌ "${id}" appears ${n}×`);
if (!duplicates.length) console.log('  ✓ All IDs are unique.');

// Collect referenced IDs from getElementById / querySelector("#…")
const referenced = new Set();
for (const re of [
  /getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /querySelector\s*\(\s*['"]#([\w-]+)['"]\s*\)/g,
]) {
  let mm;
  while ((mm = re.exec(html))) referenced.add(mm[1]);
}

const missing = [...referenced].filter(id => !idCount.has(id));
console.log(`\n# IDs referenced but not declared in markup (${missing.length})\n`);
for (const id of missing.sort()) console.log(`  ❌ "${id}"`);
if (!missing.length) console.log('  ✓ All referenced IDs exist in markup.');

// Reverse: declared but never referenced (often fine, e.g. labels/anchors)
const unreferenced = [...idCount.keys()].filter(id => !referenced.has(id));
console.log(`\n# IDs declared but never referenced from JS (${unreferenced.length})`);
console.log(`  (informational — many labels/anchors don't need JS lookups)\n`);
for (const id of unreferenced.sort()) console.log(`    ${id}`);
