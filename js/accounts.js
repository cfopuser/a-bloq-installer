import { appState, saveSessionState, clearSessionState, restoreSessionState } from './state.js';
import { executeAdbCommand, wait } from './adb-client.js';
import { log, showToast, updateStatusBadge, navigateTo } from './ui.js';
import { PROTECTED_PACKAGES, KNOWN_OFFENDERS, ACCOUNT_PKG_MAP } from './config.js';

// --- Visual Helpers (ICONS) ---
const ICONS = {
    google: '<svg viewBox="0 0 24 24"><path d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" /></svg>',
    samsung: '<svg viewBox="0 0 24 24"><path d="M16.94 13.91C16.82 13.91 16.58 13.91 16.34 13.88C15.93 13.82 15.65 13.72 15.35 13.56L15.42 12.94C15.69 13.09 16.03 13.21 16.39 13.27C16.58 13.3 16.73 13.3 16.8 13.3C17.5 13.3 17.81 12.99 17.81 12.55C17.81 12.08 17.51 11.85 16.64 11.66L16.23 11.58C14.79 11.27 13.92 10.74 13.92 9.7C13.92 8.44 14.94 7.55 16.68 7.55C17.38 7.55 18.06 7.66 18.66 7.89L18.45 8.5C17.96 8.32 17.39 8.21 16.77 8.21C16.14 8.21 15.82 8.5 15.82 8.9C15.82 9.32 16.15 9.54 16.98 9.72L17.38 9.8C18.94 10.14 19.72 10.72 19.72 11.73C19.72 13.11 18.63 13.91 16.94 13.91M11.6 13.84H9.72V7.63H13.68V8.24H11.6V10.35H13.39V10.96H11.6V13.84M22 10.73C22 14.63 17.53 17.8 12 17.8C6.47 17.8 2 14.63 2 10.73C2 6.83 6.47 3.66 12 3.66C17.53 3.66 22 6.83 22 10.73Z" /></svg>',
    generic: '<span class="material-symbols-rounded">cloud</span>'
};

function getAccountVisuals(type) {
    const t = (type || '').toLowerCase();
    if (t.includes('google') || t.includes('gmail')) return { label: 'Google', html: ICONS.google, class: 'acc-google' };
    if (t.includes('samsung') || t.includes('osp')) return { label: 'Samsung', html: ICONS.samsung, class: 'acc-samsung' };
    if (t.includes('xiaomi') || t.includes('miui')) return { label: 'Xiaomi', html: ICONS.generic, class: 'acc-unknown' };
    if (t.includes('microsoft') || t.includes('outlook')) return { label: 'Microsoft', html: ICONS.generic, class: 'acc-unknown' };
    if (t.includes('whatsapp')) return { label: 'WhatsApp', html: ICONS.generic, class: 'acc-unknown' };
    return { label: type, html: ICONS.generic, class: 'acc-unknown' };
}

// --- Dynamic Parser Helpers ---

/**
 * Fetch account dump output from dumpsys account
 */
async function getAccountDump() {
    let output = "";
    try {
        output = await executeAdbCommand("dumpsys account", "Deep Dump", true);
    } catch (e) {
        console.warn("dumpsys account query error:", e);
    }
    return output;
}

/**
 * Parse active account entries from ADB dumpsys output
 * Returns Array<{ name: string, type: string }>
 */
function parseActiveAccounts(rawOutput) {
    const unique = new Map();
    if (!rawOutput) return [];

    // Pattern 1: Account {name=foo@gmail.com, type=com.google}
    const accountRegex = /Account\s*\{?\s*name[=:]\s*([^\s,]+)[^}]*?type[=:]\s*([^\s,}]+)/gi;
    for (const m of rawOutput.matchAll(accountRegex)) {
        if (m[1] && m[2]) {
            const name = m[1].trim();
            const type = m[2].trim();
            unique.set(`${name}|${type}`, { name, type });
        }
    }

    // Pattern 2: Generic fallback regex for lines like: name=user@test.com, type=com.google
    if (unique.size === 0) {
        const fallbackRegex = /name=([^\s,]+)[^}]*?type=([^\s}]+)/gi;
        for (const m of rawOutput.matchAll(fallbackRegex)) {
            if (m[1] && m[2]) {
                const name = m[1].trim();
                const type = m[2].trim();
                unique.set(`${name}|${type}`, { name, type });
            }
        }
    }

    return Array.from(unique.values());
}

/**
 * Extract type -> packageName mapping dynamically from dumpsys account
 */
function parseAuthenticatorMapping(dumpsysOutput) {
    const map = new Map();
    if (!dumpsysOutput) return map;

    // Pattern 1: AuthenticatorDescription {type=com.google, packageName=com.google.android.gms, ...}
    const descRegex = /AuthenticatorDescription\s*\{\s*type=([^,\s]+),\s*packageName=([^,\s]+)/gi;
    for (const match of dumpsysOutput.matchAll(descRegex)) {
        if (match[1] && match[2]) {
            map.set(match[1].trim(), match[2].trim());
        }
    }

    // Pattern 2: ComponentInfo{com.pkg.name/...} ... type=com.pkg.type
    const serviceRegex = /ComponentInfo\{([^\/\}]+)\/[^\}]+\}[\s\S]{1,400}?type=([^\s,]+)/gi;
    for (const match of dumpsysOutput.matchAll(serviceRegex)) {
        if (match[1] && match[2]) {
            const pkg = match[1].trim();
            const type = match[2].trim();
            if (!map.has(type)) {
                map.set(type, pkg);
            }
        }
    }

    return map;
}

/**
 * Get Set of all installed packages on device
 */
async function getInstalledPackages() {
    const set = new Set();
    try {
        const out = await executeAdbCommand("pm list packages", "Get Installed Packages", true);
        const lines = out.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("package:")) {
                set.add(trimmed.substring(8).trim());
            }
        }
    } catch (e) {
        console.warn("Failed to get installed packages:", e);
    }
    return set;
}

/**
 * Resolve the backing package for an account type using multi-tier strategies
 */
function resolvePackageForAccount(accountType, authMap, installedPackages) {
    if (!accountType) return null;

    // 1. Dynamic authenticator map from dumpsys
    if (authMap.has(accountType)) {
        const pkg = authMap.get(accountType);
        if (installedPackages.size === 0 || installedPackages.has(pkg)) {
            return pkg;
        }
    }

    // 2. Curated mapping
    if (ACCOUNT_PKG_MAP[accountType]) {
        const pkg = ACCOUNT_PKG_MAP[accountType];
        if (installedPackages.size === 0 || installedPackages.has(pkg)) {
            return pkg;
        }
    }

    // 3. Direct match: account type is itself an installed package
    if (installedPackages.has(accountType)) {
        return accountType;
    }

    // 4. Stem matching: Check if account type starts with an installed package (e.g. com.outfit7.talkingtomgoldrun.account -> com.outfit7.talkingtomgoldrun)
    for (const pkg of installedPackages) {
        if (accountType === pkg || accountType.startsWith(pkg + '.')) {
            return pkg;
        }
    }

    // 5. Strip common suffixes (.account, .sync, .login, .auth, .provider) and test
    const stripped = accountType.replace(/\.(account|sync|login|auth|provider|exchange|pop3|legacyimap)$/i, '');
    if (installedPackages.has(stripped)) {
        return stripped;
    }

    // 6. Substring match across packages
    for (const pkg of installedPackages) {
        if (pkg.startsWith(stripped)) {
            return pkg;
        }
    }

    // Fallback: if accountType looks like a package (contains dots)
    if (accountType.includes('.')) {
        return accountType;
    }

    return null;
}

// --- Public Operations ---

export async function checkAccounts() {
    if (!appState.adbConnected) return showToast("ADB לא מחובר");
    
    const listDiv = document.getElementById('account-list');
    const bypassBtn = document.getElementById('btn-bypass-trigger');
    const nextBtn = document.getElementById('btn-next-acc');
    
    updateStatusBadge('account-status', 'בודק...', '');
    if (bypassBtn) bypassBtn.style.display = 'none';
    if (listDiv) listDiv.innerHTML = '';

    try {
        const rawDump = await getAccountDump();
        const accounts = parseActiveAccounts(rawDump);

        if (accounts.length === 0) {
            updateStatusBadge('account-status', 'מכשיר נקי', 'success');
            if (nextBtn) nextBtn.disabled = false;
            appState.accountsClean = true;
            if (listDiv) {
                listDiv.innerHTML = `<div style="text-align:center; padding:20px; color:#81C784;"><span class="material-symbols-rounded">check_circle</span><p>נקי מחשבונות</p></div>`;
            }
        } else {
            updateStatusBadge('account-status', `נמצאו ${accounts.length} חשבונות`, 'error');
            
            // Show bypass button (Note: block SDK 34+ when clicked)
            if (bypassBtn) bypassBtn.style.display = 'inline-flex';
            
            appState.accountsClean = false;
            if (nextBtn) nextBtn.disabled = true;

            let html = '';
            accounts.forEach(acc => {
                const vis = getAccountVisuals(acc.type);
                html += `<div class="account-card ${vis.class}"><div class="account-icon-wrapper">${vis.html}</div><div class="account-info"><div class="account-name">${acc.name}</div><div class="account-type">${vis.label} (${acc.type})</div></div></div>`;
            });
            if (listDiv) listDiv.innerHTML = html;
        }
    } catch (e) {
        showToast("שגיאה בבדיקה");
        console.error(e);
    }
}

export async function runAccountBypass() {
    if (!appState.adbConnected) return;

    // Block on Android 14+ (SDK >= 34)
    if (appState.sdkVersion >= 34) {
        showToast("פעולה זו אינה זמינה באנדרואיד 14+");
        const warnBox = document.getElementById('bypass-warning');
        if (warnBox) warnBox.style.display = 'none';
        return;
    }

    const warnBox = document.getElementById('bypass-warning');
    if (warnBox) warnBox.style.display = 'none';
    updateStatusBadge('account-status', 'מבצע השבתה...', '');

    try {
        log("סורק חשבונות פעילים במכשיר...", 'info');
        const rawDump = await getAccountDump();
        const activeAccounts = parseActiveAccounts(rawDump);

        if (activeAccounts.length === 0) {
            appState.accountsClean = true;
            showToast("המכשיר כבר נקי מחשבונות");
            navigateTo('page-update', 3);
            return;
        }

        log("מאתר חבילות שירותי אימות...", 'info');
        const installedPackages = await getInstalledPackages();
        const authMap = parseAuthenticatorMapping(rawDump);

        const packagesToDisable = new Set();
        let hasGoogleAccount = false;
        let hasSamsungAccount = false;

        // 1. Resolve packages for each active account
        for (const acc of activeAccounts) {
            if (acc.type.toLowerCase().includes('google')) hasGoogleAccount = true;
            if (acc.type.toLowerCase().includes('samsung') || acc.type.toLowerCase().includes('osp')) hasSamsungAccount = true;

            const pkg = resolvePackageForAccount(acc.type, authMap, installedPackages);
            if (pkg) {
                // Pre-flight safety: Check if protected
                if (PROTECTED_PACKAGES.some(p => pkg === p || pkg.startsWith(p + '.'))) {
                    log(`חבילת מערכת מוגנת זוהתה: ${pkg} עבור חשבון ${acc.name}. חובה להסיר ידנית.`, 'warn');
                } else {
                    packagesToDisable.add(pkg);
                }
            } else {
                log(`לא נמצאה חבילה עבור סוג החשבון: ${acc.type}`, 'warn');
            }
        }

        // Add companion Google services if Google account is present
        if (hasGoogleAccount) {
            ['com.google.android.gms', 'com.google.android.gsf', 'com.google.android.apps.tachyon', 'com.google.android.gm'].forEach(p => {
                if (installedPackages.has(p) && !PROTECTED_PACKAGES.includes(p)) packagesToDisable.add(p);
            });
        }

        // Add companion Samsung services if Samsung account is present
        if (hasSamsungAccount) {
            ['com.samsung.android.mobileservice', 'com.osp.app.signin', 'com.samsung.android.scloud', 'com.samsung.android.authfw', 'com.samsung.android.coreapps'].forEach(p => {
                if (installedPackages.has(p) && !PROTECTED_PACKAGES.includes(p)) packagesToDisable.add(p);
            });
        }

        // 2. Also check Known Offenders
        for (const off of KNOWN_OFFENDERS) {
            if (installedPackages.has(off) && !PROTECTED_PACKAGES.includes(off)) {
                packagesToDisable.add(off);
            }
        }

        if (packagesToDisable.size === 0) {
            showToast("לא נמצאו רכיבים שניתן להשבית אוטומטית. נדרשת הסרה ידנית.");
            log("לא נמצאו חבילות יעד להשבתה אוטומטית.", 'error');
            await checkAccounts();
            return;
        }

        log(`משבית ${packagesToDisable.size} רכיבים באופן זמני...`, 'info');
        let disabledCount = 0;

        for (const pkg of packagesToDisable) {
            if (PROTECTED_PACKAGES.some(p => pkg.startsWith(p))) continue;
            if (appState.disabledPackages.includes(pkg)) continue;

            try {
                await executeAdbCommand(`pm disable-user --user 0 ${pkg}`, `השבתת ${pkg}`);
                appState.disabledPackages.push(pkg);
                saveSessionState();
                disabledCount++;
            } catch (e) {
                log(`שגיאה בהשבתת ${pkg}: ${e.message}`, 'warn');
            }
        }

        // Give Android OS time to update service registrations
        await wait(2000);
        
        appState.accountsClean = true;
        log(`הושבתו ${disabledCount} רכיבים בהצלחה. ממשיך לשלב ההתקנה...`, 'success');
        showToast(`הושבתו ${disabledCount} רכיבים`);
        navigateTo('page-update', 3);

    } catch (e) {
        showToast("שגיאה ב-Bypass: " + e.message);
        log(`שגיאה בתהליך Bypass: ${e.message}`, 'error');
        await restoreAccounts(true);
        await checkAccounts();
    }
}

export async function restoreAccounts(silent = false) {
    if (appState.disabledPackages.length === 0) {
        restoreSessionState();
    }
    
    if (appState.disabledPackages.length === 0) return;

    if (!silent) log("משחזר חשבונות ורכיבים שהושבתו...", 'info');
    
    const pkgs = [...appState.disabledPackages];
    for (const pkg of pkgs) {
        try {
            await executeAdbCommand(`pm enable ${pkg}`, `Restore ${pkg}`, silent);
        } catch (e) {
            console.warn(`Failed to re-enable ${pkg}:`, e);
        }
    }

    clearSessionState();
    if (!silent) log("כל הרכיבים שוחזרו בהצלחה", 'success');
}