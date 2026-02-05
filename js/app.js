// --- CONFIGURATION ---
const ENABLE_WEB_UPDATE = false; // Set to true to allow GitHub updates, false to use local APK only
const GITHUB_USERNAME = "sesese1234"; 
const GITHUB_REPO_NAME = "SecureGuardMDM"; 
const TARGET_PACKAGE = "com.secureguard.mdm";
const DEVICE_ADMIN = ".SecureGuardDeviceAdminReceiver";

// --- GLOBAL STATE ---
let adb;
let webusb;
let apkBlob = null;
let foundRelease = null; 

const appState = {
    adbConnected: false,
    accountsClean: false,
    apkDownloaded: false,
    disabledPackages: [] // Track disabled packages  
};

// --- DEV MODE
window.DEV_MODE = false;
let mockResolver = null; // Function to resolve the pending command

// UI Builder for Dev Console
function initDevConsole() {
    if(document.getElementById('dev-console')) return;

    const html = `
    <div id="dev-console">
        <div class="dev-header">
            <span>[MOCK DEVICE TERMINAL]</span>
            <span style="font-size:10px; cursor:pointer;" onclick="document.getElementById('dev-console').style.display='none'">X</span>
        </div>
        <div id="dev-log" class="dev-log"></div>
        <div class="dev-controls">
            <div class="dev-input-group">
                <input type="text" id="dev-manual-input" placeholder="Type manual response here...">
                <button class="dev-btn" onclick="devSendManual()">SEND</button>
            </div>
            <div style="font-size:10px; color:#666; margin-bottom:4px;">PRESETS:</div>
            <div class="dev-scenarios">
                <button class="dev-btn" onclick="devPreset('success')">CMD Success</button>
                <button class="dev-btn" onclick="devPreset('model')">Model Info</button>
                <button class="dev-btn" onclick="devPreset('no_acc')">No Accounts</button>
                <button class="dev-btn" onclick="devPreset('has_acc')">Has Accounts</button>
                <button class="dev-btn" onclick="devPreset('install_ok')">Install OK</button>
                <button class="dev-btn" onclick="devPreset('dpm_ok')">Owner OK</button>
                <button class="dev-btn" onclick="devPreset('error')">Generic Error</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    devLog("System initialized. Waiting for connection...");
}

// Helpers for Dev Console
function devLog(msg, type = 'info') {
    const log = document.getElementById('dev-log');
    if(!log) return;
    const div = document.createElement('div');
    div.className = `dev-log-entry ${type}`;
    div.innerText = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

window.devSendManual = function() {
    const input = document.getElementById('dev-manual-input');
    if(mockResolver) {
        devLog(`Manual Response: ${input.value}`, 'resp');
        mockResolver(input.value);
        mockResolver = null;
        input.value = '';
    } else {
        devLog("No pending command to respond to.", 'error');
    }
}

window.devPreset = function(type) {
    if(!mockResolver) return;
    let resp = "";
    switch(type) {
        case 'success': resp = "Success"; break;
        case 'model': resp = "ro.product.model: Pixel 8 Pro (Mock)"; break;
        case 'no_acc': resp = ""; break; // Empty output for accounts = clean
        case 'has_acc': resp = "Account {name=test@gmail.com, type=com.google}"; break;
        case 'install_ok': resp = "Success"; break;
        case 'dpm_ok': resp = "Success: Device owner set to package " + TARGET_PACKAGE; break;
        case 'error': resp = "Error: Something went wrong"; break;
    }
    devLog(`Preset [${type}]: ${resp}`, 'resp');
    mockResolver(resp);
    mockResolver = null;
}

// MOCK ADB IMPLEMENTATION
class MockADB {
    async connectAdb(path) {
        devLog(`connecting to ${path}...`);
        return this; // Return self as the 'adb' instance
    }

    async shell(cmd) {
        devLog(`$ ${cmd}`, 'cmd');
        devLog(`Waiting for response...`, 'waiting');
        
        // Return a Promise that the UI will resolve
        const responseText = await new Promise(resolve => {
            mockResolver = resolve;
        });

        // Convert string response to WebADB compatible stream
        const encoder = new TextEncoder();
        const view = encoder.encode(responseText + "\n");
        
        return {
            read: async function() {
                if (this.called) return { done: true, value: undefined };
                this.called = true;
                return { done: false, value: view };
            },
            called: false
        };
    }

    async sync() {
        devLog(`> Requesting SYNC service`, 'cmd');
        return {
            push: async (file, path, mode, onProgress) => {
                devLog(`> PUSH ${file.name} to ${path}`, 'cmd');
                // Simulate progress
                for(let i=0; i<=100; i+=20) {
                    await sleep(200);
                    onProgress(i, 100);
                    devLog(`Upload: ${i}%`, 'info');
                }
                devLog(`> PUSH Complete`, 'resp');
                return true;
            },
            quit: async () => devLog(`> SYNC Closed`, 'info')
        };
    }
}

window.enableDevMode = function() {
    window.DEV_MODE = true;
    initDevConsole();
    
    // Auto-enable update mock
    foundRelease = { url: "http://mock-url/file.apk" }; 
    const updateInfo = document.getElementById('update-info-text');
    if(updateInfo) updateInfo.innerHTML = `גרסה חדשה זמינה: <b>v1.0.0-MOCK</b>`;
    
    showToast("Developer Mode & Mock Device Enabled");
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- REAL LOGIC ---

// --- IMPROVED ERROR MAPPING ---
const ADB_ERRORS = {
    "INSTALL_FAILED_ALREADY_EXISTS": "האפליקציה כבר מותקנת. מנסה לעדכן...",
    "INSTALL_FAILED_INSUFFICIENT_STORAGE": "אין מספיק מקום פנוי במכשיר.",
    "INSTALL_FAILED_UPDATE_INCOMPATIBLE": "קיימת גרסה קודמת עם חתימה שונה. יש למחוק אותה ידנית.",
    "Permission denied": "אין הרשאה לביצוע הפעולה. וודא שאישרת 'ניפוי באגים' במכשיר.",
    "device unauthorized": "המכשיר לא מאושר. בדוק את מסך המכשיר ואשר את החיבור.",
    "not found": "המכשיר התנתק. בדוק את תקינות הכבל.",
    "there are already some accounts": "שגיאה: נמצאו חשבונות פעילים. חזור לשלב 2.",
    "already a device owner": "שגיאה: כבר קיים מנהל מכשיר (Device Owner). יש לבצע איפוס יצרן.",
};

// --- HELPER: Map Account Type to Package ---
const ACCOUNT_PKG_MAP = {
    'com.google': 'com.google.android.gms', // Google Play Services
    'com.google.work': 'com.google.android.gms',
    'com.osp.app.signin': 'com.samsung.android.mobileservice', // Samsung Account
    'com.samsung.android.mobileservice': 'com.samsung.android.mobileservice',
    'com.whatsapp': 'com.whatsapp',
    'com.facebook.auth.login': 'com.facebook.katana',
    'com.facebook.messenger': 'com.facebook.orca'
};

async function connectAdb() {
    try {
        if (window.DEV_MODE) {
            webusb = new MockADB(); 
            adb = await webusb.connectAdb("mock::device");
        } else {
            webusb = await Adb.open("WebUSB");
            adb = await webusb.connectAdb("host::");
        }

        if(adb) {
            let shell = await adb.shell("getprop ro.product.model");
            let model = await readAll(shell);
            
            model = model.replace('ro.product.model:', '').trim();
            if(!model) model = "Generic Android";

            updateStatusBadge('adb-status', `<span class="material-symbols-rounded">link</span> מחובר: ${model}`, 'success');
            
            document.getElementById('btn-connect').style.display = 'none';
            const nextBtn = document.getElementById('btn-next-adb');
            nextBtn.style.display = 'inline-flex';
            nextBtn.disabled = false;
            appState.adbConnected = true;
            
            showToast("המכשיר חובר בהצלחה");
        }
    } catch (e) {
        showToast("שגיאה בחיבור: " + e.message);
        console.error(e);
    }
}

// --- NEW FUNCTIONS FOR BETA FEATURE ---

function toggleBypassWarning() {
    const el = document.getElementById('bypass-warning');
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

async function runAccountBypass() {
    if(!adb) return showToast("ADB לא מחובר");
    
    // Hide warning box
    document.getElementById('bypass-warning').style.display = 'none';
    updateStatusBadge('account-status', 'מבצע השבתת חשבונות...', '');
    
    // 1. Get current list of accounts again to be sure
    try {
        let s = await adb.shell("cmd account list");
        let output = await readAll(s);
        
        // Fallback
        if (!output || output.trim().length === 0) {
            s = await adb.shell("dumpsys account");
            output = await readAll(s);
        }

        const accountRegex = /Account\s*\{name=([^,]+),\s*type=([^}]+)\}/gi;
        let matches = [...output.matchAll(accountRegex)];
        
        let processedPackages = new Set();
        let logMsg = "";

        for (const m of matches) {
            const type = m[2].trim();
            
            // Determine package to disable
            let pkgToDisable = ACCOUNT_PKG_MAP[type];
            
            if (!pkgToDisable && type.includes('.')) {
                pkgToDisable = type; 
            }

            if (pkgToDisable && !processedPackages.has(pkgToDisable)) {
                processedPackages.add(pkgToDisable);
                logMsg += `Disabling ${pkgToDisable}... `;
                
                // EXECUTE DISABLE
                await executeAdbCommand(`pm disable-user --user 0 ${pkgToDisable}`, `השבתת ${pkgToDisable}`);
                
                // Track it so we can re-enable later
                appState.disabledPackages.push(pkgToDisable);
            }
        }

        // --- NEW AUTO-PROCEED LOGIC ---
        if (appState.disabledPackages.length > 0) {
            showToast(`בוצעה השבתה ל-${appState.disabledPackages.length} רכיבים. ממשיך להתקנה...`);
            
            appState.accountsClean = true; 
            
            setTimeout(() => {
                navigateTo('page-update', 3);
            }, 1500); 
        } else {
            showToast("לא נמצאו חשבונות מתאימים להשבתה אוטומטית.");
            checkAccounts(); 
        }
        

    } catch (e) {
        console.error(e);
        showToast("שגיאה בביצוע תהליך אוטומטי");
        checkAccounts();
    }
}

async function restoreAccounts() {
    if (appState.disabledPackages.length === 0) return;

    log("\n> משחזר חשבונות שהושבתו...", 'info');
    
    for (const pkg of appState.disabledPackages) {
        try {
            await executeAdbCommand(`pm enable ${pkg}`, `הפעלת ${pkg} מחדש`);
        } catch (e) {
            log(` נכשל בהפעלת ${pkg}: ${e.message}`, 'error');
        }
    }
    
    // Clear list
    appState.disabledPackages = [];
    log(" שיחזור חשבונות הסתיים.", 'success');
}

const ICONS = {
    google: '<svg viewBox="0 0 24 24"><path d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" /></svg>',
    samsung: '<svg viewBox="0 0 24 24"><path d="M16.94 13.91C16.82 13.91 16.58 13.91 16.34 13.88C15.93 13.82 15.65 13.72 15.35 13.56L15.42 12.94C15.69 13.09 16.03 13.21 16.39 13.27C16.58 13.3 16.73 13.3 16.8 13.3C17.5 13.3 17.81 12.99 17.81 12.55C17.81 12.08 17.51 11.85 16.64 11.66L16.23 11.58C14.79 11.27 13.92 10.74 13.92 9.7C13.92 8.44 14.94 7.55 16.68 7.55C17.38 7.55 18.06 7.66 18.66 7.89L18.45 8.5C17.96 8.32 17.39 8.21 16.77 8.21C16.14 8.21 15.82 8.5 15.82 8.9C15.82 9.32 16.15 9.54 16.98 9.72L17.38 9.8C18.94 10.14 19.72 10.72 19.72 11.73C19.72 13.11 18.63 13.91 16.94 13.91M11.6 13.84H9.72V7.63H13.68V8.24H11.6V10.35H13.39V10.96H11.6V13.84M22 10.73C22 14.63 17.53 17.8 12 17.8C6.47 17.8 2 14.63 2 10.73C2 6.83 6.47 3.66 12 3.66C17.53 3.66 22 6.83 22 10.73Z" /></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.66C14.25 3.66 16.31 4.51 17.87 6.07C19.42 7.63 20.28 9.7 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 15 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.66 12.05 3.66Z" /></svg>',
    twitter: '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>',
    facebook: '<svg viewBox="0 0 24 24"><path d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.15 5.96C15.21 5.96 16.16 6.05 16.16 6.05V8.51H15.03C13.79 8.51 13.4 9.28 13.4 10.06V12.06H16.17L15.73 14.96H13.4V21.96C18.19 21.21 21.84 17.06 21.84 12.06C21.84 6.53 17.35 2.04 12 2.04Z" /></svg>',
    telegram: '<svg viewBox="0 0 24 24"><path d="M9.78 18.65L10.06 14.42L17.74 7.5C18.08 7.19 17.67 7.04 17.22 7.31L7.74 13.3L3.64 12C2.76 11.75 2.75 11.14 3.84 10.7L19.81 4.54C20.54 4.21 21.24 4.72 20.96 5.84L18.24 18.65C18.05 19.56 17.5 19.78 16.74 19.36L12.6 16.3L10.61 18.23C10.38 18.46 10.19 18.65 9.78 18.65Z" /></svg>',
    xiaomi: '<svg viewBox="0 0 24 24"><path d="M14.5,5.5H5.5V18.5H9.5V9.5H14.5V18.5H18.5V9.4C18.5,7.2 16.7,5.5 14.5,5.5M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z" /></svg>',
    microsoft: '<svg viewBox="0 0 24 24"><path d="M2,2H11V11H2V2M2,13H11V22H2V13M13,2H22V11H13V2M13,13H22V22H13V13Z" /></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path d="M12.5 3v13.6c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4c.4 0 .8.1 1.1.2V9.3c-.4 0-.7-.1-1.1-.1-4.1 0-7.5 3.4-7.5 7.5s3.4 7.5 7.5 7.5 7.5-3.4 7.5-7.5V7c1.5 1.1 3.3 1.7 5.2 1.7V5.3c-2.4 0-4.5-1.1-5.9-2.9l-1.3.6z"/></svg>'
};

/**
 * Helper to map account types to Icons, Colors, and Readable Names
 */
function getAccountVisuals(type) {
    const t = type.toLowerCase();

    // 1. Google
    if (t.includes('google')) {
        return { label: 'Google Account', html: ICONS.google, class: 'acc-google' };
    }
    // 2. Samsung / OSP
    if (t.includes('samsung') || t.includes('osp')) {
        return { label: 'Samsung Account', html: ICONS.samsung, class: 'acc-samsung' };
    }
    // 3. WhatsApp
    if (t.includes('whatsapp')) {
        return { label: 'WhatsApp', html: ICONS.whatsapp, class: 'acc-whatsapp' };
    }
    // 4. X / Twitter
    if (t.includes('twitter') || t.includes('com.twitter')) {
        return { label: 'X (Twitter)', html: ICONS.twitter, class: 'acc-twitter' };
    }
    // 5. Facebook / Meta
    if (t.includes('facebook') || t.includes('meta')) {
        return { label: 'Facebook', html: ICONS.facebook, class: 'acc-facebook' };
    }
    // 6. Telegram
    if (t.includes('telegram')) {
        return { label: 'Telegram', html: ICONS.telegram, class: 'acc-telegram' };
    }
    // 7. Xiaomi
    if (t.includes('xiaomi')) {
        return { label: 'Xiaomi Account', html: ICONS.xiaomi, class: 'acc-xiaomi' };
    }
    // 8. TikTok
    if (t.includes('tiktok') || t.includes('musical')) {
        return { label: 'TikTok', html: ICONS.tiktok, class: 'acc-tiktok' };
    }
    // 9. Exchange / Microsoft
    if (t.includes('exchange') || t.includes('outlook') || t.includes('office')) {
        return { label: 'Exchange/Outlook', html: ICONS.microsoft, class: 'acc-exchange' };
    }
    
    // Fallback for Unknown Accounts -> Cloud Icon (Material Symbol)
    return { 
        label: type, 
        html: `<span class="material-symbols-rounded">cloud</span>`, 
        class: 'acc-unknown' 
    };
}

async function checkAccounts() {
    const accountListDiv = document.getElementById('account-list');
    const bypassBtn = document.getElementById('btn-bypass-trigger');
    accountListDiv.innerHTML = ''; 

    if(!adb) { showToast("ADB לא מחובר"); return; }
    
    updateStatusBadge('account-status', `<span class="material-symbols-rounded">hourglass_top</span> בודק...`, '');
    bypassBtn.style.display = 'none'; // Hide bypass button while checking
    
    try {
        let s = await adb.shell("cmd account list");
        let output = await readAll(s);
        
        if (!output || output.trim().length === 0 || (!output.includes('Account {') && !window.DEV_MODE)) {
            s = await adb.shell("dumpsys account");
            output = await readAll(s);
        }

        const accountRegex = /Account\s*\{name=([^,]+),\s*type=([^}]+)\}/gi;
        let matches = [...output.matchAll(accountRegex)];
        
        const uniqueAccounts = [];
        const seen = new Set();

        matches.forEach(m => {
            const name = m[1].trim();
            const type = m[2].trim();
            const key = `${name}|${type}`;
            if(!seen.has(key)) {
                seen.add(key);
                uniqueAccounts.push({ name, type });
            }
        });

        if (uniqueAccounts.length === 0) {
            updateStatusBadge('account-status', `<span class="material-symbols-rounded">check_circle</span> מכשיר נקי`, 'success');
            document.getElementById('btn-next-acc').disabled = false;
            appState.accountsClean = true;
            bypassBtn.style.display = 'none'; // Ensure hidden if clean
            
            accountListDiv.innerHTML = `
                <div style="text-align:center; padding: 20px; color: #81C784;">
                    <span class="material-symbols-rounded" style="font-size: 48px;">check_circle_outline</span>
                    <p>לא נמצאו חשבונות. ניתן להמשיך.</p>
                </div>`;
            
            showToast("המכשיר מוכן להתקנה");
        } else {
            updateStatusBadge('account-status', `<span class="material-symbols-rounded">error</span> נמצאו ${uniqueAccounts.length} חשבונות`, 'error');
            bypassBtn.style.display = 'inline-flex'; // Show bypass button only if accounts found
            
            let cardsHtml = '';
            
            uniqueAccounts.forEach(acc => {
                const visuals = getAccountVisuals(acc.type);
                
                cardsHtml += `
                <div class="account-card ${visuals.class}">
                    <div class="account-icon-wrapper">
                        ${visuals.html}
                    </div>
                    <div class="account-info">
                        <div class="account-name" title="${acc.name}">${acc.name}</div>
                        <div class="account-type">
                            ${visuals.label}
                            <span style="font-size:0.7em; opacity:0.6;">(${acc.type})</span>
                        </div>
                    </div>
                </div>`;
            });

            accountListDiv.innerHTML = cardsHtml;
            document.getElementById('btn-next-acc').disabled = true;
            appState.accountsClean = false;
        }
    } catch (e) {
        showToast("שגיאה בבדיקת חשבונות");
        console.error("Account check error:", e);
        updateStatusBadge('account-status', `שגיאה בבדיקה`, 'error');
    }
}
async function checkForUpdates() {
    const infoText = document.getElementById('update-info-text');
    const btn = document.getElementById('btn-download');
    
    // We keep this check simple as it talks to GitHub, not ADB
    if (window.DEV_MODE) {
        infoText.innerHTML = `גרסה חדשה זמינה: <b>v1.0.0-MOCK</b>`;
        btn.disabled = false;
        foundRelease = { url: "http://mock" };
        return;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO_NAME}/releases/latest`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("Could not fetch releases from GitHub");
        
        const data = await response.json();
        const asset = data.assets.find(a => a.name.endsWith('.apk'));
        
        if (!asset) throw new Error("No APK asset found in the latest release");

        foundRelease = asset;
        infoText.innerHTML = `גרסה חדשה זמינה: <b>${data.tag_name}</b>`;
        btn.disabled = false;

    } catch (error) {
        infoText.innerText = "לא נמצאו עדכונים (משתמש בגרסה מובנית).";
        console.error(error);
    }
}

async function startDownload() {
    if (!foundRelease) return;

    const btn = document.getElementById('btn-download');
    const bar = document.getElementById('dl-progress-bar');
    const wrapper = document.getElementById('dl-progress-wrapper');
    const text = document.getElementById('dl-status-text');

    btn.disabled = true;
    wrapper.style.display = 'block';
    text.innerText = "מוריד...";

    if (window.DEV_MODE) {
        for(let i=0; i<=100; i+=10) {
            bar.style.width = i + "%";
            text.innerText = i + "%";
            await sleep(100);
        }
        apkBlob = new Blob(["mock-data"]); 
        text.innerText = "הורדה הושלמה! (MOCK)";
        appState.apkDownloaded = true;
        setTimeout(() => navigateTo('page-install', 4), 1000);
        return;
    }

    try {
        const response = await fetch(foundRelease.url, {
            headers: { 'Accept': 'application/octet-stream' }
        });
        if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);

        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');
        let receivedLength = 0;
        let chunks = [];

        while(true) {
            const {done, value} = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedLength += value.length;
            
            if(contentLength) {
                let pct = Math.round((receivedLength / contentLength) * 100);
                bar.style.width = pct + "%";
                text.innerText = pct + "%";
            }
        }

        apkBlob = new Blob(chunks);
        text.innerText = "הורדה הושלמה!";
        appState.apkDownloaded = true;
        setTimeout(() => navigateTo('page-install', 4), 1000);

    } catch (e) {
        text.innerText = "שגיאה בהורדה";
        showToast(e.message);
        btn.disabled = false;
        console.error(e);
    }
}


/**
 * Helper to execute shell commands with validation and Hebrew feedback
 */
async function executeAdbCommand(command, description) {
    log(`> ${description}...`, 'info');
    try {
        const shell = await adb.shell(command);
        const response = await readAll(shell);
        
        // Android shell often returns error strings even if the command "executes"
        const lowerRes = response.toLowerCase();
        
        // Search for known errors in the response
        for (const [key, hebrewMsg] of Object.entries(ADB_ERRORS)) {
            if (response.includes(key)) {
                throw new Error(hebrewMsg + ` (${key})`);
            }
        }

        // Generic failure check (common in pm install)
        if (lowerRes.includes("failure") || lowerRes.includes("error")) {
             throw new Error("נכשלה הפעולה: " + response);
        }

        log(` הצלחה: ${description}`, 'success');
        return response;
    } catch (e) {
        log(` שגיאה ב${description}: ${e.message}`, 'error');
        throw e; // Rethrow to stop the installation sequence
    }
}

async function runInstallation() {
    const btn = document.getElementById('btn-install-start');
    const logEl = document.getElementById('install-log');
    logEl.innerHTML = ""; // Clear log
    
    if(!adb) { 
        showToast("ADB לא מחובר"); 
        return; 
    }

    btn.disabled = true;
    updateProgress(0);
    
    try {
        // 1. Validate APK
        if(!apkBlob) {
            if (!ENABLE_WEB_UPDATE) {
                log("> טוען קובץ apk...", 'info');
            } else {
                log("> קובץ לא הורד, טוען קובץ התקנה מקומי כגיבוי...", 'info');
            }

             // If in Dev Mode, create dummy blob if missing
            if(window.DEV_MODE && !apkBlob) apkBlob = new Blob(["mock"]);

            if(!apkBlob) {
                // This fetches the file from the /apk/ directory on your web server
                const resp = await fetch('apk/normal.apk');
                if(!resp.ok) throw new Error("קובץ ה-APK המקומי (apk/normal.apk) חסר.");
                apkBlob = await resp.blob();
            }
        }

        // 2. Push File
        log("> מעביר קובץ למכשיר...", 'info');
        const sync = await adb.sync();
        const file = new File([apkBlob], "app.apk");
        
        await sync.push(file, "/data/local/tmp/app.apk", 0o644, (sent, total) => {
            updateProgress(0.1 + (sent / total * 0.3));
        });
        await sync.quit();
        log(" הקובץ הועבר בהצלחה.", 'success');

        // 3. Install
        updateProgress(0.5);
        await executeAdbCommand(
            `pm install -r -g "/data/local/tmp/app.apk"`,  // Added -g to grant permissions immediately
            "התקנת אפליקציה"
        );

        // 4. Set Device Owner
        updateProgress(0.7);
        await executeAdbCommand(
            `appops set ${TARGET_PACKAGE} WRITE_SETTINGS allow`, 
            "הגדרת הרשאות ניהול נוספות"
            
        ); 

        updateProgress(0.8);
        await executeAdbCommand(
            `dpm set-device-owner ${TARGET_PACKAGE}/${DEVICE_ADMIN}`, 
            "הגדרת מנהל מערכת"

        );       

        // 5. Launch
        updateProgress(0.9);
        await executeAdbCommand(
            `am start -n ${TARGET_PACKAGE}/.MainActivity`, 
            "פתיחת אפליקציה"
        );

        updateProgress(1.0);
        log("\n הכלי הותקן והוגדר בהצלחה!", 'success');
        showToast("הסתיים בהצלחה!");

    } catch (e) {
        console.error(e);
        log(`\n התקנה נעצרה: ${e.message}`, 'error');
        showToast("ההתקנה נכשלה");
    } finally {
        // ALWAYS run restore logic, even if installation failed, 
        // otherwise user is left with disabled apps.
        if (appState.disabledPackages.length > 0) {
            await restoreAccounts();
        }
        btn.disabled = false;
    }
}

async function readAll(stream) {
    const decoder = new TextDecoder();
    let res = "";
    try {
        while (true) {
            // ב-WebADB משתמשים ב-receive() כדי לקבל הודעה מהמכשיר
            let msg = await stream.receive();

            if (msg.cmd === "WRTE") {
                // הודעת WRTE מכילה נתונים
                res += decoder.decode(msg.data);
                // חובה לשלוח OKAY חזרה כדי שהמכשיר ימשיך לשלוח את שאר הנתונים
                await stream.send("OKAY");
            } else if (msg.cmd === "CLSE") {
                // הודעת CLSE אומרת שהמכשיר סיים להעביר נתונים
                break;
            }
        }
    } catch (e) {
        console.warn("Stream reading interrupted", e);
    }
    return res.trim(); 
    
}