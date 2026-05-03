/* Find hardcoded English UI strings in index.html that should use t() */
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Strip <style> and <script src=...> blocks but keep inline <script>
let body = html;

// Skip CSS blocks
body = body.replace(/<style[\s\S]*?<\/style>/g, '');

// Look for likely UI text patterns (English words >=3 chars)
const findings = [];

// 1. textContent / innerHTML / title=/placeholder= assignments with English text
const patterns = [
  // textContent='...'
  { re: /\.textContent\s*=\s*['"`]([^'"`\n]{3,80})['"`]/g, label: 'textContent' },
  // innerHTML='...' (only short, likely UI)
  { re: /\.innerHTML\s*=\s*['"`]([^'"`\n<>]{3,80})['"`]/g, label: 'innerHTML' },
  // alert/confirm
  { re: /\b(?:alert|confirm)\(\s*['"`]([^'"`\n]{3,200})['"`]/g, label: 'alert/confirm' },
  // toast(...)
  { re: /\btoast\(\s*['"`]([^'"`\n]{3,200})['"`]/g, label: 'toast' },
];

for (const { re, label } of patterns) {
  let m;
  while ((m = re.exec(body))) {
    const text = m[1];
    // Filter: must contain English words, exclude obvious non-UI (selectors, classnames, etc.)
    if (!/[a-zA-Z]{3,}/.test(text)) continue;
    if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(text)) continue; // single identifier
    if (/^[#.][a-zA-Z]/.test(text)) continue; // CSS selector
    if (/^[\d\s.,:;-]+$/.test(text)) continue; // numbers/punctuation
    if (/^https?:/.test(text)) continue; // URL
    if (/^[\d{}().,;:\s%-]+$/.test(text)) continue; // numeric-ish
    // Find line number
    const lineNum = body.slice(0, m.index).split('\n').length;
    findings.push({ line: lineNum, label, text });
  }
}

// 2. HTML attributes: title="..." placeholder="..." aria-label="..."
const attrPatterns = [
  { re: /\btitle\s*=\s*"([^"\n]{3,80})"/g, label: 'title=' },
  { re: /\bplaceholder\s*=\s*"([^"\n]{3,80})"/g, label: 'placeholder=' },
  { re: /\baria-label\s*=\s*"([^"\n]{3,80})"/g, label: 'aria-label=' },
];
for (const { re, label } of attrPatterns) {
  let m;
  while ((m = re.exec(body))) {
    const text = m[1];
    if (!/[a-zA-Z]{3,}/.test(text)) continue;
    const lineNum = body.slice(0, m.index).split('\n').length;
    findings.push({ line: lineNum, label, text });
  }
}

// 3. Visible button/span/div text in HTML (between tags) — common short labels
// e.g., <button>Save</button>
const tagTextRe = /<(button|span|div|h[1-6]|label|p|a|strong|em)[^>]*>([^<>{]{3,60})<\/\1>/g;
let m;
while ((m = tagTextRe.exec(body))) {
  const text = m[2].trim();
  if (!/[a-zA-Z]{3,}/.test(text)) continue;
  if (/^\s*$/.test(text)) continue;
  // Skip text that's all whitespace and symbols
  if (/^[#$%^&*()_+={}|\\[\]:;"'<>,.?/\s\-—…→←↑↓⏵⏸⏹⏺⚡✨📺💰🏆⬜⬛📋🗑🔊✅❌🔗⏳⏰♛↺]+$/.test(text)) continue;
  const lineNum = body.slice(0, m.index).split('\n').length;
  findings.push({ line: lineNum, label: `<${m[1]}>`, text });
}

// Dedup
const seen = new Set();
const unique = findings.filter(f => {
  const key = f.label + '|' + f.text;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Sort by line
unique.sort((a, b) => a.line - b.line);

console.log('='.repeat(70));
console.log(`HARDCODED ENGLISH STRINGS — ${unique.length} candidates`);
console.log('='.repeat(70));
console.log('Note: many may be intentional (debug logs, error messages, IDs)\n');

unique.forEach(({ line, label, text }) => {
  console.log(`L${String(line).padStart(5)}  ${label.padEnd(15)}  "${text}"`);
});
