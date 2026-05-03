#!/usr/bin/env node
/**
 * find-listeners.js — list every addEventListener('event', …) binding in index.html,
 * grouped by event type. Useful to verify pointer/keyboard handlers, see what's
 * bound to window/document vs specific elements, and audit gesture coverage.
 *
 *   node scripts/find-listeners.js [path]
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
const lines = fs.readFileSync(FILE, 'utf8').split('\n');

const RE = /(\b[\w$.\[\]'"]+)\.addEventListener\s*\(\s*['"]([\w-]+)['"]/g;
const byEvent = {};

lines.forEach((line, i) => {
  let mm;
  while ((mm = RE.exec(line))) {
    const target = mm[1];
    const ev = mm[2];
    (byEvent[ev] = byEvent[ev] || []).push({ ln: i + 1, target, src: line.trim().slice(0, 140) });
  }
});

const events = Object.keys(byEvent).sort();
console.log(`# addEventListener bindings in ${path.basename(FILE)}`);
console.log(`# ${events.length} distinct events, ${Object.values(byEvent).flat().length} total bindings\n`);

for (const ev of events) {
  const list = byEvent[ev];
  console.log(`\n## "${ev}"  (${list.length} bindings)\n`);
  for (const { ln, target, src } of list) {
    console.log(`  ${String(ln).padStart(5)}  ${target.padEnd(28)} | ${src}`);
  }
}
