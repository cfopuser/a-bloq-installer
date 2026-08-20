// js/main.js
import { navigateTo, toggleVideo, log, showToast, copyLogToClipboard } from './ui.js';
import { connectAdb } from './adb-client.js';
import { checkAccounts, runAccountBypass, restoreAccounts } from './accounts.js';
import { checkForUpdates, startDownload, runInstallation, setManualApkFile } from './installer.js';
import { appState, restoreSessionState } from './state.js';

// 1. ATTACH TO WINDOW IMMEDIATELY
window.navigateTo = navigateTo;
window.toggleVideo = toggleVideo;
window.connectAdb = connectAdb;
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

window.emergencyRestoreAccounts = async () => {
    if (!appState.adbConnected) {
        showToast("יש לחבר את המכשיר תחילה");
        return;
    }
    await restoreAccounts();
    const box = document.getElementById('emergency-restore-box');
    if (box) box.style.display = 'none';
    showToast("כל הרכיבים שוחזרו בהצלחה");
};

// Handle the "Install without removal" button click
window.toggleBypassWarning = () => {
    // Check for Android 14+ (SDK 34)
    if (appState.sdkVersion >= 34) {
        alert("שגיאה: אפשרות זו חסומה ב-Android 14 ומעלה.\n\nבגרסאות אנדרואיד חדשות (14+), גוגל חסמה את האפשרות להשבית חשבונות דרך ADB מטעמי אבטחה.\n\nעליך להסיר את החשבונות באופן ידני דרך הגדרות המכשיר.");
        return;
    }

    const el = document.getElementById('bypass-warning');
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
};

// 2. INITIALIZE
document.addEventListener('DOMContentLoaded', () => {
    // Check Browser
    if (!('usb' in navigator)) {
        document.getElementById('page-main-content').style.display = 'none';
        document.getElementById('compatibility-notice').style.display = 'block';
    }

    // Check if previous session was interrupted with disabled packages
    const restoredCount = restoreSessionState();
    if (restoredCount > 0) {
        const box = document.getElementById('emergency-restore-box');
        if (box) box.style.display = 'block';
        log(`נמצאה הפעלה קודמת שנקטעה: ${restoredCount} רכיבים מושבתים במכשיר.`, 'warn');
    }
});