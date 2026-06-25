# Dev Pass Vault

A lightweight browser extension for quickly filling login forms in development environments. Supports Chrome, Chromium, Brave, and Firefox.

> **Dev-only tool** — credentials are stored in plaintext in browser local storage. Do not use for production/sensitive accounts.

---

## Features

- **Floating lock button** on any login page — hover to see saved credentials
- **One-click fill** or **Fill+Go** (fill + auto-submit)
- **Inline add/edit** from both the floating panel and the extension popup
- **5 URL matching strategies** — domain, exact, prefix, contains, wildcard
- **Auto-save prompt** — detects when you log in and offers to save
- **Dark / Light theme** — toggle from popup header
- **JSON import/export** — backup and restore all credentials
- **2000+ credentials** supported
- **Tags & Notes** on every credential

---

## Installation

### Chrome / Chromium / Brave / Edge

**Load as unpacked (development):**

1. Open `chrome://extensions/` in your browser
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dev_pass_vault_extention` folder
5. The extension icon appears in your toolbar

> **Note:** Chrome/Chromium/Brave block `.crx` installation from outside the Web Store — even with Developer mode on. **Load unpacked** is the only way to use this extension locally in Chromium-based browsers.

---

### Firefox

**Load temporarily (removed on browser restart):**

1. Open `about:debugging` in Firefox
2. Click **This Firefox** (left sidebar)
3. Click **Load Temporary Add-on…**
4. Navigate to the `dev_pass_vault_extention` folder
5. Select `manifest.json`
6. Extension loads and stays until Firefox restarts

**Package as .xpi (permanent install):**

**Method 1 — zip manually:**
```bash
cd dev_pass_vault_extention
zip -r ./dev_pass_vault.xpi . -x "*.git*" -x "*.md" -x "SESSION_NOTES*"
```
Then in Firefox:
1. Open `about:addons`
2. Click the gear icon ⚙ → **Install Add-on From File…**
3. Select `dev_pass_vault.xpi`

> Firefox will warn about unsigned extensions. In **Firefox Developer Edition** or **Firefox Nightly** you can bypass this. In regular Firefox, go to `about:config` and set `xpinstall.signatures.required` to `false`.

**Method 2 — using web-ext (recommended):**
```bash
# Install web-ext tool
npm install -g web-ext

# Run in Firefox for testing (auto-reloads on file change)
cd dev_pass_vault_extention
web-ext run

# Build .xpi package
web-ext build
# Output: web-ext-artifacts/dev_pass_vault-1.0.0.zip (rename to .xpi)

# Lint before submitting
web-ext lint
```

**Publish to Firefox Add-ons (AMO) for self-signed/permanent:**
1. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
2. Submit the `.xpi` as an **Unlisted** add-on (private, no review needed)
3. Download the signed `.xpi` and install permanently

---

## Usage

### First time setup

1. Navigate to any login page — the 🔒 button appears on the right side
2. Hover over the button → panel opens
3. Click **+** to add a credential for this page
4. Fill in username, password, and URL rule (domain auto-filled)
5. Click **Save**

### Filling credentials

- **Hover** the 🔒 button → panel opens with matching credentials
- Click **Fill** → username + password fields are filled
- Click **Fill+Go** → fill + submit the login form automatically

### Managing credentials

**From the floating panel:**
- **+** → add new credential for current page
- **✎** → edit existing credential (pre-filled form)

**From the extension popup (click toolbar icon):**
- **+ Add Credential** → inline form with all fields
- **Edit** button on each item → inline edit form
- **Search** → filter by label, username, tags, or URL

**From the Options page (gear icon in popup):**
- Full credential editor with all URL rules
- **Settings** tab → theme, FAB position, save prompt position
- **Export JSON** → download backup file
- **Import JSON** → merge credentials from backup

### Auto-save

When you log in to a site with new credentials, a toast notification appears asking "Save this password?":
- **Save** → instantly saves with the current domain as URL rule
- **Not Now** → dismiss (won't show again for this login session)

---

## Settings

Open **Options page → Settings tab** or use the **☀/🌙** toggle in the popup.

| Setting | Description | Options |
|---------|-------------|---------|
| Theme | Extension UI appearance | Dark / Light |
| Vault Icon Position | Where the 🔒 FAB appears on login pages | 6 positions (left/right × top/center/bottom) |
| Save Prompt Position | Where "Save password?" toast appears | 6 positions |
| Auto-detect Logins | Show save prompt on new logins | Enabled / Disabled |

---

## URL Rule Types

| Type | Matches | Example |
|------|---------|---------|
| **Domain** | Any page on this hostname:port | `localhost:3000` |
| **Exact URL** | This specific URL only | `http://localhost:3000/admin/login` |
| **URL Prefix** | Any URL starting with this | `https://staging.myapp.com` |
| **Contains** | Any URL containing this string | `internal.company.com` |
| **Wildcard** | Glob pattern (`*` = anything except `/`, `**` = everything) | `*.myapp.com/login/**` |

Each credential can have **multiple URL rules** — useful for the same account on dev/staging/prod.

---

## Import / Export

**Export:**
1. Open Options page
2. Click **Export JSON**
3. A file named `dev-pass-vault-<timestamp>.json` is downloaded

**Import:**
1. Open Options page
2. Click **Import JSON**
3. Select a previously exported `.json` file
4. Duplicates (same ID) are skipped automatically

**JSON format:**
```json
{
  "version": 1,
  "exportedAt": 1234567890,
  "credentials": [
    {
      "id": "uuid",
      "label": "Dev Admin",
      "username": "admin@dev.com",
      "password": "mypassword",
      "notes": "Main dev account",
      "tags": ["dev", "admin"],
      "urlRules": [
        { "type": "domain", "pattern": "localhost:3000" },
        { "type": "domain", "pattern": "staging.myapp.com" }
      ],
      "autoSubmit": false,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

---

## Troubleshooting

**FAB button not showing:**
- Make sure the page has a `<input type="password">` field
- Some pages load the form dynamically — wait a moment or scroll

**Fill not working on React/Vue apps:**
- The extension uses native input value setters which should work
- If not, try clicking the field first, then clicking Fill

**Firefox: "background.service_worker is currently disabled":**
- Already handled — the extension uses `background.scripts` for Firefox compatibility
- Make sure you're loading from `manifest.json` in `about:debugging`

**Credentials not matching:**
- Check the URL rule type — use **Domain** for most cases
- Open the extension popup to see if the credential is listed under "This page"

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Extension API | Chrome Extension Manifest V3 |
| Storage | `chrome.storage.local` (no encryption) |
| UI | Vanilla HTML/CSS/JS — no frameworks |
| Styling | CSS Custom Properties (variables) for theming |
| Build | None — pure unpacked extension |
| Compatibility | Chrome 88+, Firefox 109+, Edge 88+, Brave |
