# Dev Pass Vault — Session Development Notes

## Overview
Built a Chrome + Firefox browser extension for quickly filling login forms in development environments. Personal use, no encryption, optimized for speed and 2000+ credentials.

---

## Architecture Decisions

### Manifest V3 (Cross-browser)
- Used MV3 which is the current standard for both Chrome and Firefox (109+)
- Chrome uses `background.service_worker`
- Firefox uses `background.scripts` (older versions don't support service_worker)
- **Solution:** Both keys present in manifest — Chrome uses `service_worker`, Firefox uses `scripts`
- No `type: "module"` in background (Firefox compatibility) — all utility code inlined into service-worker.js

### No Encryption
- Intentional decision — dev environment use only
- Plaintext storage in `chrome.storage.local`
- No master password, no hashing
- Tradeoff: faster access, simpler code, suitable for dev-only credentials

### No Build Tools
- Zero dependencies, no webpack/rollup/vite
- Plain JS, CSS, HTML
- Works directly as unpacked extension
- Avoids ES module `import` statements in content scripts and background (browser compat)

---

## File Structure

```
dev_pass_vault_extention/
├── manifest.json                  # MV3 config, both Chrome+Firefox
├── icons/
│   ├── icon.svg                   # Source SVG
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── src/
│   ├── background/
│   │   └── service-worker.js      # All backend logic (storage, matcher, settings, context menu)
│   ├── content/
│   │   ├── content.js             # Login detection, FAB, panel, form filler
│   │   └── content.css            # Dark/light themed panel UI (CSS custom properties)
│   └── utils/
│       ├── storage.js             # chrome.storage.local CRUD + import/export (referenced but inlined in bg)
│       ├── matcher.js             # URL matching strategies (referenced, inlined in bg)
│       └── id.js                  # UUID generator (referenced, inlined where needed)
├── popup/
│   ├── popup.html                 # Extension icon click UI
│   ├── popup.js                   # Credential list, inline add/edit form, theme toggle
│   └── popup.css                  # CSS variables, dark/light theme
└── options/
    ├── options.html               # Full credential manager page
    ├── options.js                 # CRUD editor, settings UI, import/export
    └── options.css                # CSS variables, dark/light theme, settings layout
```

---

## Key Features Built

### 1. Floating Action Button (FAB)
- Detects `input[type="password"]` on page — if found, injects FAB
- Position: configurable (right-top, right-center, right-bottom, left-top, left-center, left-bottom)
- Hover (150ms delay) → opens credential panel
- Badge shows count of matching credentials
- MutationObserver watches for SPA/dynamic page changes
- Theme: dark by default, switches with settings

### 2. Credential Panel
- Slides in from FAB side (right or left depending on FAB position)
- Shows URL pill (current domain)
- Lists matching credentials with Fill / Fill+Go / ✎ Edit buttons
- `+` button → inline Add dialog
- `✎` button → inline Edit dialog (pre-filled)
- "Manage All →" → opens Options page

### 3. Form Filling
- Finds `input[type="password"]` and associated username/email field
- Heuristic username detection: checks name/id/placeholder/autocomplete attributes
- **React/Vue compatible**: uses `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` native setter
- Dispatches `input` and `change` events after setting value
- Fill: fills only
- Fill+Go: fills + clicks submit button (120ms delay)

### 4. URL Matching (5 strategies)
| Type | Description | Example |
|------|-------------|---------|
| domain | hostname:port match | `localhost:3000` |
| exact | full URL match (no hash) | `http://localhost:3000/login` |
| prefix | URL starts with | `https://staging.example.com` |
| contains | URL contains string | `internal.company` |
| wildcard | glob pattern (`*`, `**`) | `*.example.com/admin/**` |

### 5. Auto-Save Prompt
- Detects form submit (form submit event + submit button click)
- Captures username + password before navigation
- Stores in `sessionStorage` for cross-page navigation
- On new page load: checks sessionStorage, shows toast if credentials are new
- Toast auto-dismisses after 15 seconds
- Position: configurable (6 positions)

### 6. Settings
| Setting | Options |
|---------|---------|
| Theme | Dark / Light |
| FAB Position | right-center, right-top, right-bottom, left-center, left-top, left-bottom |
| Save Prompt Position | top-right, top-left, top-center, bottom-right, bottom-left, bottom-center |
| Auto-detect Logins | on / off |

### 7. Inline Add/Edit in Popup & FAB Panel
- Both popup and FAB panel have full inline add/edit
- Fields: label, username, password (👁 toggle), tags, notes, URL rules (dynamic add/remove)
- Edit mode: pre-fills all fields, shows Delete button with confirm
- URL rules: multiple rules per credential, add/remove dynamically

### 8. Options Page (Full Manager)
- Sidebar: credential list with search, import/export, stats
- Tabs: Credentials | Settings
- Editor: full form with URL rule editor
- JSON export (timestamped filename)
- JSON import (merge, skips duplicates by ID)
- Theme persists across all extension pages

---

## CSS Architecture

### Content Script (on-page elements)
- Uses CSS custom properties (`--dpv-*`) scoped to `#dpv-fab`, `#dpv-panel`, `#dpv-save-prompt`
- Light theme: `[data-theme="light"]` attribute selector
- Variables cascade to all child elements
- Isolates from host page styles (no `:root` usage)

### Popup & Options
- CSS custom properties on `:root`
- Light theme: `[data-theme="light"]` on `<html>` element
- Set via `document.documentElement.setAttribute('data-theme', ...)`

---

## Known Limitations / Future Ideas
- No sync across devices (uses `local` not `sync` storage — sync has 8KB/item limit)
- Wildcard matching uses simplified glob (no character classes)
- Auto-save prompt may not work on sites with custom form submit (e.g., XHR without form element) — sessionStorage fallback handles most cases
- No TOTP/2FA support
- No password generator

---

## Commits

| Hash | Description |
|------|-------------|
| `b4f4cbd` | Initial release — full extension with all core features |
| `7d7ac1d` | Add inline add-credential form to popup with tags and notes |
| `ad96649` | Add inline edit and delete to popup |
| `9d57c48` | Add inline edit and delete to FAB floating panel |
