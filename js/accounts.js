import { appState, saveSessionState, clearSessionState, restoreSessionState } from './state.js';
import { executeAdbCommand, wait } from './adb-client.js';
import { log, showToast, updateStatusBadge, navigateTo } from './ui.js';
import { PROTECTED_PACKAGES, KNOWN_OFFENDERS, ACCOUNT_PKG_MAP } from './config.js';

// --- High-Resolution Resilient Vector Brand Icons ---
const ICONS = {
    google: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>`,
    samsung: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#1428A0"><path d="M16.94 13.91c-.12 0-.36 0-.6-.03-.41-.06-.69-.16-.99-.32l.07-.62c.27.15.61.27.97.33.19.03.34.03.41.03.7 0 1.01-.31 1.01-.75 0-.47-.3-.7-1.17-.89l-.41-.08c-1.44-.31-2.31-.84-2.31-1.88 0-1.26 1.02-2.15 2.76-2.15.7 0 1.38.11 1.98.34l-.21.61c-.49-.18-1.06-.29-1.68-.29-.63 0-.95.29-.95.69 0 .42.33.64 1.16.82l.4.08c1.56.34 2.34.92 2.34 1.93 0 1.38-1.09 2.18-2.78 2.18m-5.34-.07H9.72V7.63h3.96v.61H11.6v2.11h1.79v.61H11.6v2.89M22 10.73C22 14.63 17.53 17.8 12 17.8C6.47 17.8 2 14.63 2 10.73C2 6.83 6.47 3.66 12 3.66C17.53 3.66 22 6.83 22 10.73Z"/></svg>`,
    microsoft: `<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>`,
    whatsapp: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#25D366"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.04 7.58C8.86 7.58 8.56 7.65 8.31 7.92C8.06 8.19 7.36 8.85 7.36 10.2C7.36 11.55 8.34 12.85 8.48 13.04C8.62 13.23 10.4 15.96 13.12 17.14C15.38 18.12 15.84 17.92 16.33 17.87C16.82 17.83 17.91 17.22 18.14 16.58C18.37 15.94 18.37 15.39 18.3 15.28C18.23 15.17 18.05 15.1 17.77 14.96C17.49 14.82 16.14 14.16 15.89 14.07C15.64 13.98 15.46 13.93 15.27 14.21C15.09 14.49 14.56 15.1 14.4 15.28C14.24 15.46 14.08 15.49 13.8 15.35C13.52 15.21 12.63 14.92 11.58 13.98C10.76 13.25 10.21 12.35 10.05 12.07C9.89 11.79 10.03 11.64 10.17 11.5C10.3 11.37 10.46 11.16 10.6 11C10.74 10.84 10.79 10.72 10.88 10.54C10.97 10.36 10.93 10.2 10.86 10.06C10.79 9.92 10.24 8.57 10.01 8.03C9.79 7.5 9.56 7.57 9.4 7.56C9.23 7.56 9.04 7.58 9.04 7.58Z"/></svg>`,
    telegram: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#24A1DE"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/></svg>`,
    xiaomi: `<svg viewBox="0 0 24 24" width="22" height="22"><rect width="24" height="24" rx="5" fill="#FF6900"/><path fill="#FFF" d="M7 8.5h3.2v7H7v-7zm6.8 0h3.2v7h-3.2v-7zm-4.6 2.3h2.6v4.7H9.2v-4.7z"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
    huawei: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#CF0A2C"><path d="M12 2c.5 1.5 1.5 3 2.5 4.5C13.5 8 12 9 12 10.5c0-1.5-1.5-2.5-2.5-4C10.5 5 11.5 3.5 12 2zm4 4c.8 1.4 1.8 2.8 2.8 4-1.2 1.3-2.8 2-3.3 3.5-.4-1.4-1.6-2.3-2-3.8.9-1.2 1.8-2.4 2.5-3.7zm-8 0c.7 1.3 1.6 2.5 2.5 3.7-.4 1.5-1.6 2.4-2 3.8-.5-1.5-2.1-2.2-3.3-3.5 1-1.2 2-2.6 2.8-4zm11 6.5c1 1.2 2 2.3 3 3.5-1.5.8-3.2 1.2-4 2.5-.2-1.5-1.1-2.7-1.3-4.2 1-.5 1.8-1.1 2.3-1.8zm-14 0c.5.7 1.3 1.3 2.3 1.8-.2 1.5-1.1 2.7-1.3 4.2-.8-1.3-2.5-1.7-4-2.5 1-1.2 2-2.3 3-3.5z"/></svg>`,
    work: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#5C6BC0"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>`,
    email: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#FB8C00"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
    generic: `<svg viewBox="0 0 24 24" width="22" height="22" fill="#90A4AE"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z"/></svg>`
};

export function getAccountVisuals(type) {
    const t = (type || '').toLowerCase();
    
    if (t.includes('google') || t.includes('gmail')) {
        return { label: 'Google', brandName: 'חשבון Google', html: ICONS.google, class: 'acc-google', canBypass: true };
    }
    if (t.includes('samsung') || t.includes('osp')) {
        return { label: 'Samsung', brandName: 'חשבון Samsung', html: ICONS.samsung, class: 'acc-samsung', canBypass: true };
    }
    if (t.includes('microsoft') || t.includes('outlook') || t.includes('azure') || t.includes('skydrive') || t.includes('teams')) {
        return { label: 'Microsoft', brandName: 'חשבון Microsoft', html: ICONS.microsoft, class: 'acc-microsoft', canBypass: true };
    }
    if (t.includes('whatsapp')) {
        return { label: 'WhatsApp', brandName: 'חשבון WhatsApp', html: ICONS.whatsapp, class: 'acc-whatsapp', canBypass: true };
    }
    if (t.includes('telegram') || t.includes('challegram')) {
        return { label: 'Telegram', brandName: 'חשבון Telegram', html: ICONS.telegram, class: 'acc-telegram', canBypass: true };
    }
    if (t.includes('xiaomi') || t.includes('miui')) {
        return { label: 'Xiaomi', brandName: 'חשבון Xiaomi Mi', html: ICONS.xiaomi, class: 'acc-xiaomi', canBypass: true };
    }
    if (t.includes('facebook') || t.includes('messenger') || t.includes('instagram')) {
        return { label: 'Meta', brandName: 'חשבון Meta / Facebook', html: ICONS.facebook, class: 'acc-facebook', canBypass: true };
    }
    if (t.includes('huawei') || t.includes('hwid')) {
        return { label: 'Huawei', brandName: 'חשבון Huawei ID', html: ICONS.huawei, class: 'acc-huawei', canBypass: true };
    }
    if (t.includes('work') || t.includes('knox') || t.includes('enterprise') || t.includes('mdm')) {
        return { label: 'Work Profile', brandName: 'פרופיל עבודה / ארגוני', html: ICONS.work, class: 'acc-work', canBypass: false };
    }
    if (t.includes('mail') || t.includes('exchange') || t.includes('pop3') || t.includes('imap')) {
        return { label: 'Email', brandName: 'חשבון דוא"ל ארגוני', html: ICONS.email, class: 'acc-exchange', canBypass: true };
    }

    const cleanType = type ? type.replace(/^com\./, '').split('.').slice(-2).join('.') : 'חשבון נוסף';
    return { label: cleanType, brandName: cleanType, html: ICONS.generic, class: 'acc-unknown', canBypass: true };
}

// --- Dynamic Parser Helpers ---

/**
 * Fetch account dump output from dumpsys account
 */
export async function getAccountDump() {
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
export function parseActiveAccounts(rawOutput) {
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
export function parseAuthenticatorMapping(dumpsysOutput) {
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
export async function getInstalledPackages() {
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
export function resolvePackageForAccount(accountType, authMap, installedPackages) {
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

/**
 * Computes preview information for bypass modal
 */
export async function getBypassPreview() {
    const rawDump = await getAccountDump();
    const activeAccounts = parseActiveAccounts(rawDump);
    if (activeAccounts.length === 0) {
        return { accounts: [], packages: [], isBlockedSdk14: (appState.sdkVersion || 0) >= 34 };
    }

    const installedPackages = await getInstalledPackages();
    const authMap = parseAuthenticatorMapping(rawDump);
    const packagesToDisable = new Set();
    let hasGoogleAccount = false;
    let hasSamsungAccount = false;

    for (const acc of activeAccounts) {
        if (acc.type.toLowerCase().includes('google')) hasGoogleAccount = true;
        if (acc.type.toLowerCase().includes('samsung') || acc.type.toLowerCase().includes('osp')) hasSamsungAccount = true;

        const pkg = resolvePackageForAccount(acc.type, authMap, installedPackages);
        if (pkg && !PROTECTED_PACKAGES.some(p => pkg === p || pkg.startsWith(p + '.'))) {
            packagesToDisable.add(pkg);
        }
    }

    if (hasGoogleAccount) {
        ['com.google.android.gms', 'com.google.android.gsf', 'com.google.android.apps.tachyon', 'com.google.android.gm'].forEach(p => {
            if (installedPackages.has(p) && !PROTECTED_PACKAGES.includes(p)) packagesToDisable.add(p);
        });
    }

    if (hasSamsungAccount) {
        ['com.samsung.android.mobileservice', 'com.osp.app.signin', 'com.samsung.android.scloud', 'com.samsung.android.authfw', 'com.samsung.android.coreapps'].forEach(p => {
            if (installedPackages.has(p) && !PROTECTED_PACKAGES.includes(p)) packagesToDisable.add(p);
        });
    }

    for (const off of KNOWN_OFFENDERS) {
        if (installedPackages.has(off) && !PROTECTED_PACKAGES.includes(off)) {
            packagesToDisable.add(off);
        }
    }

    return {
        accounts: activeAccounts,
        packages: Array.from(packagesToDisable),
        isBlockedSdk14: (appState.sdkVersion || 0) >= 34
    };
}

// --- Public Operations ---

export async function checkAccounts() {
    if (!appState.adbConnected) return showToast("ADB לא מחובר");
    
    const listDiv = document.getElementById('account-list');
    const heroStatus = document.getElementById('account-hero-status');
    const heroTitle = document.getElementById('account-hero-title');
    const heroDesc = document.getElementById('account-hero-desc');
    const heroIcon = document.getElementById('account-hero-icon');
    const bypassBtn = document.getElementById('btn-bypass-trigger');
    const nextBtn = document.getElementById('btn-next-acc');
    const stepsGuide = document.getElementById('account-steps-guide');
    
    updateStatusBadge('account-status', '<span class="spin-icon material-symbols-rounded">sync</span> בודק חשבונות...', '');
    if (heroStatus) heroStatus.className = 'account-hero-card checking';
    if (heroTitle) heroTitle.textContent = 'סורק חשבונות פעילים במכשיר...';
    if (heroDesc) heroDesc.textContent = 'מבצע בדיקת עומק של חשבונות המערכת דרך ADB';
    if (heroIcon) heroIcon.textContent = 'sync';
    
    if (bypassBtn) bypassBtn.style.display = 'none';
    if (listDiv) listDiv.innerHTML = '<div class="account-skeleton-loader"><div class="skeleton-row"></div><div class="skeleton-row"></div></div>';

    try {
        const rawDump = await getAccountDump();
        const accounts = parseActiveAccounts(rawDump);
        const isSdk14 = (appState.sdkVersion || 0) >= 34;

        if (accounts.length === 0) {
            updateStatusBadge('account-status', '<span class="material-symbols-rounded">check_circle</span> מכשיר נקי', 'success');
            if (nextBtn) nextBtn.disabled = false;
            appState.accountsClean = true;
            
            if (heroStatus) heroStatus.className = 'account-hero-card clean';
            if (heroTitle) heroTitle.textContent = 'המכשיר נקי מחשבונות!';
            if (heroDesc) heroDesc.textContent = 'לא זוהו חשבונות חוסמים. ניתן להמשיך ישירות לשלב ההתקנה.';
            if (heroIcon) heroIcon.textContent = 'verified_user';
            if (stepsGuide) stepsGuide.style.display = 'none';

            if (listDiv) {
                listDiv.innerHTML = `
                    <div class="account-clean-state">
                        <div class="clean-badge-icon">
                            <span class="material-symbols-rounded">check_circle</span>
                        </div>
                        <div class="clean-title">המכשיר נקי מחשבונות ומוכן להמשך</div>
                        <div class="clean-subtitle">נקי מחשבונות - אין חשבונות פעילים שחוסמים את הגדרת מנהל המכשיר (Device Owner).</div>
                    </div>
                `;
            }
        } else {
            updateStatusBadge('account-status', `<span class="material-symbols-rounded">warning</span> נמצאו ${accounts.length} חשבונות`, 'error');
            appState.accountsClean = false;
            if (nextBtn) nextBtn.disabled = true;
            if (stepsGuide) stepsGuide.style.display = 'block';

            if (heroStatus) heroStatus.className = `account-hero-card ${isSdk14 ? 'blocked-sdk14' : 'detected'}`;
            if (heroTitle) heroTitle.textContent = `זוהו ${accounts.length} חשבונות פעילים במכשיר`;
            if (heroDesc) {
                if (isSdk14) {
                    heroDesc.innerHTML = `<strong>Android 14+ מזוהה:</strong> מטעמי אבטחה של גוגל, נדרשת הסרה ידנית של החשבונות בהגדרות המכשיר לפני ההתקנה.`;
                } else {
                    heroDesc.textContent = `הסר את החשבונות בהגדרות המכשיר, או השתמש במצב עקיפה זמנית (Beta).`;
                }
            }
            if (heroIcon) heroIcon.textContent = isSdk14 ? 'gpp_maybe' : 'manage_accounts';

            // Show bypass button
            if (bypassBtn) {
                bypassBtn.style.display = 'inline-flex';
                if (isSdk14) {
                    bypassBtn.classList.add('btn-calm-info');
                    bypassBtn.innerHTML = `<span class="material-symbols-rounded">info</span> למה נדרשת הסרה ידנית?`;
                } else {
                    bypassBtn.classList.remove('btn-calm-info');
                    bypassBtn.innerHTML = `<span class="material-symbols-rounded">auto_fix_high</span> התקנה ללא הסרה (Beta)`;
                }
            }

            let html = '';
            accounts.forEach(acc => {
                const vis = getAccountVisuals(acc.type);
                const isWork = !vis.canBypass;
                const statusTag = isSdk14
                    ? '<span class="acc-tag tag-manual">נדרשת הסרה</span>'
                    : (isWork ? '<span class="acc-tag tag-manual">חובה להסיר ידנית</span>' : '<span class="acc-tag tag-bypassable">ניתן לעקיפה</span>');

                html += `
                    <div class="account-card ${vis.class}">
                        <div class="account-icon-wrapper">${vis.html}</div>
                        <div class="account-info">
                            <div class="account-header-line">
                                <span class="account-name" title="${acc.name}">${acc.name}</span>
                                ${statusTag}
                            </div>
                            <div class="account-type">
                                <span>${vis.brandName}</span>
                                <span class="type-pill">${acc.type}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            if (listDiv) listDiv.innerHTML = html;
        }
    } catch (e) {
        showToast("שגיאה בבדיקת החשבונות");
        console.error(e);
        if (heroStatus) heroStatus.className = 'account-hero-card error';
        if (heroTitle) heroTitle.textContent = 'שגיאה בסריקת חשבונות';
        if (heroDesc) heroDesc.textContent = 'וודא שהמכשיר מחובר ופתוח לניפוי באגים.';
        if (heroIcon) heroIcon.textContent = 'error';
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