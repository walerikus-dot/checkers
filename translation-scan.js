/* Translation gap scanner for index.html
 * - Extracts EN and RU translation objects
 * - Compares keys (missing in RU, missing in EN, orphaned)
 * - Finds untranslated values (RU value identical to EN)
 * - Lists all t('key') calls and reports keys never defined
 * - Reports defined keys never used
 */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// --- Extract TR object (lines 3054..3197) ---
// Use regex to grab `en:{...}` and `ru:{...}` blocks
function extractBlock(label) {
  const startRe = new RegExp(`^\\s*${label}\\s*:\\s*\\{`, 'm');
  const m = html.match(startRe);
  if (!m) return null;
  const startIdx = m.index + m[0].length;
  let depth = 1, i = startIdx;
  while (i < html.length && depth > 0) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    if (depth === 0) break;
    i++;
  }
  return html.slice(startIdx, i);
}

const enRaw = extractBlock('en');
const ruRaw = extractBlock('ru');

// Parse "key:'value'," pairs (allow single/double quotes, allow nested objects flagged)
function parseKeys(raw) {
  const out = {};
  // Match key:'...' or key:"..." (no full nested object support — note where it has nested)
  const re = /(?:^|,|\{|\s)([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(\{[^}]*\}))/g;
  let m;
  while ((m = re.exec(raw))) {
    const key = m[1];
    if (key === 'rgb' || key === 'hex' || key === 'glow') continue; // skip color obj noise (extra safety)
    if (m[4]) out[key] = '<NESTED>';
    else out[key] = m[2] !== undefined ? m[2] : m[3];
  }
  return out;
}

const en = parseKeys(enRaw);
const ru = parseKeys(ruRaw);

const enKeys = new Set(Object.keys(en));
const ruKeys = new Set(Object.keys(ru));

// --- Compare ---
const missingInRu = [...enKeys].filter(k => !ruKeys.has(k)).sort();
const missingInEn = [...ruKeys].filter(k => !enKeys.has(k)).sort();

// Untranslated: RU value is identical to EN value AND value contains [a-zA-Z]
const untranslated = [];
for (const k of enKeys) {
  if (!ruKeys.has(k)) continue;
  const ev = en[k], rv = ru[k];
  if (ev === '<NESTED>' || rv === '<NESTED>') continue;
  if (!ev || !rv) continue;
  // Strip emojis/symbols, then check for shared latin word
  if (ev === rv && /[a-zA-Z]{3,}/.test(ev)) {
    untranslated.push({ key: k, value: ev });
  }
}

// --- Find all t('key') calls in the file ---
const tCallRe = /\bt\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g;
const tCalls = new Set();
let mm;
while ((mm = tCallRe.exec(html))) tCalls.add(mm[1]);

// Also t(difficulty) etc — variable, can't statically check but flag
const dynamicTRe = /\bt\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)/g;
const dynamicCount = (html.match(dynamicTRe) || []).length;

const usedNotDefined = [...tCalls].filter(k => !enKeys.has(k)).sort();
const definedNotUsed = [...enKeys].filter(k => !tCalls.has(k)).sort();

// --- Report ---
console.log('='.repeat(60));
console.log('TRANSLATION SYNC REPORT');
console.log('='.repeat(60));
console.log(`EN keys: ${enKeys.size}    RU keys: ${ruKeys.size}`);
console.log(`t('...') calls (static): ${tCalls.size}`);
console.log(`t(variable) calls (dynamic, not statically checkable): ${dynamicCount}`);
console.log('');

console.log('— Missing in RU (need translation) —');
if (missingInRu.length === 0) console.log('  ✓ None');
else missingInRu.forEach(k => console.log(`  ${k}: '${en[k]}'`));
console.log('');

console.log('— Missing in EN (orphaned RU keys) —');
if (missingInEn.length === 0) console.log('  ✓ None');
else missingInEn.forEach(k => console.log(`  ${k}: '${ru[k]}'`));
console.log('');

console.log('— Untranslated (RU value identical to EN) —');
if (untranslated.length === 0) console.log('  ✓ None');
else untranslated.forEach(({key,value}) => console.log(`  ${key}: '${value}'`));
console.log('');

console.log(`— t('key') used but not defined in EN (${usedNotDefined.length}) —`);
if (usedNotDefined.length === 0) console.log('  ✓ None');
else usedNotDefined.forEach(k => console.log(`  ${k}`));
console.log('');

console.log(`— Defined but never used as t('key') (${definedNotUsed.length}, may be used dynamically) —`);
if (definedNotUsed.length === 0) console.log('  ✓ None');
else definedNotUsed.slice(0, 30).forEach(k => console.log(`  ${k}`));
if (definedNotUsed.length > 30) console.log(`  … and ${definedNotUsed.length - 30} more`);
