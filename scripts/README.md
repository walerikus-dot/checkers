# Scan Scripts

Quick-and-dirty Node.js scanners that audit `index.html` (the canonical
standalone game client) for common issues. They read text, not parse,
so they're fast and dependency-free.

| Script                   | Purpose                                                           |
|--------------------------|-------------------------------------------------------------------|
| `find-handlers.js`       | List inline `onclick=`/`onpointerdown=`/etc. handlers and flag any whose target function isn't defined. |
| `find-ids.js`            | Find duplicate `id="…"` declarations and `getElementById` calls that point at IDs not in the markup. |
| `find-show-calls.js`     | List every `showInfoHint` / `showToast` / `showOverlay` / `_dismissHint` / `drawModalShow` call site. Highlights `showToast` calls that look like hints (candidates to move into the info bar). |
| `find-listeners.js`      | List every `addEventListener(...)` binding grouped by event type. |
| `translation-scan.js`    | (root) Verify EN/RU `TR` parity and find dynamic `t()` calls without keys. |
| `hardcoded-scan.js`      | (root) Find hard-coded English strings in JS that should be wired through `t()`. |

## Usage

```bash
node scripts/find-handlers.js
node scripts/find-ids.js
node scripts/find-show-calls.js
node scripts/find-listeners.js

# Run against a specific file (e.g. admin.html):
node scripts/find-handlers.js admin.html
```

All scripts default to `../index.html` and accept an optional path argument.
Output is plain text, designed to be piped to `head` / `grep` / a file.
