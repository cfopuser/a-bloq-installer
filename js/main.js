// js/main.js
import { navigateTo, toggleVideo, log, showToast, copyLogToClipboard } from './ui.js';
import { connectAdb } from './adb-client.js';
import { checkAccounts, runAccountBypass, restoreAccounts, getBypassPreview } from './accounts.js';
import { checkForUpdates, startDownload, runInstallation, setManualApkFile } from './installer.js';
import { appState, restoreSessionState } from './state.js';

// --- Rescue Banner Management ---
export function updateRescueBanner() {
    const banner = document.getElementById('emergency-restore-box') || document.getElementById('global-rescue-banner');
    const titleEl = document.getElementById('rescue-banner-title');
    const descEl = document.getElementById('rescue-banner-desc');
    
    const count = appState.disabledPackages ? appState.disabledPackages.length : 0;
    if (count > 0 && banner) {
        banner.style.display = 'flex';
        if (titleEl) titleEl.textContent = `זוהו ${count} רכיבי מערכת מושבתים במכשיר`;
        if (descEl) descEl.textContent = `נמצאו חבילות שהושבתו זמנית (${appState.disabledPackages.join(', ')}). ניתן לשחזרן בלחיצת כפתור.`;
    } else if (banner) {
        banner.style.display = 'none';
    }
}
window.updateRescueBanner = updateRescueBanner;

// --- Modal Handlers ---
window.openBypassModal = async () => {
    const modal = document.getElementById('modal-bypass-confirm');
    const previewBox = document.getElementById('bypass-package-preview');
    if (!modal) return;

    modal.classList.add('active');
    if (previewBox) {
        previewBox.innerHTML = '<div class="preview-loading"><span class="spin-icon material-symbols-rounded">sync</span> סורק רכיבים להשבתה...</div>';
    }

    try {
        const preview = await getBypassPreview();
        if (previewBox) {
            if (preview.packages.length === 0) {
                previewBox.innerHTML = '<div style="color: #A5D6A7; padding: 4px 0;">לא נמצאו רכיבים הדורשים השבתה מיוחדת.</div>';
            } else {
                let html = '';
                preview.packages.forEach(pkg => {
                    html += `<div class="preview-pkg-item"><span class="material-symbols-rounded">check</span> ${pkg}</div>`;
                });
                previewBox.innerHTML = html;
            }
        }
    } catch (e) {
        if (previewBox) {
            previewBox.innerHTML = '<div style="color: #FFB4AB;">שירותי Google / Samsung / Microsoft וחשבונות המערכת המזוהים.</div>';
        }
    }
};

window.closeBypassModal = () => {
    const modal = document.getElementById('modal-bypass-confirm');
    if (modal) modal.classList.remove('active');
};

window.openAndroid14Modal = () => {
    const modal = document.getElementById('modal-android14-info');
    if (modal) modal.classList.add('active');
};

window.closeAndroid14Modal = () => {
    const modal = document.getElementById('modal-android14-info');
    if (modal) modal.classList.remove('active');
};

window.handleBypassTriggerClick = () => {
    // Android 14+ (SDK >= 34) constraint
    if ((appState.sdkVersion || 0) >= 34) {
        window.openAndroid14Modal();
    } else {
        window.openBypassModal();
    }
};
// Backward compatibility alias
window.toggleBypassWarning = window.handleBypassTriggerClick;

window.executeBypassFromModal = async () => {
    window.closeBypassModal();
    await runAccountBypass();
    updateRescueBanner();
};

window.emergencyRestoreAccounts = async () => {
    if (!appState.adbConnected) {
        showToast("יש לחבר את המכשיר תחילה");
        return;
    }
    await restoreAccounts();
    updateRescueBanner();
    showToast("כל הרכיבים שוחזרו בהצלחה");
    if (document.getElementById('page-accounts')?.classList.contains('active')) {
        await checkAccounts();
    }
};

// 1. ATTACH TO WINDOW IMMEDIATELY
window.navigateTo = (pageId, stepIndex) => {
    navigateTo(pageId, stepIndex);
    updateRescueBanner();
};
window.toggleVideo = toggleVideo;
window.connectAdb = async () => {
    await connectAdb();
    updateRescueBanner();
};
window.checkAccounts = checkAccounts;
window.runAccountBypass = runAccountBypass;
window.startDownload = startDownload;
window.runInstallation = runInstallation;
window.copyLogToClipboard = copyLogToClipboard;
window.handleManualApkSelect = (input) => {
    if (input && input.files && input.files[0]) {
        setManualApkFile(input.files[0]);
    }
};

// 2. INITIALIZE & EVENT LISTENERS
document.addEventListener('DOMContentLoaded', () => {
    // Check Browser
    if (!('usb' in navigator)) {
        document.getElementById('page-main-content').style.display = 'none';
        document.getElementById('compatibility-notice').style.display = 'block';
    }

    // Check if previous session was interrupted with disabled packages
    const restoredCount = restoreSessionState();
    if (restoredCount > 0) {
        updateRescueBanner();
        log(`נמצאה הפעלה קודמת שנקטעה: ${restoredCount} רכיבים מושבתים במכשיר.`, 'warn');
    }

    // Close modals on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.closeBypassModal();
            window.closeAndroid14Modal();
        }
    });
});