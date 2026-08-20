// js/installer.js
import { appState } from './state.js';
import { CONFIG } from './config.js';
import { executeAdbCommand, wait } from './adb-client.js';
import { log, showToast, updateProgress, navigateTo } from './ui.js';
import { restoreAccounts } from './accounts.js';

let apkBlob = null;
let foundRelease = null;

/**
 * Format bytes into human readable format (MB/KB)
 */
function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
}

/**
 * Download a stream with progress reporting
 */
async function downloadStreamWithProgress(resp, onProgress) {
    if (!resp.body || !resp.body.getReader) {
        const blob = await resp.blob();
        if (onProgress) onProgress(blob.size, blob.size);
        return blob;
    }

    const reader = resp.body.getReader();
    const lenHeader = resp.headers.get('Content-Length');
    const totalBytes = lenHeader ? parseInt(lenHeader, 10) : 0;
    let receivedBytes = 0;
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        if (onProgress) {
            onProgress(receivedBytes, totalBytes);
        }
    }

    return new Blob(chunks, { type: 'application/vnd.android.package-archive' });
}

/**
 * Resolve local APK path relative to current document base
 */
function getLocalApkUrl() {
    let base = window.location.href.split('?')[0].split('#')[0];
    if (!base.endsWith('/')) {
        base = base.substring(0, base.lastIndexOf('/') + 1);
    }
    return new URL(CONFIG.APK_LOCAL_PATH, base).href;
}

/**
 * Multi-tier resilient APK fetching
 */
export async function fetchApkBlobWithFallbacks(onProgress) {
    if (apkBlob) return apkBlob;

    const sources = [];

    // 1. Primary: Local relative path
    const localUrl = getLocalApkUrl();
    sources.push({ name: "קובץ מקומי (Local Repo)", url: `${localUrl}?t=${Date.now()}` });

    // 2. Secondary: Configured Fallback URLs (CDN / GitHub raw / release direct)
    if (Array.isArray(CONFIG.APK_FALLBACK_URLS)) {
        CONFIG.APK_FALLBACK_URLS.forEach((u, i) => {
            let label = "גיבוי ענן";
            if (u.includes('jsdelivr')) label = "jsDelivr CDN";
            else if (u.includes('raw.githubusercontent')) label = "GitHub Raw";
            else if (u.includes('releases')) label = "GitHub Releases";
            sources.push({ name: `${label} (${i + 1})`, url: `${u}?t=${Date.now()}` });
        });
    }

    // Try sources sequentially
    for (const source of sources) {
        try {
            log(`טוען מ-${source.name}...`, 'info');
            const resp = await fetch(source.url);
            if (!resp.ok) {
                log(`טעינה מ-${source.name} נכשלה (קוד: ${resp.status})`, 'warn');
                continue;
            }

            // Verify content type is not HTML (which occurs on some 404 pages)
            const ctype = (resp.headers.get('Content-Type') || '').toLowerCase();
            if (ctype.includes('text/html')) {
                log(`התקבלה תשובת HTML לא תקינה מ-${source.name}`, 'warn');
                continue;
            }

            const blob = await downloadStreamWithProgress(resp, (received, total) => {
                if (onProgress) onProgress(received, total, source.name);
            });

            // Sanity check: valid APK should be at least 1MB
            if (blob && blob.size > 1000000) {
                apkBlob = blob;
                appState.apkDownloaded = true;
                log(`הקובץ נטען בהצלחה מ-${source.name} (${formatBytes(blob.size)})`, 'success');
                return apkBlob;
            } else {
                log(`הקובץ שהתקבל קטן מדי (${formatBytes(blob?.size || 0)})`, 'warn');
            }
        } catch (err) {
            log(`שגיאה בגישה ל-${source.name}: ${err.message}`, 'warn');
        }
    }

    // 3. Last Resort: Live lookup against GitHub Releases API
    const ghUsers = [CONFIG.GITHUB_USERNAME, CONFIG.FALLBACK_GITHUB_USERNAME].filter(Boolean);
    for (const user of ghUsers) {
        try {
            log(`מחפש גרסה עדכנית ב-GitHub (${user}/${CONFIG.GITHUB_REPO_NAME})...`, 'info');
            const apiResp = await fetch(`https://api.github.com/repos/${user}/${CONFIG.GITHUB_REPO_NAME}/releases/latest`);
            if (!apiResp.ok) continue;

            const data = await apiResp.json();
            const asset = data.assets && data.assets.find(a => a.name.endsWith('.apk'));
            if (asset) {
                const dlUrl = asset.browser_download_url || asset.url;
                log(`מוריד גרסה רשמית ${data.tag_name}...`, 'info');
                const resp = await fetch(dlUrl);
                if (resp.ok) {
                    const blob = await downloadStreamWithProgress(resp, (received, total) => {
                        if (onProgress) onProgress(received, total, `GitHub Release ${data.tag_name}`);
                    });
                    if (blob && blob.size > 1000000) {
                        apkBlob = blob;
                        appState.apkDownloaded = true;
                        log(`הורד בהצלחה מ-GitHub (${formatBytes(blob.size)})`, 'success');
                        return apkBlob;
                    }
                }
            }
        } catch (ghErr) {
            log(`פנייה ל-GitHub API (${user}) נכשלה: ${ghErr.message}`, 'warn');
        }
    }

    throw new Error("לא ניתן היה להוריד את קובץ ה-APK מאף מקור.");
}

/**
 * Handle manual APK file selection from local filesystem
 */
export function setManualApkFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk')) {
        showToast("יש לבחור קובץ APK בלבד");
        return;
    }

    apkBlob = file;
    appState.apkDownloaded = true;
    log(`נטען קובץ מקומי שנבחר: ${file.name} (${formatBytes(file.size)})`, 'success');
    showToast(`נטען: ${file.name}`);

    const fallbackBox = document.getElementById('manual-apk-box');
    if (fallbackBox) fallbackBox.style.display = 'none';

    // Enable install button if on install page
    const btn = document.getElementById('btn-install-start');
    if (btn) btn.disabled = false;
}

export async function checkForUpdates() {
    const infoText = document.getElementById('update-info-text');
    const btn = document.getElementById('btn-download');

    try {
        const ghUser = CONFIG.GITHUB_USERNAME || CONFIG.FALLBACK_GITHUB_USERNAME;
        const resp = await fetch(`https://api.github.com/repos/${ghUser}/${CONFIG.GITHUB_REPO_NAME}/releases/latest`);
        if (!resp.ok) throw new Error("GitHub Error");
        const data = await resp.json();
        const asset = data.assets && data.assets.find(a => a.name.endsWith('.apk'));
        
        if (asset) {
            foundRelease = asset;
            infoText.innerHTML = `גרסה חדשה: <b>${data.tag_name}</b>`;
            btn.disabled = false;
        } else { throw new Error("No APK"); }
    } catch (e) {
        infoText.innerText = "משתמש בגרסה מובנית.";
        console.error(e);
    }
}

export async function startDownload() {
    if (!foundRelease) return;
    const btn = document.getElementById('btn-download');
    const bar = document.getElementById('dl-progress-bar');
    const statusText = document.getElementById('dl-status-text');
    
    btn.disabled = true;
    document.getElementById('dl-progress-wrapper').style.display = 'block';

    try {
        const downloadUrl = foundRelease.browser_download_url || foundRelease.url;
        const resp = await fetch(downloadUrl);
        if (!resp.ok) throw new Error("Download failed");
        
        apkBlob = await downloadStreamWithProgress(resp, (received, total) => {
            if (total > 0) {
                const percent = Math.round((received / total) * 100);
                if (bar) bar.style.width = percent + "%";
                if (statusText) statusText.innerText = `מוריד... ${formatBytes(received)} / ${formatBytes(total)} (${percent}%)`;
            } else {
                if (statusText) statusText.innerText = `מוריד... ${formatBytes(received)}`;
            }
        });
        
        appState.apkDownloaded = true;
        if (statusText) statusText.innerText = "ההורדה הושלמה!";
        setTimeout(() => navigateTo('page-install', 4), 800);
    } catch (e) {
        showToast("שגיאה בהורדה");
        console.error(e);
        btn.disabled = false;
        if (statusText) statusText.innerText = "שגיאה בהורדה, מנסה מקור חלופי בהמשך.";
    }
}

export async function runInstallation() {
    if (!appState.adbConnected) return showToast("ADB אינו מחובר");
    const btn = document.getElementById('btn-install-start');
    btn.disabled = true;
    updateProgress(0);

    const manualBox = document.getElementById('manual-apk-box');
    if (manualBox) manualBox.style.display = 'none';

    // Ensure phone success screen is hidden during installation
    const successMsg = document.getElementById('phone-success-message');
    if (successMsg) successMsg.style.display = 'none';

    try {
        // 1. Pre-checks: Check current device owner
        log("בודק מנהל מכשיר קיים...", 'info');
        const owner = await executeAdbCommand("dumpsys device_policy", "Check Owner", true);
        if (owner.includes("ComponentInfo") && !owner.includes(CONFIG.TARGET_PACKAGE)) {
            throw new Error("קיים מנהל מכשיר (Device Owner) אחר על המכשיר.");
        }
        
        // 2. Load APK (0% - 35%)
        if (!apkBlob) {
            log("מתחיל בטעינת קובץ ההתקנה...", 'info');
            let lastReportedPercent = -1;
            await fetchApkBlobWithFallbacks((received, total, sourceName) => {
                if (total > 0) {
                    const ratio = received / total;
                    updateProgress(ratio * 0.35);
                    const percent = Math.round(ratio * 100);
                    if (percent % 25 === 0 && percent !== lastReportedPercent) {
                        lastReportedPercent = percent;
                        log(`מוריד מ-${sourceName}: ${formatBytes(received)} / ${formatBytes(total)} (${percent}%)`, 'info');
                    }
                } else {
                    updateProgress(0.15);
                }
            });
        }

        updateProgress(0.35);

        // 3. Push APK to Device (35% - 65%)
        log("מעביר קובץ התקנה למכשיר...", 'info');
        const sync = await appState.adbInstance.sync();
        const file = new File([apkBlob], "app.apk");
        await sync.push(file, "/data/local/tmp/app.apk", 0o644, (s, t) => {
            if (t > 0) {
                updateProgress(0.35 + (s / t) * 0.30);
            }
        });
        await sync.quit();
        
        await wait(1000);

        // 4. Install APK (65% - 80%)
        updateProgress(0.65);
        log("מתקין אפליקציה במכשיר...", 'info');
        await executeAdbCommand(`pm install -r -g "/data/local/tmp/app.apk"`, "Install APK");
        
        await wait(1500);

        // 5. Set Device Owner (80% - 90%)
        updateProgress(0.80);
        log("מגדיר הרשאות ניהול (Device Owner)...", 'info');
        await executeAdbCommand(`dpm set-device-owner ${CONFIG.TARGET_PACKAGE}/${CONFIG.DEVICE_ADMIN}`, "Set Owner");
        
        // 6. Grant Secure Settings (90% - 95%)
        updateProgress(0.90);
        log("מעניק הרשאות מערכת...", 'info');
        await executeAdbCommand(`pm grant ${CONFIG.TARGET_PACKAGE} android.permission.WRITE_SECURE_SETTINGS`, "Grant Secure Settings");
        
        // 7. Launch App (95% - 100%)
        updateProgress(0.95);
        log("מפעיל את האפליקציה...", 'info');
        await executeAdbCommand(`am start -n ${CONFIG.TARGET_PACKAGE}/.MainActivity`, "Launch");

        updateProgress(1.0);
        log("ההתקנה וההגדרה הושלמו בהצלחה!", 'success');
        showToast("ההתקנה הסתיימה בהצלחה!");

        // Show Success Screen on phone frame
        const video = document.getElementById('guide-video');
        const phoneControls = document.querySelector('.phone-controls');
        if (video) video.style.display = 'none';
        if (phoneControls) phoneControls.style.display = 'none';
        if (successMsg) successMsg.style.display = 'flex';

    } catch (e) {
        log(`שגיאה בתהליך: ${e.message}`, 'error');
        showToast("ההתקנה נכשלה");

        // If APK retrieval failed, display the manual fallback file selector
        if (!apkBlob && manualBox) {
            manualBox.style.display = 'block';
        }
    } finally {
        if (appState.disabledPackages.length > 0) {
            await restoreAccounts();
        }
        btn.disabled = false;
    }
}
