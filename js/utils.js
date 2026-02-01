/* --- UI HELPER FUNCTIONS --- */

function navigateTo(pageId, stepIndex) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // Show target page
    document.getElementById(pageId).classList.add('active');
    
    // Update Stepper
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
        dot.classList.remove('active');
        if (index === stepIndex) dot.classList.add('active');
        if (index < stepIndex) dot.classList.add('completed');
    });

    // --- VIDEO SWITCHING LOGIC ---
    const video = document.getElementById('guide-video');
    const icon = document.getElementById('video-icon');
    
    // Map specific steps to specific videos
    // Step 1 (ADB) -> Videos/1.mp4
    // Step 2 (Accounts) -> Videos/2.mp4
    let targetVideo = null;

    if (stepIndex === 1 || stepIndex === 0) {
        // Use Video 1 for Welcome and ADB steps
        targetVideo = "Videos/1.mp4";
    } else if (stepIndex === 2) {
        // Use Video 2 for Account Removal step
        targetVideo = "Videos/2.mp4";
    }

    // Only switch if the source is actually changing to prevent flickering
    if (targetVideo && !video.src.includes(targetVideo)) {
        video.src = targetVideo;
        video.play().catch(e => console.log("Auto-play prevented"));
        icon.innerText = 'pause'; // Reset icon to pause since we are auto-playing
    }
    // -----------------------------

    // Logic triggers
    if(pageId === 'page-update' && typeof checkForUpdates === 'function') {
        checkForUpdates();
    }
}
function showToast(message) {
    const x = document.getElementById("snackbar");
    x.innerText = message;
    x.className = "show";
    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
}

function toggleVideo() {
    const vid = document.getElementById('guide-video');
    const icon = document.getElementById('video-icon');
    if (vid.paused) {
        vid.play();
        icon.innerText = 'pause';
    } else {
        vid.pause();
        icon.innerText = 'play_arrow';
    }
}

function updateStatusBadge(id, text, type) {
    const el = document.getElementById(id);
    el.innerHTML = text;
    el.className = 'status-badge ' + type;
}

function updateProgress(val) {
    const bar = document.getElementById('install-progress-bar');
    if(bar) bar.style.width = (val * 100) + "%";
}

function log(text) {
    const el = document.getElementById('install-log');
    if(el) {
        el.innerText += text + "\n";
        el.scrollTop = el.scrollHeight;
    }
}