# Agent Instructions: a-bloq-installer

This repository contains a static, WebUSB/WebADB-based web installer for the A-Bloq MDM solution (`com.secureguard.mdm`).

---

## ⚡ Crucial Quirks (Would Miss Without Help)

### 1. WebUSB / Local Execution
- **Secure Context Required**: The WebUSB APIs (`navigator.usb`) will **fail** if the site is accessed via `file:///` URLs or insecure non-localhost HTTP.
- **How to run locally**: Start an HTTP server on `localhost` (e.g., `python -m http.server 8080` in the `a-bloq-installer` directory) and access it via `http://localhost:8080`.

### 2. Architecture & Bundling
- **No Build Step**: This is a pure static site using Vanilla CSS (`css/styles.css`) and Native ES Modules (`type="module"` in `index.html`). Do not add build scripts or bundlers unless requested.
- **WebADB Library**: `js/webadb.js` is a third-party library ignored by `.gitignore`. Do not delete or modify it.

### 3. Update Flow & Navigation Quirks
- **Web Updates Disabled by Default**: `CONFIG.ENABLE_WEB_UPDATE` is `false` in [config.js](file:///c:/Users/User/Documents/Projects/abloq-installer/a-bloq-installer/js/config.js). 
- When disabled, navigating to `page-update` is automatically intercepted in `js/ui.js` and redirected directly to `page-install` (Step 4), skipping the GitHub release download entirely and using `apk/normal.apk`.

### 4. Android 14+ (SDK 34+) Limitations
- **Bypass Restriction**: The automatic account bypass (`runAccountBypass` in `js/accounts.js`) uses `pm disable-user --user 0` to temporarily disable Google/Samsung services. 
- Google blocks this via ADB starting in Android 14 (SDK >= 34). For SDK >= 34, the bypass is blocked in UI and users must manually remove all accounts.

### 5. APK Retrieval
- **Automatic GitHub Workflow**: The GitHub Actions workflow [main.yml](file:///c:/Users/User/Documents/Projects/abloq-installer/a-bloq-installer/.github/workflows/main.yml) runs every 30 minutes to pull the latest release APK from `another-weird-dude/SecureGuardMDM` and commit it directly to `apk/normal.apk`.
- **Multi-Tier Resilient Fetching**: `fetchApkBlobWithFallbacks` in [installer.js](file:///c:/Users/User/Documents/Projects/abloq-installer/a-bloq-installer/js/installer.js) resolves the base-relative local path, fails over to CDN/GitHub raw mirrors (`APK_FALLBACK_URLS`), queries GitHub Releases API, and supports manual `.apk` file selection.
- **Cache Busting & Streaming**: Fetches include `?t=${Date.now()}` and stream via `ReadableStream` to calculate real-time download percentage and byte counters.

---

## 🛠️ Verification & Testing
- Use Google Chrome, Microsoft Edge, or Opera (WebUSB-compatible browsers). Firefox and Safari do not support WebUSB.
- Testing requires a physical Android device connected via USB with "USB Debugging" enabled under Developer Options.


## conversing with the user
converse with the user in english