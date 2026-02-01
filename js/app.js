// --- CONFIGURATION ---
const GITHUB_USERNAME = "sesese1234"; 
const GITHUB_REPO_NAME = "SecureGuardMDM"; 
const TARGET_PACKAGE = "com.secureguard.mdm";
const DEVICE_ADMIN = ".SecureGuardDeviceAdminReceiver";

// --- GLOBAL VARIABLES ---
let adb;
let webusb;
let apkBlob = null;
let foundReleaseUrl = null;

// --- DEV MODE ---
window.DEV_MODE = false;

window.enableDevMode = function() {
    window.DEV_MODE = true;
    console.log("%c[DEV] Developer Mode Enabled", "color: #00ff00; font-weight: bold;");
    showToast("Developer Mode Enabled");
    
    // Auto-update UI if on update page
    const updateInfo = document.getElementById('update-info-text');
    if(updateInfo && document.getElementById('page-update').classList.contains('active')) {
        updateInfo.innerHTML = `גרסה חדשה זמינה: <b>v1.0.0-DEV</b>`;
        document.getElementById('btn-download').disabled = false;
        foundReleaseUrl = "http://mock-url/file.apk";
    }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- ADB LOGIC ---

async function connectAdb() {
    // DEV MODE MOCK
    if (window.DEV_MODE) {
        updateStatusBadge('adb-status', `<span class="material-symbols-rounded">developer_mode</span> מחובר: Dev Emulator`, 'success');
        document.getElementById('btn-connect').style.display = 'none';
        const nextBtn = document.getElementById('btn-next-adb');
        nextBtn.style.display = 'inline-flex';
        nextBtn.disabled = false;
        showToast("[DEV] Device Connected Simulated");
        return;
    }

    try {
        webusb = await Adb.open("WebUSB");
        adb = await webusb.connectAdb("host::");
        if(adb) {
            let shell = await adb.shell("getprop ro.product.manufacturer");
            let manufacturer = await readAll(shell);
            
            updateStatusBadge('adb-status', `<span class="material-symbols-rounded">link</span> מחובר: ${manufacturer.trim()}`, 'success');
            
            document.getElementById('btn-connect').style.display = 'none';
            const nextBtn = document.getElementById('btn-next-adb');
            nextBtn.style.display = 'inline-flex';
            nextBtn.disabled = false;
            
            showToast("המכשיר חובר בהצלחה");
        }
    } catch (e) {
        showToast("שגיאה בחיבור: " + e.message);
    }
}

async function checkAccounts() {
    // DEV MODE MOCK
    if (window.DEV_MODE) {
        updateStatusBadge('account-status', `<span class="material-symbols-rounded">hourglass_top</span> בודק (Simulated)...`, '');
        await sleep(800);
        updateStatusBadge('account-status', `<span class="material-symbols-rounded">check_circle</span> מכשיר נקי`, 'success');
        document.getElementById('btn-next-acc').disabled = false;
        showToast("[DEV] Accounts Clean Simulated");
        return;
    }

    if(!adb) { showToast("ADB לא מחובר"); return; }
    
    updateStatusBadge('account-status', `<span class="material-symbols-rounded">hourglass_top</span> בודק...`, '');
    
    try {
        let s = await adb.shell("dumpsys account");
        let output = await readAll(s);
        let hasAccounts = output.includes("Account {name=");
        let countMatch = output.match(/Accounts: (\d+)/);
        let count = countMatch ? parseInt(countMatch[1]) : -1;

        if (count === 0 || !hasAccounts) {
            updateStatusBadge('account-status', `<span class="material-symbols-rounded">check_circle</span> מכשיר נקי`, 'success');
            document.getElementById('btn-next-acc').disabled = false;
            showToast("המכשיר מוכן להתקנה");
        } else {
            updateStatusBadge('account-status', `<span class="material-symbols-rounded">error</span> נמצאו ${count} חשבונות`, 'error');
            showToast(`נמצאו ${count} חשבונות פעילים. אנא הסר אותם.`);
        }
    } catch (e) {
        showToast("שגיאה בבדיקה");
        console.error(e);
    }
}

// --- UPDATE LOGIC ---

async function checkForUpdates() {
    const infoText = document.getElementById('update-info-text');
    const btn = document.getElementById('btn-download');
    
    // DEV MODE MOCK
    if (window.DEV_MODE) {
        infoText.innerHTML = `גרסה חדשה זמינה: <b>v1.0.0-DEV</b>`;
        btn.disabled = false;
        foundReleaseUrl = "http://mock";
        return;
    }

    try {
        const apiUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO_NAME}/releases/latest`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error("No releases");
        
        const data = await response.json();
        const asset = data.assets.find(a => a.name.endsWith('.apk'));
        
        if (!asset) throw new Error("No APK asset");

        foundReleaseUrl = asset.browser_download_url;
        infoText.innerHTML = `גרסה חדשה זמינה: <b>${data.tag_name}</b>`;
        btn.disabled = false;

    } catch (error) {
        infoText.innerText = "לא נמצאו עדכונים (משתמש בגרסה מובנית).";
        console.log(error);
    }
}

async function startDownload() {
    if (!foundReleaseUrl) return;

    const btn = document.getElementById('btn-download');
    const bar = document.getElementById('dl-progress-bar');
    const wrapper = document.getElementById('dl-progress-wrapper');
    const text = document.getElementById('dl-status-text');

    btn.disabled = true;
    wrapper.style.display = 'block';
    text.innerText = "מוריד...";

    // DEV MODE MOCK
    if (window.DEV_MODE) {
        for(let i=0; i<=100; i+=5) {
            bar.style.width = i + "%";
            text.innerText = i + "%";
            await sleep(50);
        }
        apkBlob = new Blob(["mock-data"]); // Fake blob
        text.innerText = "הורדה הושלמה! (DEV)";
        setTimeout(() => navigateTo('page-install', 4), 1000);
        return;
    }

    try {
        const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(foundReleaseUrl);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error("Download failed");

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
                let pct = Math.floor((receivedLength / contentLength) * 100);
                bar.style.width = pct + "%";
                text.innerText = pct + "%";
            }
        }

        apkBlob = new Blob(chunks);
        text.innerText = "הורדה הושלמה!";
        setTimeout(() => navigateTo('page-install', 4), 1000);

    } catch (e) {
        text.innerText = "שגיאה בהורדה";
        showToast(e.message);
        btn.disabled = false;
    }
}

// --- INSTALL LOGIC ---

async function runInstallation() {
    const btn = document.getElementById('btn-install-start');
    
    // DEV MODE MOCK
    if (window.DEV_MODE) {
        btn.disabled = true;
        log("\n> [DEV] Starting installation sequence...");
        updateProgress(0.1);
        await sleep(800);
        
        log("> [DEV] Pushing APK to /data/local/tmp/app.apk...");
        updateProgress(0.4);
        await sleep(800);
        
        log("> [DEV] Running PM Install...");
        updateProgress(0.6);
        await sleep(1000);
        log("Success");
        
        log("> [DEV] Setting Device Owner...");
        updateProgress(0.8);
        await sleep(800);
        log("Device owner set to package " + TARGET_PACKAGE);
        
        updateProgress(1.0);
        log("> [DEV] Installation Complete!");
        showToast("[DEV] Installation Complete");
        return;
    }

    if(!adb) { showToast("ADB לא מחובר"); return; }
    
    if(!apkBlob) {
        log("> מוריד קובץ התקנה מקומי (Offline)...");
        try {
            let resp = await fetch('apk/update.apk');
            if(!resp.ok) throw new Error("Local file missing");
            apkBlob = await resp.blob();
        } catch(e) {
            log("> שגיאה קריטית: קובץ APK חסר.");
            return;
        }
    }

    btn.disabled = true;
    
    try {
        updateProgress(0.1);
        log("> מעביר קובץ למכשיר (/data/local/tmp/app.apk)...");
        
        const sync = await adb.sync();
        const file = new File([apkBlob], "app.apk");
        await sync.push(file, "/data/local/tmp/app.apk", 0o644);
        await sync.quit();

        updateProgress(0.4);
        log("> מתקין APK...");
        let installCmd = await adb.shell("pm install -r /data/local/tmp/app.apk");
        let installRes = await readAll(installCmd);
        log(installRes);

        updateProgress(0.7);
        log("> מגדיר Device Owner...");
        let dpmCmd = `dpm set-device-owner ${TARGET_PACKAGE}/${DEVICE_ADMIN}`;
        let s = await adb.shell(dpmCmd);
        let dpmRes = await readAll(s);
        log(dpmRes);

        if (dpmRes.includes("Success") || dpmRes.includes("already set")) {
            updateProgress(0.9);
            log("> פותח אפליקציה...");
            await adb.shell(`am start -n ${TARGET_PACKAGE}/.MainActivity`);
            updateProgress(1.0);
            log("> הסתיים בהצלחה!");
            showToast("ההתקנה הושלמה בהצלחה!");
        } else {
            throw new Error("Device Owner Failed: " + dpmRes);
        }

    } catch (e) {
        log("> שגיאה: " + e.message);
        btn.disabled = false;
        showToast("ההתקנה נכשלה");
    }
}

// --- STREAM HELPER ---
async function readAll(stream) {
    let decoder = new TextDecoder();
    let res = "";
    while (true) {
        const { done, value } = await stream.read();
        if (done) break;
        res += decoder.decode(value);
    }
    return res;
}