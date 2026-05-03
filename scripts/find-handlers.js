#!/usr/bin/env node
/**
 * find-handlers.js — list every onclick="…" / onpointerdown="…" / onchange="…" inline
 * handler in index.html and verify the referenced JS function is actually defined.
 *
 *   node scripts/find-handlers.js [path]
 *
 * Prints two sections:
 *   1. All inline handlers (id, attribute, function call)
 *   2. Handlers whose target function is NOT defined anywhere in the script — likely bugs
 */
const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

// Collect inline handlers — attr="funcName(args)" form
const HANDLER_RE = /\s(on[a-z]+)\s*=\s*"([^"]*?)"/g;
const handlers = [];
let m;
while ((m = HANDLER_RE.exec(html))) {
  const attr = m[1];
  const body = m[2];
  // Find the opening tag this handler belongs to
  let i = m.index;
  while (i > 0 && html[i] !== '<') i--;
  const tagOpen = html.slice(i, m.index + m[0].length);
  const idMatch = tagOpen.match(/\sid\s*=\s*"([^"]*)"/);
  const tagMatch = tagOpen.match(/<\s*([a-zA-Z][a-zA-Z0-9-]*)/);
  // Extract called function names: word followed by `(`
  const calls = [...body.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(c => c[1]);
  handlers.push({
    tag: tagMatch ? tagMatch[1] : '?',
    id: idMatch ? idMatch[1] : '',
    attr,
    body: body.length > 60 ? body.slice(0, 57) + '…' : body,
    calls,
  });
}

// Build the set of defined functions (function declarations + assignments)
const defined = new Set();
for (const re of [
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/g,
  /\blet\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/g,
  /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g,
]) {
  let mm; while ((mm = re.exec(html))) defined.add(mm[1]);
}

// Browser globals + popular natives the inline JS may legitimately call
const NATIVE_OK = new Set([
  'event','this','setTimeout','setInterval','clearInterval','clearTimeout',
  'Math','JSON','console','alert','confirm','prompt','navigator','document',
  'window','location','localStorage','sessionStorage','fetch','URL','Date',
  'Array','Object','String','Number','Boolean','Promise','Set','Map','RegExp',
]);

console.log(`# Inline handlers in ${path.basename(FILE)} (${handlers.length} total)\n`);
for (const h of handlers) {
  const tagId = h.id ? `${h.tag}#${h.id}` : `${h.tag}`;
  console.log(`  [${h.attr}]  ${tagId.padEnd(30)} → ${h.body}`);
}

const missing = handlers.filter(h => h.calls.some(c => !defined.has(c) && !NATIVE_OK.has(c)));
console.log(`\n## Handlers calling undefined functions (${missing.length})\n`);
for (const h of missing) {
  const bad = h.calls.filter(c => !defined.has(c) && !NATIVE_OK.has(c));
  const tagId = h.id ? `${h.tag}#${h.id}` : `${h.tag}`;
  console.log(`  ❌ ${tagId.padEnd(30)} calls: ${bad.join(', ')}`);
}
if (!missing.length) console.log('  ✓ All inline handlers reference defined functions.');
