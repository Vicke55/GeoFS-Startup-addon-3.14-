// ==UserScript==
// @name         GeoFS A350 Startup v3.14.0 Official
// @namespace    Vicke55
// @version      3.14.0
// @description  Airbus A350 Startup Panel for GeoFS
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // ASSETS AND SETTINGS
    // ============================================================

    const VERSION = '3.14.0';
    const BASE = 'https://raw.githubusercontent.com/Vicke55/Airbus-startup-test/main/';
    const UPDATE_CONFIG_URL = BASE + 'updates/updates.json';
    const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
    const IMAGE_BASE = BASE + 'minmapp/';
    const ENG_BASE = BASE + 'ENG%20start-images/';
    const SOUND_BASE = BASE + 'suonds/';

    const SOUND_URLS = {
        click: SOUND_BASE + 'cockpit-click.mp3',
        fanStart: SOUND_BASE + 'Fan-start.mp3',
        fanRunning: SOUND_BASE + 'Fan-running.mp3',
        cabin: SOUND_BASE + 'Airbus%20waikky.mp3',
        seatbelts: SOUND_BASE + 'Seatbelts.mp3'
    };

    const CROP_TOP = 950;
    const ENG_CROP_TOP = 1530;
    const EXT_DELAY = 3000;
    const APU_READY_DELAY = 8000;
    const EXT_APU_START_DELAY = 8000;
    const FAN_START_DELAY_APU = 0;
    const FAN_START_DELAY_EXT = 4500;
    const FAN_NORMAL_VOLUME = 1;
    const FAN_LOW_VOLUME = 0.25;
    const FAN_APU_BLEED_VOLUME = 0.65;
    const FAN_FADE_DURATION = 3000;
    const FAN_APU_BLEED_FADE_DURATION = 5000;
    const FAN_SHUTDOWN_FADE_DURATION = 2500;
    // GeoFS can report an engine as running before the startup animation has finished.
    // Require a minimum start interval as well as a stable running status.
    const ENGINE_START_FALLBACK = 30000;
    const ENGINE_MIN_START_DURATION = 12000;
    const ENGINE_POLL_INTERVAL = 250;
    const ENG_PANEL_RESULT_DELAY = 2500;
    const ENGINE_STABLE_DURATION = 3000;
    const ENGINE_STOP_STABLE_DURATION = 2000;
    const POST_FLIGHT_APU_DELAY = 8000;
    const LANDING_CHOICE_DELAY = 3000;
    const STARTUP_MODAL_RESET_DELAY = 5000;

    const COMMON_IMAGES = [26, 27, 28, 29, 30, 31, 32, 33, 34, 35];
    const FLIGHT_IMAGES = [36, 35];
    const POST_FLIGHT_IMAGES = [37, 38, 39, 40, 41, 42, 43, 44, 45, 25];
    const TURNAROUND_SEQUENCE = [25, ...COMMON_IMAGES, ...FLIGHT_IMAGES, ...POST_FLIGHT_IMAGES];
    const FULL_SHUTDOWN_SEQUENCE = [25, ...Array.from({ length: 19 }, (_, i) => 46 + i)];

    const APU_SEQUENCE = [
        1, 2, 3, 8, 9, 10, 11,
        12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25,
        ...COMMON_IMAGES,
        ...FLIGHT_IMAGES,
        ...POST_FLIGHT_IMAGES
    ];

    const EXT_CONTINUATION = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75];

    const EXT_BOARDING_SEQUENCE = [
        76, 77, 78, 79, 80, 81, 82, 83, 84, 25,
        ...COMMON_IMAGES,
        ...FLIGHT_IMAGES,
        ...POST_FLIGHT_IMAGES
    ];

    const EXT_SEQUENCE_CONNECTED_LATER = [
        1, 2, 3, 4, 5, 6,
        ...EXT_CONTINUATION,
        ...EXT_BOARDING_SEQUENCE
    ];

    const EXT_SEQUENCE_CONNECTED_INITIALLY = [
        1, 7, 4, 5, 6,
        ...EXT_CONTINUATION,
        ...EXT_BOARDING_SEQUENCE
    ];

    // ============================================================
    // STATE
    // ============================================================

    const state = {
        open: false,
        firstOpen: true,
        startChoice: null,
        panelPosition: 'center',
        image: 1,
        sequenceIndex: 0,
        checklistMode: 'startup',
        shortTurnaroundActive: false,
        fullShutdownActive: false,
        landingChoicePending: false,
        landingChoiceTimer: null,
        startupModalReady: true,
        startupModalTimer: null,
        sidebarCollapsed: false,
        sidebarAutoExpanded: false,
        sidebarRestoreCollapsed: false,

        extConnected: false,
        extBusy: false,
        extConnectedDuringSequence: false,
        extInitiallyConnected: false,
        extSoundsStarted: false,

        checklistLocked: false,
        lockedChecklistKey: null,

        apuStarted: false,
        apuAvailable: false,
        apuGenSoundsPlayed: false,

        engPanelOpen: false,
        engImage: 89,
        eng1Started: false,
        eng2Started: false,
        eng1Starting: false,
        eng2Starting: false,
        eng1Stopping: false,
        eng2Stopping: false,
        eng1ShutdownCommandSent: false,
        eng2ShutdownCommandSent: false,
        engMode: 'NORM',
        engNormReached: false,
        engineStartPanelActive: false,
        engineStartPanelComplete: false,
        postFlightShutdownActive: false,
        postFlightShutdownComplete: false,
        postFlightShutdownMonitorTimer: null,
        postFlightShutdownReleaseScheduled: false,

        soundEnabled: true,
        currentTab: 'before',

        audioTimers: [],
        fanVolumeTimer: null,
        fanSequenceRequested: false,
        fanShuttingDown: false,
        fanShutdownRequested: false,
        apuTimer: null,
        apuRunToken: 0,
        postFlightAPUTimer: null,
        postFlightAPUToken: 0,
        extTimerToken: 0,
        extApuStartTimer: null,
        extApuStartToken: 0,
        engineTimers: [],
        engTransitionTimer: null,
        engTransitionToken: 0,
        engTransitionPending: false
    };

    let overheadWindow = null;

    // Update/changelog notifications are stored locally so they remain visible
    // until the user opens the STARTUP panel and reads the notification.
    const notificationState = {
        config: null,
        changelog: null,
        announcements: [],
        pendingUpdate: null,
        pendingChangelogVersion: null,
        pendingAnnouncements: [],
        modalOpen: false,
        notificationRequested: false,
        checked: false
    };

    const STORAGE_KEYS = {
        lastRunVersion: 'a350Startup.lastRunVersion',
        pendingChangelogVersion: 'a350Startup.pendingChangelogVersion',
        seenUpdateVersion: 'a350Startup.seenUpdateVersion',
        seenAnnouncements: 'a350Startup.seenAnnouncements'
    };

    function storageGet(key) {
        try { return localStorage.getItem(key); } catch (_) { return null; }
    }

    function storageSet(key, value) {
        try { localStorage.setItem(key, String(value)); } catch (_) {}
    }

    function storageRemove(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }

    function initializeVersionNotification() {
        const previousVersion = storageGet(STORAGE_KEYS.lastRunVersion);
        if (previousVersion !== VERSION) {
            storageSet(STORAGE_KEYS.pendingChangelogVersion, VERSION);
            storageSet(STORAGE_KEYS.lastRunVersion, VERSION);
        }
        notificationState.pendingChangelogVersion = storageGet(STORAGE_KEYS.pendingChangelogVersion);
    }

    function compareVersions(a, b) {
        const parse = value => {
            const parts = String(value || '0').trim().split('-', 2);
            const core = parts[0].split('.').map(part => Number.parseInt(part, 10) || 0);
            return { core, pre: parts.length > 1 ? parts[1].split('.') : null };
        };
        const left = parse(a);
        const right = parse(b);
        for (let i = 0; i < Math.max(left.core.length, right.core.length); i++) {
            const difference = (left.core[i] || 0) - (right.core[i] || 0);
            if (difference) return difference > 0 ? 1 : -1;
        }
        if (!left.pre && !right.pre) return 0;
        if (!left.pre) return 1;
        if (!right.pre) return -1;
        for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
            if (left.pre[i] === undefined) return -1;
            if (right.pre[i] === undefined) return 1;
            const ln = /^\d+$/.test(left.pre[i]);
            const rn = /^\d+$/.test(right.pre[i]);
            if (ln && rn) {
                const difference = Number(left.pre[i]) - Number(right.pre[i]);
                if (difference) return difference > 0 ? 1 : -1;
            } else if (ln !== rn) {
                return ln ? -1 : 1;
            } else if (left.pre[i] !== right.pre[i]) {
                return left.pre[i] > right.pre[i] ? 1 : -1;
            }
        }
        return 0;
    }

    function getSeenAnnouncementIds() {
        try {
            const parsed = JSON.parse(storageGet(STORAGE_KEYS.seenAnnouncements) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) { return []; }
    }

    function hasPendingNotifications() {
        return !!(
            notificationState.pendingUpdate ||
            notificationState.pendingChangelogVersion ||
            notificationState.pendingAnnouncements.length
        );
    }

    function updateMenuNotificationState() {
        const button = document.getElementById('a350-startup-menu-button');
        if (button) button.classList.toggle('a350-notification-blink', hasPendingNotifications());
    }

    async function fetchJSON(url) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
        return response.json();
    }

    async function checkForUpdates() {
        try {
            const config = await fetchJSON(UPDATE_CONFIG_URL);
            notificationState.config = config;
            if (config.enabled === false) {
                notificationState.pendingUpdate = null;
                notificationState.pendingAnnouncements = [];
                notificationState.pendingChangelogVersion = storageGet(STORAGE_KEYS.pendingChangelogVersion);
                notificationState.checked = true;
                updateMenuNotificationState();
                if (notificationState.modalOpen) showNotificationModal();
                return;
            }

            const requests = [];
            if (config.changelogUrl) requests.push(fetchJSON(config.changelogUrl).then(data => { notificationState.changelog = data; }).catch(error => console.warn('[A350 v3.14.0] Could not load changelog:', error)));
            if (config.announcementsUrl) requests.push(fetchJSON(config.announcementsUrl).then(data => { notificationState.announcements = Array.isArray(data.announcements) ? data.announcements : []; }).catch(error => console.warn('[A350 v3.14.0] Could not load announcements:', error)));
            await Promise.all(requests);

            const latestVersion = String(config.latestVersion || '').trim();
            const seenUpdateVersion = storageGet(STORAGE_KEYS.seenUpdateVersion);
            notificationState.pendingUpdate = latestVersion && compareVersions(latestVersion, VERSION) > 0 && seenUpdateVersion !== latestVersion
                ? { version: latestVersion, message: config.updateMessage || 'A new version of A350 Startup is available.', url: config.releaseUrl || '' }
                : null;

            const seenIds = getSeenAnnouncementIds();
            notificationState.pendingAnnouncements = notificationState.announcements.filter(item =>
                item && item.enabled !== false && item.id && !seenIds.includes(String(item.id))
            );
            notificationState.pendingChangelogVersion = storageGet(STORAGE_KEYS.pendingChangelogVersion);
            notificationState.checked = true;
            updateMenuNotificationState();
            if (notificationState.modalOpen) showNotificationModal();
        } catch (error) {
            // The addon remains fully usable if GitHub is unavailable.
            console.warn('[A350 v3.14.0] Update check failed; continuing offline:', error);
            notificationState.checked = true;
            updateMenuNotificationState();
            if (notificationState.modalOpen) showNotificationModal();
        }
    }

    function closeNotificationModal() {
        const modal = document.getElementById('a350-notification-modal');
        if (modal) modal.style.display = 'none';
        notificationState.modalOpen = false;
    }

    function showNotificationModal() {
        const modal = document.getElementById('a350-notification-modal');
        const card = document.getElementById('a350-notification-card');
        if (!modal || !card || !hasPendingNotifications()) return;

        if (notificationState.pendingChangelogVersion && !notificationState.checked) {
            card.replaceChildren();
            const loadingHeading = document.createElement('h2');
            loadingHeading.textContent = "What's new?";
            const loadingText = document.createElement('p');
            loadingText.textContent = 'Loading release notes...';
            card.append(loadingHeading, loadingText);
            modal.style.display = 'flex';
            notificationState.modalOpen = true;
            notificationState.notificationRequested = true;
            return;
        }

        card.replaceChildren();
        const heading = document.createElement('h2');
        heading.textContent = notificationState.pendingUpdate ? 'New update available' : "What's new?";
        card.appendChild(heading);

        if (notificationState.pendingUpdate) {
            const updateText = document.createElement('p');
            updateText.textContent = notificationState.pendingUpdate.message + ' Latest version: ' + notificationState.pendingUpdate.version + '.';
            card.appendChild(updateText);
            if (notificationState.pendingUpdate.url) {
                const releaseButton = document.createElement('button');
                releaseButton.type = 'button';
                releaseButton.className = 'a350-notification-primary';
                releaseButton.textContent = 'OPEN GITHUB RELEASES';
                const releaseUrl = notificationState.pendingUpdate.url;
                releaseButton.addEventListener('click', () => window.open(releaseUrl, '_blank', 'noopener,noreferrer'));
                card.appendChild(releaseButton);
            }
        }

        const changelogVersion = notificationState.pendingChangelogVersion;
        if (changelogVersion) {
            const versionData = notificationState.changelog && notificationState.changelog.versions
                ? notificationState.changelog.versions[changelogVersion]
                : null;
            const subheading = document.createElement('h3');
            subheading.textContent = versionData && versionData.title ? versionData.title : "What's new in A350 Startup " + changelogVersion + '?';
            card.appendChild(subheading);
            const changes = versionData && Array.isArray(versionData.changes) ? versionData.changes : [];
            if (changes.length) {
                const list = document.createElement('ul');
                changes.forEach(change => {
                    const item = document.createElement('li');
                    item.textContent = String(change);
                    list.appendChild(item);
                });
                card.appendChild(list);
            } else {
                const message = document.createElement('p');
                message.textContent = 'Release notes are not available yet.';
                card.appendChild(message);
            }
        }

        notificationState.pendingAnnouncements.forEach(announcement => {
            const subheading = document.createElement('h3');
            subheading.textContent = announcement.title || 'Announcement';
            const message = document.createElement('p');
            message.textContent = announcement.message || '';
            card.append(subheading, message);
        });

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = 'CLOSE';
        closeButton.addEventListener('click', closeNotificationModal);
        card.appendChild(closeButton);

        // Opening the notification counts as reading it; the STARTUP button stops blinking.
        if (notificationState.pendingUpdate) storageSet(STORAGE_KEYS.seenUpdateVersion, notificationState.pendingUpdate.version);
        if (changelogVersion) storageRemove(STORAGE_KEYS.pendingChangelogVersion);
        if (notificationState.pendingAnnouncements.length) {
            const seen = new Set(getSeenAnnouncementIds());
            notificationState.pendingAnnouncements.forEach(item => seen.add(String(item.id)));
            storageSet(STORAGE_KEYS.seenAnnouncements, JSON.stringify(Array.from(seen)));
        }
        notificationState.pendingUpdate = null;
        notificationState.pendingChangelogVersion = null;
        notificationState.pendingAnnouncements = [];
        notificationState.modalOpen = true;
        notificationState.notificationRequested = false;
        modal.style.display = 'flex';
        updateMenuNotificationState();
    }

    initializeVersionNotification();

    // ============================================================
    // AUDIO
    // ============================================================

    const audio = {
        click: new Audio(SOUND_URLS.click),
        fanStart: new Audio(SOUND_URLS.fanStart),
        fanRunning: new Audio(SOUND_URLS.fanRunning),
        cabin: new Audio(SOUND_URLS.cabin),
        seatbelts: new Audio(SOUND_URLS.seatbelts)
    };

    audio.click.volume = 0.45;
    audio.cabin.volume = 0.55;
    audio.seatbelts.volume = 0.55;
    audio.fanStart.volume = FAN_NORMAL_VOLUME;
    audio.fanRunning.volume = FAN_NORMAL_VOLUME;
    audio.fanRunning.loop = true;
    audio.fanStart.loop = false;

    function playAudio(name, restart = true) {
        if (!state.soundEnabled || !audio[name]) return false;
        const sound = audio[name];
        try {
            if (restart) sound.currentTime = 0;
            const result = sound.play();
            if (result && typeof result.catch === 'function') {
                result.catch(error => console.warn('[A350 v3.14.0] Audio playback failed:', name, error));
            }
            return true;
        } catch (error) {
            console.warn('[A350 v3.14.0] Audio playback failed:', name, error);
            return false;
        }
    }

    function stopAudio(name) {
        const sound = audio[name];
        if (!sound) return;
        try { sound.pause(); sound.currentTime = 0; } catch (_) {}
    }

    function playClick() { playAudio('click'); }

    function addAudioTimer(callback, delay) {
        const timer = setTimeout(() => {
            state.audioTimers = state.audioTimers.filter(id => id !== timer);
            callback();
        }, delay);
        state.audioTimers.push(timer);
        return timer;
    }

    function clearAudioTimers() {
        state.audioTimers.forEach(clearTimeout);
        state.audioTimers = [];
    }

    function clearFanVolumeTimer() {
        if (state.fanVolumeTimer !== null) {
            clearInterval(state.fanVolumeTimer);
            state.fanVolumeTimer = null;
        }
        state.fanShuttingDown = false;
    }

    function fadeFanVolume(target, duration = FAN_FADE_DURATION) {
        clearFanVolumeTimer();
        if (!state.soundEnabled) return;
        const sound = audio.fanRunning;
        if (sound.paused) return;

        const startVolume = sound.volume;
        const difference = target - startVolume;
        const startTime = Date.now();
        if (Math.abs(difference) < 0.01) {
            sound.volume = target;
            return;
        }

        sound.playbackRate = 1;
        state.fanVolumeTimer = setInterval(() => {
            if (!state.soundEnabled) {
                clearFanVolumeTimer();
                return;
            }
            const progress = Math.min(1, (Date.now() - startTime) / Math.max(1, duration));
            // A smooth, gradual fade rather than a sudden volume step.
            const eased = progress * progress * (3 - 2 * progress);
            sound.volume = Math.max(0, Math.min(1, startVolume + difference * eased));
            if (progress >= 1) {
                sound.volume = target;
                clearFanVolumeTimer();
            }
        }, 50);
    }

    // At BAT 2 OFF, let the fan sound wind down naturally: reduce volume and
    // slightly lower playback speed before stopping and resetting the audio.
    function fadeFanToStop(duration = FAN_SHUTDOWN_FADE_DURATION) {
        clearFanVolumeTimer();
        const sound = audio.fanRunning;
        state.fanShutdownRequested = true;
        audio.fanStart.onended = null;
        stopAudio('fanStart');
        if (!state.soundEnabled || sound.paused) {
            try {
                sound.pause();
                sound.currentTime = 0;
                sound.playbackRate = 1;
                sound.volume = FAN_NORMAL_VOLUME;
            } catch (_) {}
            state.fanSequenceRequested = false;
            return;
        }

        const startVolume = sound.volume;
        const startRate = sound.playbackRate || 1;
        const startTime = Date.now();
        state.fanShuttingDown = true;

        state.fanVolumeTimer = setInterval(() => {
            if (!state.soundEnabled) {
                clearFanVolumeTimer();
                stopAudio('fanRunning');
                sound.playbackRate = 1;
                sound.volume = FAN_NORMAL_VOLUME;
                state.fanSequenceRequested = false;
                return;
            }

            const progress = Math.min(1, (Date.now() - startTime) / Math.max(1, duration));
            const eased = progress * progress * (3 - 2 * progress);
            sound.volume = Math.max(0, startVolume * (1 - eased));
            sound.playbackRate = Math.max(0.62, startRate - 0.34 * eased);

            if (progress >= 1) {
                clearFanVolumeTimer();
                try {
                    sound.pause();
                    sound.currentTime = 0;
                    sound.playbackRate = 1;
                    sound.volume = FAN_NORMAL_VOLUME;
                } catch (_) {}
                state.fanSequenceRequested = false;
            }
        }, 50);
    }

    function clearAPUTimer() {
        if (state.apuTimer !== null) { clearTimeout(state.apuTimer); state.apuTimer = null; }
        state.apuRunToken++;
    }

    function clearEXTAPUStartTimer() {
        if (state.extApuStartTimer !== null) {
            clearTimeout(state.extApuStartTimer);
            state.extApuStartTimer = null;
        }
        state.extApuStartToken++;
    }

    function clearLandingChoiceTimer() {
        if (state.landingChoiceTimer !== null) {
            clearTimeout(state.landingChoiceTimer);
            state.landingChoiceTimer = null;
        }
    }

    function clearStartupModalTimer() {
        if (state.startupModalTimer !== null) {
            clearTimeout(state.startupModalTimer);
            state.startupModalTimer = null;
        }
    }

    function setModalDisplay(id, display) {
        getDocuments().forEach(doc => {
            const modal = doc.getElementById(id);
            if (modal) modal.style.display = display;
        });
    }

    function syncModalDisplays() {
        const ids = ['a350-startup-modal', 'a350-turnaround-modal'];
        const mainDoc = document;
        const popupDoc = getOverheadDocument();
        if (!popupDoc) return;
        ids.forEach(id => {
            const source = mainDoc.getElementById(id);
            const target = popupDoc.getElementById(id);
            if (source && target) target.style.display = source.style.display || 'none';
        });
    }

    function scheduleLandingChoice() {
        clearLandingChoiceTimer();
        state.landingChoicePending = true;
        state.landingChoiceTimer = setTimeout(() => {
            state.landingChoiceTimer = null;
            if (state.image !== 25 || !state.landingChoicePending) return;
            setModalDisplay('a350-turnaround-modal', 'flex');
        }, LANDING_CHOICE_DELAY);
    }

    function showStartupChoiceModal() {
        if (!state.startupModalReady || state.startChoice !== null) return;
        setModalDisplay('a350-startup-modal', 'flex');
    }

    function scheduleStartupChoiceAfterReset() {
        clearStartupModalTimer();
        state.startupModalReady = false;
        state.firstOpen = false;
        state.startupModalTimer = setTimeout(() => {
            state.startupModalTimer = null;
            state.startupModalReady = true;
            if ((state.open || getOverheadDocument()) && state.image === 1 && state.startChoice === null) {
                showStartupChoiceModal();
            }
        }, STARTUP_MODAL_RESET_DELAY);
    }

    function clearPostFlightAPUTimer() {
        if (state.postFlightAPUTimer !== null) {
            clearTimeout(state.postFlightAPUTimer);
            state.postFlightAPUTimer = null;
        }
        state.postFlightAPUToken++;
    }

    function startPostFlightAPUTimer() {
        clearPostFlightAPUTimer();
        const token = state.postFlightAPUToken;
        state.postFlightAPUTimer = setTimeout(() => {
            if (token !== state.postFlightAPUToken) return;
            state.postFlightAPUTimer = null;
            if (state.image !== 38) return;
            loadImage(39);
            console.log('[A350 v3.14.0] Post-flight APU start delay finished — image 39 loaded.');
        }, POST_FLIGHT_APU_DELAY);
    }

    function clearENGTransitionTimer() {
        if (state.engTransitionTimer !== null) {
            clearTimeout(state.engTransitionTimer);
            state.engTransitionTimer = null;
        }
        state.engTransitionToken++;
        state.engTransitionPending = false;
    }

    function scheduleENGPanelResult(callback) {
        clearENGTransitionTimer();
        state.engTransitionPending = true;
        const token = state.engTransitionToken;

        state.engTransitionTimer = setTimeout(() => {
            if (token !== state.engTransitionToken) return;
            state.engTransitionTimer = null;
            state.engTransitionPending = false;
            callback();
        }, ENG_PANEL_RESULT_DELAY);
    }

    function clearPostFlightShutdownMonitor() {
        if (state.postFlightShutdownMonitorTimer !== null) {
            clearTimeout(state.postFlightShutdownMonitorTimer);
            state.postFlightShutdownMonitorTimer = null;
        }
    }

    // Any step being processed automatically must ignore panel navigation until
    // its timer or external-power operation has completed.
    function getAutomaticStepLockMessage() {
        if (state.extBusy) return 'External power is connecting or disconnecting. Please wait.';
        if (state.fullShutdownActive && state.image === 25 && !state.extConnected) {
            return 'Connect EXT PWR in the GROUND tab before continuing.';
        }
        if (state.engTransitionPending) return 'Please wait for the ENG panel sequence to finish.';
        if (state.landingChoicePending) return 'Choose FULL SHUTDOWN or SHORT TURNAROUND first.';
        if (state.apuTimer !== null) return 'Wait until the APU shows AVAIL.';
        if (state.extApuStartTimer !== null) return 'Wait for the EXT APU start sequence to finish.';
        if (state.postFlightAPUTimer !== null) return 'Wait until the APU start delay finishes.';
        if (state.postFlightShutdownReleaseScheduled) return 'Wait for the engine shutdown sequence to finish.';
        if (state.fanShuttingDown) return 'Wait for the fan shutdown sound to finish.';
        if (state.startChoice === 'apu' && state.image === 9 && state.apuStarted && !state.apuAvailable) {
            return 'Wait until the APU shows AVAIL.';
        }
        if (state.startChoice === 'ext' && state.image === 77 && !state.extApuStartTimer) {
            return 'Wait for the EXT APU start sequence to finish.';
        }
        return '';
    }

    // Prefer GeoFS's live engine status. If this aircraft build does not expose
    // a readable status, fall back to the addon's confirmed start/stop state.
    function isEngineStoppedForShutdown(engineNumber) {
        // A successful stopEngines() call is the addon's own confirmation.
        // This avoids getting stuck if a GeoFS aircraft build keeps a stale
        // 'started' boolean while its engine is already shutting down.
        if (engineNumber === 1 && state.eng1ShutdownCommandSent) return true;
        if (engineNumber === 2 && state.eng2ShutdownCommandSent) return true;

        // Also recognize engines that the user stopped manually in GeoFS.
        const liveStatus = getEngineStatus(engineNumber);
        if (liveStatus === false) return true;
        if (liveStatus === true) return false;

        if (engineNumber === 1) {
            return !state.eng1Started && !state.eng1Starting && !state.eng1Stopping;
        }
        return !state.eng2Started && !state.eng2Starting && !state.eng2Stopping;
    }

    function areBothEnginesStoppedForShutdown() {
        return isEngineStoppedForShutdown(1) && isEngineStoppedForShutdown(2);
    }

    // After ENG image 94 is clicked, image 95 and overhead image 42 are shown
    // for 2.5 seconds. Then the ENG panel closes, but overhead image 42 stays
    // on screen so the user can perform/confirm the ENG 2 shutdown step there.
    function finishPostFlightENGPanelDisplay() {
        if (!state.postFlightShutdownActive || state.image !== 42 || state.engImage !== 95) return;
        state.engPanelOpen = false;
        setEngPanelVisibility(false, 'LOCKED', true);
        restoreSidebarAfterENG();
        console.log('[A350 v3.14.0] ENG image 95 display finished; ENG panel locked/closed and overhead image 42 left visible.');
    }

    function clearEngineTimers() {
        clearENGTransitionTimer();
        state.engineTimers.forEach(clearTimeout);
        state.engineTimers = [];
        state.eng1Starting = false;
        state.eng2Starting = false;
    }

    function stopAllAudio() {
        clearAudioTimers();
        clearFanVolumeTimer();
        Object.keys(audio).forEach(stopAudio);
        audio.fanStart.onended = null;
        audio.fanRunning.volume = FAN_NORMAL_VOLUME;
        audio.fanRunning.playbackRate = 1;
        audio.fanRunning.loop = true;
        state.fanSequenceRequested = false;
        state.fanShuttingDown = false;
        state.fanShutdownRequested = true;
    }

    // Fan Start plays once in full; Fan Running then loops continuously.
    // Repeated requests must not interrupt either sound.
    function startFanSequence(delay) {
        if (state.fanSequenceRequested) return;
        state.fanShutdownRequested = false;
        state.fanSequenceRequested = true;

        const start = () => {
            if (!state.soundEnabled || state.fanShutdownRequested) return;
            audio.fanRunning.volume = FAN_NORMAL_VOLUME;
            audio.fanRunning.loop = true;
            audio.fanStart.onended = () => {
                audio.fanStart.onended = null;
                if (state.soundEnabled && !state.fanShutdownRequested) playAudio('fanRunning');
            };
            playAudio('fanStart');
        };

        if (delay <= 0) start();
        else addAudioTimer(start, delay);
    }

    function playCabinPowerUp(delay = 1000) {
        playAudio('cabin');
        addAudioTimer(() => playAudio('seatbelts'), delay);
    }

    function updateSoundUI() {
        getDocuments().forEach(doc => {
            const checkbox = doc.getElementById('a350-sound-toggle');
            if (checkbox) checkbox.checked = state.soundEnabled;
        });
    }

    // ============================================================
    // CHECKLIST DATA
    // ============================================================

    const commonInfo = {
        battery: 'Press BAT 1 and BAT 2 which both are located to the left in the ELEC section.',
        adirs: 'Press the ADIRS switches in the ADIRS section from left to right.',
        crew: 'Press the Crew supply button in the oxygen section.',
        fuel: 'Press all the buttons in the fuel section from left to right.',
        emer: 'Press the Emer exit lt switch in the Signs section.'
    };

    const extBoardingChecklist = [
        { section: 'When boarding is about to begin, we need to turn on the APU.' },
        { text: 'APU MASTER ON', info: 'Press the MASTER SWITCH located at the top of the APU section.' },
        { text: 'APU Start (wait 3 seconds after APU MASTER ON)', info: 'Wait 3 seconds after turning on the MASTER SWITCH, then press the START button under the MASTER SWITCH in the APU section.' },
        { text: 'APU GEN ON', info: 'Press the button labeled APU GEN to the right in the ELEC section.' },
        { text: 'APU BLEED ON', info: 'Press APU BLEED in the middle of the AIR section.' },
        { text: 'PACK 1 ON', info: 'Press PACK 1 at the bottom of the AIR section.' },
        { text: 'PACK 2 ON', info: 'Press PACK 2 at the bottom of the AIR section.' },
        { text: 'EXT 1 OFF', info: 'Press EXT 1 in the middle of the ELEC section.' },
        { text: 'EXT 2 OFF', info: 'Press EXT 2 in the middle of the ELEC section.' },
        { text: 'Disconnect EXT', info: 'Open GROUND and press DISCONNECT EXT PWR. When the disconnection finishes, the panel automatically advances from image 84 to image 25.' }
    ];

    const afterBoardingChecklist = [
        { section: 'After boarding' },
        { text: 'Seatbelt sign ON', info: 'Press the seatbelt sign switch in the Signs section.' },
        { text: 'Pack 1 and 2 OFF', info: 'Press PACK 1 and PACK 2 in the AIR section.' },
        { text: 'ENG Mode selector to IGN/START', info: 'Open the ENG start panel by pressing the button under this checklist and press on the switch in the middle.' },
        { text: 'Start ENG 2', info: 'Press ENG 2.' },
        { text: 'Start ENG 1 (wait until ENG 2 has turned on)', info: 'Press ENG 1.' }
    ];

    const afterStartChecklist = [
        { section: 'After start' },
        { text: 'ENG Mode selector to NORM (wait until ENG 1 and 2 is fully turned on)', info: 'Press on the switch in the middle of the box in the bottom right.' },
        { text: 'ENG 1 and 2 BLEED on', info: 'Press ENG 1 BLEED and ENG 2 BLEED in the top of the AIR section.' },
        { text: 'Pack 1 and 2 on', info: 'Press PACK 1 and 2 in the bottom of the AIR section.' },
        { text: 'APU Bleed OFF', info: 'Press APU BLEED which is in the middle of the AIR section.' },
        { text: 'APU GEN off', info: 'Press APU GEN in ELEC section.' },
        { text: 'APU MASTER off', info: 'Press APU MASTER in the APU section.' },
        { text: 'FLAPS', info: 'Test all flap positions and leave it on 1 or 2 after (press F).' },
        { text: 'SPOILERS', info: 'Test all 3 spoiler positions and leave it ARMED (Press B).' },
        { text: 'CONTROL', info: 'Test controls by moving mouse or joystick up, down, left and right.' }
    ];

    const flightAndLandingChecklist = [
        { section: 'Above 10 000 ft' },
        { text: 'Seatbelt sign OFF', info: 'Press the seatbelt sign switch in the Signs section.' },
        { section: 'Between 15 000 - 10 000 ft on descent' },
        { text: 'Seatbelt sign ON', info: 'Press the seatbelt sign switch in the Signs section.' },
        { section: 'After landing' },
        { text: 'APU MASTER ON', info: 'Press the MASTER SWITCH located at the top of the APU section.' },
        { text: 'APU Start (wait 3 seconds after APU MASTER ON)', info: 'Wait 3 seconds after turning on the MASTER SWITCH, then press the START button under the MASTER SWITCH in the APU section.' },
        { text: 'APU gen ON (when APU start is AVAIL)', info: 'Press the button labeled APU GEN to the right in the ELEC section.' }
    ];

    const postFlightChecklist = [
        { section: 'After engine shutdown' },
        { text: 'Shut down ENG 1 – BLEED 1 OFF + PACK 1 OFF', info: 'Use the ENG panel to shut down ENG 1. Press ENG 1 BLEED and PACK 1 in the AIR section to turn them OFF.' },
        { text: 'Shut down ENG 2 – BLEED 2 OFF + PACK 2 OFF (no need to wait for ENG 1)', info: 'Use the ENG panel to shut down ENG 2. Press ENG 2 BLEED and PACK 2 in the AIR section to turn them OFF. You do not need to wait for ENG 1.' },
        { text: 'APU BLEED ON', info: 'Press APU BLEED in the middle of the AIR section.' },
        { text: 'PACK 1 ON', info: 'Press PACK 1 at the bottom of the AIR section.' },
        { text: 'PACK 2 ON', info: 'Press PACK 2 at the bottom of the AIR section.' },
        { text: 'Seatbelt sign OFF', info: 'Press the seatbelt sign switch in the Signs section.' }
    ];

    const shortTurnaroundChecklist = [
        { text: 'Program A/P and route', info: '' },
        { section: 'Boarding' },
        { section: 'After boarding' },
        { text: 'Seatbelt sign ON', info: 'Press the seatbelt sign switch in the Signs section.' },
        { text: 'Pack 1 and 2 OFF', info: 'Press PACK 1 and 2 in the AIR section.' },
        { text: 'ENG Mode selector to IGN/START', info: 'Open the ENG start panel by pressing the button under this checklist and press on the switch in the middle.' },
        { text: 'Start ENG 2', info: 'Press ENG 2.' },
        { text: 'Start ENG 1 (wait until ENG 2 has turned on)', info: 'Press ENG 1.' },
        { section: 'After start' },
        { text: 'ENG Mode selector to NORM (wait until ENG 1 and 2 are fully turned on)', info: 'Press on the switch in the middle of the box in the bottom right.' },
        { text: 'ENG 1 and 2 BLEED ON', info: 'Press ENG 1 BLEED and ENG 2 BLEED at the top of the AIR section.' },
        { text: 'Pack 1 and 2 ON', info: 'Press PACK 1 and 2 at the bottom of the AIR section.' },
        { text: 'APU BLEED OFF', info: 'Press APU BLEED in the middle of the AIR section.' },
        { text: 'APU GEN OFF', info: 'Press APU GEN in the ELEC section.' },
        ...flightAndLandingChecklist,
        ...postFlightChecklist
    ];

    const fullShutdownChecklist = [
        { section: 'Full shutdown' },
        { text: 'Connect EXT', info: 'Open GROUND and press CONNECT.' },
        { text: 'Turn on EXT 1 and 2 (when they show AVAIL)', info: 'Press EXT 1 and EXT 2 which are found to the right of BAT 2.' },
        { text: 'APU BLEED OFF', info: 'Press APU BLEED which is in the middle of the AIR section.' },
        { text: 'APU GEN OFF', info: 'Press APU GEN in ELEC section.' },
        { text: 'APU MASTER OFF', info: 'Press APU MASTER in the APU section.' },
        { text: 'Turn off the fuel pumps', info: 'Press all the buttons in the fuel section from left to right.' },
        { text: 'Crew supply OFF', info: 'Press the Crew supply button in the oxygen section.' },
        { text: 'Turn ADIRS 1–3 to OFF', info: 'Press on the ADIRS switches in the ADIRS section from left to right.' },
        { text: 'Emer exit lt OFF', info: 'Press the Emer exit lt switch in the Signs section.' },
        { text: 'Battery 1 OFF', info: 'Press BAT 1 to the left in the ELEC section.' },
        { text: 'Battery 2 OFF', info: 'Press BAT 2 to the left in the ELEC section.' }
    ];

    const checklistData = {
        extDisconnected: {
            title: 'EXT — NOT CONNECTED',
            description: 'EXT has been selected, but external power was not connected before startup.',
            items: [
                { text: 'Battery 1 and 2', info: commonInfo.battery },
                { text: 'Connect EXT', info: 'Open GROUND and press CONNECT EXT PWR.' },
                { text: 'Turn on EXT 1 and 2 (when they show AVAIL)', info: 'Press EXT 1 and EXT 2, located to the right of BAT 2.' },
                { text: 'Turn ADIRS 1–3 to NAV', info: commonInfo.adirs },
                { text: 'Crew supply ON', info: commonInfo.crew },
                { text: 'Turn on the fuel pumps', info: commonInfo.fuel },
                { text: 'Arm Emer exit lt', info: commonInfo.emer },
                { text: 'Program A/P and route', info: '' },
                ...extBoardingChecklist
            ]
        },
        extConnected: {
            title: 'EXT — CONNECTED',
            description: 'External power is connected.',
            items: [
                { text: 'Battery 1 and 2', info: commonInfo.battery },
                { text: 'Turn on EXT 1 and 2 (when they show AVAIL)', info: 'Press EXT 1 and EXT 2, located to the right of BAT 2.' },
                { text: 'Turn ADIRS 1–3 to NAV', info: commonInfo.adirs },
                { text: 'Crew supply ON', info: commonInfo.crew },
                { text: 'Turn on the fuel pumps', info: commonInfo.fuel },
                { text: 'Arm Emer exit lt', info: commonInfo.emer },
                { text: 'Program A/P and route', info: '' },
                ...extBoardingChecklist
            ]
        },
        apu: {
            title: 'APU START',
            description: 'APU start checklist.',
            items: [
                { text: 'Battery 1 and 2', info: commonInfo.battery },
                { text: 'APU MASTER ON', info: 'Press the MASTER SWITCH at the top of the APU section.' },
                { text: 'APU Start (wait 3 seconds after APU MASTER ON)', info: 'Wait 3 seconds after turning on the MASTER SWITCH, then press the START button under the MASTER SWITCH in the APU section.' },
                { text: 'APU Gen (wait until APU shows AVAIL)', info: 'Press APU GEN to the right in the ELEC section.' },
                { text: 'APU Bleed on', info: 'Press APU BLEED in the middle of the AIR section.' },
                { text: 'Pack 1 and 2 ON', info: 'Press PACK 1 and 2 at the bottom of the AIR section.' },
                { text: 'Turn ADIRS 1–3 to NAV', info: commonInfo.adirs },
                { text: 'Crew supply ON', info: commonInfo.crew },
                { text: 'Turn on the fuel pumps', info: commonInfo.fuel },
                { text: 'Arm Emer exit lt', info: commonInfo.emer },
                { text: 'Program A/P and route', info: '' }
            ]
        }
    };

    function getChecklistKey() {
        if (state.startChoice === 'apu') return 'apu';
        if (state.checklistLocked && state.lockedChecklistKey) return state.lockedChecklistKey;
        return state.extConnected ? 'extConnected' : 'extDisconnected';
    }

    // ============================================================
    // STYLES
    // ============================================================

    const style = document.createElement('style');
    style.textContent = `
        #a350-startup-overlay { position:fixed; inset:0; z-index:999990; display:none; pointer-events:none; font-family:Arial,sans-serif; }
        #a350-startup-window { font-family:Arial,sans-serif; position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:92vw; height:88vh; display:flex; background:rgba(10,10,10,.97); border:1px solid #555; border-radius:6px; box-shadow:0 10px 40px #000; overflow:hidden; pointer-events:auto; }
        #a350-left { width:340px; min-width:340px; flex:0 0 340px; display:flex; flex-direction:column; min-height:0; background:#121212; border-right:1px solid #555; color:white; transition:flex-basis .18s ease,width .18s ease,min-width .18s ease; overflow:hidden; }
        #a350-startup-window.a350-sidebar-collapsed #a350-left, #a350-overhead-window.a350-sidebar-collapsed #a350-left { flex:0 0 0!important; width:0!important; min-width:0!important; max-width:0!important; border-right:0!important; padding:0!important; overflow:hidden!important; }
        #a350-sidebar-toggle { position:absolute; top:50%; left:340px; transform:translate(-50%,-50%); z-index:30; width:38px; height:82px; padding:0 3px; display:flex; align-items:center; justify-content:center; background:linear-gradient(90deg,#151515,#303030); border:1px solid #858585; border-left-color:#555; border-radius:0 24px 24px 0; box-shadow:3px 0 10px rgba(0,0,0,.55),inset -3px 0 5px rgba(255,255,255,.08); color:#fff; font-family:Arial,sans-serif; font-size:27px; font-weight:normal; line-height:1; cursor:pointer; transition:background .15s ease,box-shadow .15s ease; }
        #a350-sidebar-toggle:hover { background:linear-gradient(90deg,#242424,#444); box-shadow:4px 0 13px rgba(0,0,0,.65),inset -3px 0 6px rgba(255,255,255,.12); }
        #a350-sidebar-toggle:disabled { opacity:.78; cursor:default; }
        #a350-startup-window.a350-sidebar-collapsed #a350-sidebar-toggle, #a350-overhead-window.a350-sidebar-collapsed #a350-sidebar-toggle { left:0; transform:translate(0,-50%); border-radius:0 24px 24px 0; }
        #a350-overhead-window #a350-left { transition:flex-basis .18s ease,width .18s ease,min-width .18s ease; }
        #a350-left-header { padding:12px 16px; border-bottom:1px solid #444; flex-shrink:0; }
        #a350-title { font-size:20px; font-weight:bold; }
        #a350-version { margin-top:3px; color:#888; font-size:11px; }
        #a350-overhead-button { display:block; width:100%; height:34px; margin-top:10px; background:#222; border:1px solid #666; border-radius:4px; color:white; font-weight:bold; cursor:pointer; }
        #a350-tabs { display:flex; border-bottom:1px solid #444; flex-shrink:0; }
        .a350-tab { flex:1; height:36px; border:0; background:transparent; color:#aaa; font-size:11px; font-weight:bold; cursor:pointer; }
        .a350-tab.active { color:white; background:#292929; }
        #a350-checklist-content { flex:1 1 auto; min-height:0; overflow-y:auto; padding:12px 14px; }
        #a350-observation { margin-bottom:14px; padding:9px; background:#222; border:1px solid #666; border-radius:4px; color:#ddd; font-size:11px; font-weight:bold; line-height:1.4; }
        .a350-section-title { margin:8px 0 10px; color:#bbb; font-size:12px; font-weight:bold; text-transform:uppercase; }
        .a350-check-item { margin-bottom:12px; color:#eee; font-size:13px; line-height:1.35; }
        .a350-check-main { display:flex; align-items:flex-start; gap:7px; }
        .a350-check-main input { width:16px; height:16px; margin:0; flex-shrink:0; cursor:pointer; }
        .a350-check-text { flex:1; cursor:pointer; }
        .a350-check-item.checked .a350-check-text { color:#777; text-decoration:line-through; }
        .a350-more-info { padding:0; border:0; background:transparent; color:#999; font-size:10px; cursor:pointer; white-space:nowrap; }
        .a350-more-info:hover { color:white; text-decoration:underline; }
        .a350-info-text { display:none; margin:5px 0 0 23px; padding:7px 8px; background:#191919; border-left:2px solid #666; color:#aaa; font-size:11px; line-height:1.4; }
        .a350-info-text.visible { display:block; }
        #a350-eng-area { flex:0 0 auto; margin:0 12px; padding-top:8px; border-top:1px solid #444; }
        #a350-eng-image-frame { display:none; height:100px; margin-top:10px; overflow:hidden; background:#080808; position:relative; cursor:crosshair; }
        #a350-eng-image { display:block; position:absolute; top:0; left:0; max-width:none; max-height:none; user-select:none; -webkit-user-drag:none; }
        #a350-bottom-buttons { display:flex; gap:8px; padding:10px 12px 12px; flex-shrink:0; }
        .a350-bottom-button { flex:1; padding:9px 5px; background:#222; border:1px solid #666; border-radius:4px; color:white; font-size:11px; font-weight:bold; cursor:pointer; }
        .a350-bottom-button:hover, .a350-ground-button:hover, #a350-overhead-button:hover { background:#333; }
        #a350-ground-controls, #a350-settings { display:none; padding:14px; overflow-y:auto; }
        .a350-ground-button { width:100%; margin-bottom:10px; padding:10px; background:#222; border:1px solid #666; border-radius:4px; color:white; font-size:12px; font-weight:bold; cursor:pointer; }
        .a350-ground-button:disabled { opacity:.4; cursor:default; }
        #a350-ext-status { margin-bottom:16px; padding:9px; border:1px solid #555; border-radius:4px; background:#111; color:#aaa; text-align:center; font-size:12px; }
        .a350-setting { margin-bottom:18px; color:#ddd; font-size:13px; }
        .a350-setting label { display:flex; align-items:center; gap:8px; cursor:pointer; }
        #a350-panel-area { position:relative; flex:1; min-width:0; min-height:0; display:flex; align-items:center; justify-content:center; background:#080808; overflow:hidden; }
        #a350-panel-image-wrapper { position:relative; overflow:hidden; cursor:crosshair; user-select:none; box-shadow:0 0 20px rgba(0,0,0,.7); }
        #a350-panel-image { display:block; max-width:none; max-height:none; user-select:none; -webkit-user-drag:none; }
        #a350-panel-topbar { position:absolute; top:10px; left:10px; right:10px; display:flex; justify-content:space-between; align-items:center; pointer-events:none; }
        #a350-panel-topbar-left { display:flex; align-items:center; gap:8px; pointer-events:none; }
        #a350-image-number { padding:6px 10px; background:rgba(0,0,0,.75); border:1px solid #555; border-radius:4px; color:white; font-size:12px; }
        #a350-back { width:36px; height:36px; background:rgba(0,0,0,.75); border:1px solid #777; border-radius:4px; color:white; font-size:22px; line-height:1; cursor:pointer; pointer-events:auto; }
        #a350-back:hover, #a350-close:hover { background:rgba(70,70,70,.9); }
        #a350-back:disabled { opacity:.35; cursor:default; }
        #a350-close { width:36px; height:36px; background:rgba(0,0,0,.75); border:1px solid #777; border-radius:4px; color:white; font-size:20px; cursor:pointer; pointer-events:auto; }
        #a350-warning { display:none; position:absolute; bottom:20px; left:50%; transform:translateX(-50%); padding:9px 14px; background:rgba(100,0,0,.9); border:1px solid #d33; border-radius:4px; color:#ffb0b0; font-size:12px; font-weight:bold; white-space:nowrap; pointer-events:none; }
        #a350-startup-menu-button { position:relative; z-index:1000000; white-space:nowrap; }
        #a350-startup-menu-button.a350-hidden-in-replay { display:none!important; }
        @keyframes a350StartupRedBlink { 0%,49% { background:#a00000!important; color:#fff!important; box-shadow:0 0 0 1px #ff5555,0 0 12px rgba(255,0,0,.8); } 50%,100% { background:#222!important; color:#fff!important; box-shadow:none; } }
        #a350-startup-menu-button.a350-notification-blink { animation:a350StartupRedBlink 1s steps(2,start) infinite; border:1px solid #ff5555!important; border-radius:3px; }
        #a350-notification-modal { position:absolute; inset:0; z-index:1000010; display:none; pointer-events:auto; align-items:center; justify-content:center; padding:16px; box-sizing:border-box; background:rgba(0,0,0,.82); }
        #a350-notification-card { width:min(520px,92vw); max-height:82%; overflow:auto; padding:22px; box-sizing:border-box; background:#171717; border:1px solid #777; border-radius:7px; color:#eee; font-family:Arial,sans-serif; box-shadow:0 10px 40px #000; }
        #a350-notification-card h2 { margin:0 0 14px; color:#fff; font-size:19px; }
        #a350-notification-card h3 { margin:16px 0 8px; color:#ddd; font-size:14px; }
        #a350-notification-card p, #a350-notification-card li { color:#bbb; font-size:12px; line-height:1.55; }
        #a350-notification-card ul { padding-left:20px; }
        #a350-notification-card button { width:100%; margin-top:12px; padding:10px; background:#333; border:1px solid #777; border-radius:4px; color:#fff; font-weight:bold; cursor:pointer; }
        #a350-notification-card button.a350-notification-primary { background:#174a70; border-color:#4388b8; }
        #a350-startup-modal { position:fixed; inset:0; z-index:1000005; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.78); pointer-events:auto; }
        #a350-startup-modal-card { font-family:Arial,sans-serif; width:min(420px,90vw); padding:22px; background:#171717; border:1px solid #666; border-radius:7px; color:white; box-shadow:0 10px 40px #000; }
        #a350-startup-modal-card h2 { margin:0 0 16px; font-size:18px; }
        #a350-startup-modal-card p { color:#bbb; font-size:12px; line-height:1.5; }
        #a350-startup-modal-card label { display:block; margin:12px 0; font-size:13px; }
        #a350-startup-modal-card select { width:100%; padding:8px; margin-top:6px; background:#222; color:white; border:1px solid #666; }
        #a350-startup-modal-card button, #a350-turnaround-modal-card button { width:100%; margin-top:12px; padding:10px; background:#333; border:1px solid #777; border-radius:4px; color:white; font-weight:bold; cursor:pointer; }
        #a350-turnaround-modal { position:fixed; inset:0; z-index:1000006; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.78); pointer-events:auto; }
        #a350-turnaround-modal-card { font-family:Arial,sans-serif; width:min(440px,90vw); padding:22px; background:#171717; border:1px solid #666; border-radius:7px; color:white; box-shadow:0 10px 40px #000; }
        #a350-turnaround-modal-card h2 { margin:0 0 12px; font-size:18px; }
        #a350-turnaround-modal-card p { color:#bbb; font-size:12px; line-height:1.5; }
        #a350-turnaround-actions { display:flex; gap:10px; }
        #a350-turnaround-actions button { flex:1; }
        html.a350-popup-html, body.a350-popup-body { width:100%; height:100%; margin:0; padding:0; overflow:hidden; background:#080808; font-family:Arial,sans-serif; }
        #a350-overhead-window { font-family:Arial,sans-serif!important; position:fixed!important; inset:0!important; width:100vw!important; height:100vh!important; transform:none!important; margin:0!important; border-radius:0!important; box-sizing:border-box!important; display:flex!important; overflow:hidden!important; }
        #a350-overhead-window #a350-left { flex:0 0 340px!important; width:340px!important; min-width:340px!important; max-width:340px!important; height:100%!important; box-sizing:border-box!important; }
        #a350-overhead-window #a350-sidebar-toggle { position:absolute!important; top:50%!important; left:340px!important; transform:translate(-50%,-50%)!important; z-index:30!important; width:38px!important; height:82px!important; }
        #a350-overhead-window.a350-sidebar-collapsed #a350-sidebar-toggle { left:0!important; transform:translate(0,-50%)!important; }
        #a350-overhead-window.a350-sidebar-collapsed #a350-left { flex:0 0 0!important; width:0!important; min-width:0!important; max-width:0!important; border-right:0!important; overflow:hidden!important; }
        #a350-overhead-window #a350-panel-area { flex:1 1 auto!important; width:auto!important; min-width:0!important; min-height:0!important; height:100%!important; display:flex!important; align-items:center!important; justify-content:center!important; overflow:hidden!important; }
        #a350-overhead-window #a350-panel-topbar-left { display:flex!important; align-items:center!important; gap:8px!important; }
        #a350-overhead-window #a350-back, #a350-overhead-window #a350-close { pointer-events:auto!important; }
        #a350-overhead-window #a350-overhead-button, #a350-overhead-window #a350-startup-modal { display:none!important; }
    `;
    document.head.appendChild(style);

    // ============================================================
    // DOCUMENT HELPERS
    // ============================================================

    function getOverheadDocument() {
        try { if (overheadWindow && !overheadWindow.closed) return overheadWindow.document; } catch (_) {}
        overheadWindow = null;
        return null;
    }

    function getDocuments() {
        const docs = [document];
        const popupDoc = getOverheadDocument();
        if (popupDoc) docs.push(popupDoc);
        return docs;
    }

    function syncText(id, text) {
        getDocuments().forEach(doc => {
            const element = doc.getElementById(id);
            if (element) element.textContent = text;
        });
    }

    function syncImageNumber() { syncText('a350-image-number', 'PANEL ' + state.image); }

    function showWarning(message) {
        getDocuments().forEach(doc => {
            const warning = doc.getElementById('a350-warning');
            if (warning) { warning.textContent = message; warning.style.display = 'block'; }
        });
    }

    function hideWarning() {
        getDocuments().forEach(doc => {
            const warning = doc.getElementById('a350-warning');
            if (warning) warning.style.display = 'none';
        });
    }

    // ============================================================
    // SEQUENCE TRACKING
    // ============================================================

    function getActiveSequence() {
        if (state.fullShutdownActive) return FULL_SHUTDOWN_SEQUENCE;
        if (state.shortTurnaroundActive) return TURNAROUND_SEQUENCE;
        if (state.startChoice === 'apu') return APU_SEQUENCE;
        if (state.startChoice === 'ext') {
            if (state.extConnectedDuringSequence) return EXT_SEQUENCE_CONNECTED_LATER;
            if (state.extInitiallyConnected && state.extConnected) return EXT_SEQUENCE_CONNECTED_INITIALLY;
            return EXT_SEQUENCE_CONNECTED_LATER;
        }
        return null;
    }

    function resetSequenceCursor() {
        const sequence = getActiveSequence();
        const index = sequence ? sequence.indexOf(state.image) : -1;
        state.sequenceIndex = index >= 0 ? index : 0;
    }

    function updateSequenceCursor(previousImage, newImage) {
        if (!state.startChoice || previousImage === newImage) return;
        const sequence = getActiveSequence();
        if (!sequence) return;
        if (sequence[state.sequenceIndex] === previousImage && sequence[state.sequenceIndex + 1] === newImage) {
            state.sequenceIndex++;
            return;
        }
        if (
            state.shortTurnaroundActive &&
            state.sequenceIndex === sequence.length - 1 &&
            previousImage === sequence[sequence.length - 1] &&
            newImage === sequence[1]
        ) {
            state.sequenceIndex = 1;
            return;
        }
        for (let i = Math.max(0, state.sequenceIndex); i < sequence.length - 1; i++) {
            if (sequence[i] === previousImage && sequence[i + 1] === newImage) {
                state.sequenceIndex = i + 1;
                return;
            }
        }
        let bestIndex = -1;
        let bestDistance = Infinity;
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i] !== newImage) continue;
            const distance = Math.abs(i - state.sequenceIndex);
            if (distance < bestDistance) { bestDistance = distance; bestIndex = i; }
        }
        if (bestIndex >= 0) state.sequenceIndex = bestIndex;
    }

    // ============================================================
    // IMAGE CROPPING AND LOADING
    // ============================================================

    function applyCroppedImageLayout(doc, imageId, wrapperId, panelId, cropTop) {
        const image = doc.getElementById(imageId);
        const wrapper = doc.getElementById(wrapperId);
        const panel = doc.getElementById(panelId);
        if (!image || !wrapper || !panel || !image.naturalWidth) return false;

        const panelWidth = panel.clientWidth;
        const panelHeight = panel.clientHeight;
        // Do not size images while the panel is hidden or mid-transition.
        if (panelWidth < 120 || panelHeight < 120) return false;

        const naturalWidth = image.naturalWidth || 1414;
        const naturalHeight = image.naturalHeight || 2000;
        const cropHeight = Math.max(1, naturalHeight - cropTop);
        const availableWidth = Math.max(100, panelWidth - 24);
        const availableHeight = Math.max(100, panelHeight * 0.96);
        const scale = Math.min(availableWidth / naturalWidth, availableHeight / cropHeight);

        wrapper.style.width = (naturalWidth * scale) + 'px';
        wrapper.style.height = (cropHeight * scale) + 'px';
        image.style.width = (naturalWidth * scale) + 'px';
        image.style.height = (naturalHeight * scale) + 'px';
        image.style.transform = 'translateY(-' + (cropTop * scale) + 'px)';
        image.style.transformOrigin = 'top left';
        return true;
    }

    function fitCroppedImage(doc, imageId, wrapperId, panelId, src, cropTop) {
        const image = doc.getElementById(imageId);
        const wrapper = doc.getElementById(wrapperId);
        const panel = doc.getElementById(panelId);
        if (!image || !wrapper || !panel) return;

        const applyLayout = () => applyCroppedImageLayout(doc, imageId, wrapperId, panelId, cropTop);
        image.onload = applyLayout;
        image.onerror = () => console.error('[A350 v3.14.0] Could not load image:', src);

        if (image.getAttribute('src') !== src) {
            image.src = src;
        } else if (image.complete && image.naturalWidth) {
            applyLayout();
        }
    }

    function applyENGImageLayout(doc) {
        const image = doc.getElementById('a350-eng-image');
        const frame = doc.getElementById('a350-eng-image-frame');
        if (!image || !frame || !image.naturalWidth || frame.clientWidth < 80 || frame.clientHeight < 60) return false;

        const naturalWidth = image.naturalWidth || 1414;
        const naturalHeight = image.naturalHeight || 2000;
        const visibleHeight = Math.max(1, naturalHeight - ENG_CROP_TOP);
        const scale = Math.min((frame.clientWidth - 4) / naturalWidth, (frame.clientHeight - 4) / visibleHeight);
        if (!Number.isFinite(scale) || scale <= 0) return false;

        image.style.width = (naturalWidth * scale) + 'px';
        image.style.height = (naturalHeight * scale) + 'px';
        image.style.transform = 'translateY(-' + (ENG_CROP_TOP * scale) + 'px)';
        image.style.transformOrigin = 'top left';
        image.style.left = Math.max(0, (frame.clientWidth - naturalWidth * scale) / 2) + 'px';
        return true;
    }

    function schedulePanelLayoutRefresh() {
        [60, 220, 380].forEach(delay => setTimeout(() => {
            getDocuments().forEach(doc => {
                const image = doc.getElementById('a350-panel-image');
                if (image) {
                    fitCroppedImage(doc, 'a350-panel-image', 'a350-panel-image-wrapper', 'a350-panel-area', IMAGE_BASE + state.image + '.png', CROP_TOP);
                }
                if (state.engPanelOpen) applyENGImageLayout(doc);
            });
        }, delay));
    }

    function setEngPanelVisibility(open, buttonText = null, buttonDisabled = false) {
        getDocuments().forEach(doc => {
            const frame = doc.getElementById('a350-eng-image-frame');
            const button = doc.getElementById('a350-eng-toggle');
            if (frame) frame.style.display = open ? 'block' : 'none';
            if (button) {
                button.textContent = buttonText || (open ? 'CLOSE' : 'OPEN');
                button.disabled = buttonDisabled;
            }
        });
    }

    function syncSidebarUI() {
        getDocuments().forEach(doc => {
            const panel = doc.getElementById('a350-startup-window') || doc.getElementById('a350-overhead-window');
            const button = doc.getElementById('a350-sidebar-toggle');
            if (panel) panel.classList.toggle('a350-sidebar-collapsed', state.sidebarCollapsed);
            if (button) {
                button.textContent = state.sidebarCollapsed ? '>' : '<';
                button.title = state.sidebarCollapsed ? 'Show side panel' : 'Hide side panel';
                button.setAttribute('aria-label', button.title);
                button.disabled = state.sidebarAutoExpanded;
            }
        });
    }

    function setSidebarCollapsed(collapsed) {
        state.sidebarCollapsed = !!collapsed;
        syncSidebarUI();
        schedulePanelLayoutRefresh();
    }

    function handleSidebarToggle() {
        if (state.sidebarAutoExpanded) {
            showWarning('The side panel is temporarily held open for the ENG procedure.');
            return;
        }
        setSidebarCollapsed(!state.sidebarCollapsed);
        playClick();
    }

    function expandSidebarForENG() {
        if (state.sidebarAutoExpanded) return;
        state.sidebarRestoreCollapsed = state.sidebarCollapsed;
        state.sidebarAutoExpanded = true;
        if (state.sidebarCollapsed) state.sidebarCollapsed = false;
        syncSidebarUI();
        schedulePanelLayoutRefresh();
    }

    function restoreSidebarAfterENG() {
        if (!state.sidebarAutoExpanded) return;
        const shouldCollapse = state.sidebarRestoreCollapsed;
        state.sidebarAutoExpanded = false;
        state.sidebarRestoreCollapsed = false;
        state.sidebarCollapsed = shouldCollapse;
        syncSidebarUI();
        schedulePanelLayoutRefresh();
    }

    function beginEngineStart() {
        if (state.engineStartPanelActive || state.engineStartPanelComplete || state.engNormReached) return;
        state.engineStartPanelActive = true;
        expandSidebarForENG();
        state.engPanelOpen = true;
        state.engImage = 89;
        state.engMode = 'NORM';
        state.currentTab = 'before';
        showTab('before');
        setEngPanelVisibility(true, 'LOCKED OPEN', true);
        loadEngImage(89);
        console.log('[A350 v3.14.0] ENG start panel automatically unlocked/opened at overhead image 28.');
    }

    function finishEngineStart() {
        state.engineStartPanelActive = false;
        state.engineStartPanelComplete = true;
        state.engNormReached = true;
        state.engPanelOpen = false;
        setEngPanelVisibility(false, 'LOCKED', true);
        restoreSidebarAfterENG();
        console.log('[A350 v3.14.0] ENG start complete at image 93 (NORM); ENG panel automatically closed and locked.');
    }

    function beginPostFlightShutdown() {
        if (state.postFlightShutdownComplete) return;
        clearPostFlightShutdownMonitor();
        state.postFlightShutdownReleaseScheduled = false;
        state.postFlightShutdownActive = true;
        expandSidebarForENG();
        state.eng1ShutdownCommandSent = false;
        state.eng2ShutdownCommandSent = false;
        state.engPanelOpen = true;
        state.engImage = 93;
        state.currentTab = 'before';
        showTab('before');
        setEngPanelVisibility(true, 'LOCKED OPEN', true);
        loadEngImage(93);
        console.log('[A350 v3.14.0] Post-flight shutdown mode active at overhead image 40.');
    }

    function finishPostFlightShutdown() {
        clearPostFlightShutdownMonitor();
        state.postFlightShutdownReleaseScheduled = false;
        state.postFlightShutdownActive = false;
        state.postFlightShutdownComplete = true;
        state.eng1Started = false;
        state.eng2Started = false;
        state.eng1Starting = false;
        state.eng2Starting = false;
        state.eng1Stopping = false;
        state.eng2Stopping = false;
        state.eng1ShutdownCommandSent = true;
        state.eng2ShutdownCommandSent = true;
        state.engPanelOpen = false;
        setEngPanelVisibility(false, 'LOCKED', true);
        console.log('[A350 v3.14.0] ENG panel sequence completed; overhead image 42 remains available for ENG 2 shutdown.');
    }

    function loadImage(number) {
        const previousImage = state.image;
        const newImage = Math.max(1, Number(number) || 1);

        // Cancel the automatic APU delay if the user/script leaves image 38.
        if (newImage !== 38 && state.postFlightAPUTimer !== null) {
            clearPostFlightAPUTimer();
        }
        if (newImage !== 25 && state.landingChoicePending) {
            clearLandingChoiceTimer();
            state.landingChoicePending = false;
            hideTurnaroundChoice();
        }

        updateSequenceCursor(previousImage, newImage);
        state.image = newImage;
        syncImageNumber();

        // Engine start is a locked, automatic ENG-panel sequence at overhead image 28.
        if (state.image === 28 && !state.engNormReached && !state.postFlightShutdownActive && !state.engineStartPanelComplete) {
            beginEngineStart();
        }

        getDocuments().forEach(doc => fitCroppedImage(
            doc, 'a350-panel-image', 'a350-panel-image-wrapper', 'a350-panel-area',
            IMAGE_BASE + state.image + '.png', CROP_TOP
        ));

        // Image 40 locks normal overhead navigation and opens ENG shutdown controls.
        if (state.image === 40 && previousImage !== 40 && !state.postFlightShutdownComplete) {
            beginPostFlightShutdown();
        }

        // The shutdown ENG image and the large overhead image are paired.
        if (state.engPanelOpen && state.image === 41) loadEngImage(94);
        else if (state.engPanelOpen && state.image === 42) loadEngImage(95);

        // Do not automatically advance from overhead image 42 to 43.
        // Image 42 must remain visible after the 2.5-second image-95 display.
        if (state.image !== 42) clearPostFlightShutdownMonitor();

        hideWarning();

        if (previousImage !== state.image) {
            if (state.image === 26) playAudio('seatbelts');
            if (state.image === 27) fadeFanVolume(FAN_LOW_VOLUME);
            if (state.image === 31) fadeFanVolume(FAN_NORMAL_VOLUME);
            // On full shutdown, lower the fan sound when the user presses image 48
            // and advances to image 49 (APU BLEED OFF).
            if (state.fullShutdownActive && previousImage === 48 && state.image === 49) {
                fadeFanVolume(FAN_APU_BLEED_VOLUME, FAN_APU_BLEED_FADE_DURATION);
            }
            // BAT 2 OFF: wind the fan down with a gradual volume and pitch fade.
            if (state.image === 64) fadeFanToStop(FAN_SHUTDOWN_FADE_DURATION);
            if (previousImage === 35 && state.image === 36) playAudio('seatbelts');
            if (previousImage === 36 && state.image === 35) playAudio('seatbelts');
            if (previousImage === 45 && state.image === 25) {
                playAudio('seatbelts');
                scheduleLandingChoice();
            }

            // After landing: image 37 -> 38, wait 8 seconds, then automatically show 39.
            if (previousImage === 37 && state.image === 38) {
                startPostFlightAPUTimer();
            }
        }

        if (state.startChoice === 'apu' && state.image === 11 && !state.apuGenSoundsPlayed) {
            state.apuGenSoundsPlayed = true;
            playCabinPowerUp(1000);
        }

        if (state.startChoice === 'ext' && state.extInitiallyConnected && state.extConnected && state.image === 6 && !state.extSoundsStarted) {
            startEXTSounds();
        }
    }

    function loadEngImage(number) {
        state.engImage = Math.max(89, Math.min(95, Number(number) || 89));

        // Image 93 is the only image that changes the mode/marks the start sequence complete.
        // Images 94 and 95 are shutdown controls and must not change the selector state.
        if (state.engImage === 93) {
            state.engMode = 'NORM';
            state.engNormReached = true;
        }

        const src = ENG_BASE + state.engImage + '.png';
        getDocuments().forEach(doc => {
            const image = doc.getElementById('a350-eng-image');
            const frame = doc.getElementById('a350-eng-image-frame');
            if (!image || !frame) return;

            image.onload = () => applyENGImageLayout(doc);
            image.onerror = () => console.error('[A350 v3.14.0] Could not load ENG image:', state.engImage);
            if (image.getAttribute('src') !== src) image.src = src;
            else if (image.complete && image.naturalWidth) applyENGImageLayout(doc);
        });

        // The ENG frame may have been opened while the sidebar was transitioning.
        // Refit after layout settles so the first visible frame is already full size.
        [60, 220, 380].forEach(delay => setTimeout(() => {
            getDocuments().forEach(doc => applyENGImageLayout(doc));
        }, delay));
    }

    // ============================================================
    // CHECKLIST RENDERING
    // ============================================================

    function resetChecklist() {
        getDocuments().forEach(doc => {
            doc.querySelectorAll('#a350-checklist-content input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
                const item = checkbox.closest('.a350-check-item');
                if (item) item.classList.remove('checked');
            });
        });
    }

    function createChecklistItem(item, container, doc, checked = false) {
        if (item.section) {
            const heading = doc.createElement('div');
            heading.className = 'a350-section-title';
            heading.style.marginTop = '20px';
            heading.textContent = item.section;
            container.appendChild(heading);
            return;
        }

        const wrapper = doc.createElement('div');
        wrapper.className = 'a350-check-item';
        const main = doc.createElement('div');
        main.className = 'a350-check-main';
        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = checked;
        if (checked) wrapper.classList.add('checked');

        const text = doc.createElement('span');
        text.className = 'a350-check-text';
        text.textContent = item.text;

        const infoButton = doc.createElement('button');
        infoButton.type = 'button';
        infoButton.className = 'a350-more-info';
        infoButton.textContent = '[ More info ]';
        infoButton.style.display = item.info ? '' : 'none';

        const info = doc.createElement('div');
        info.className = 'a350-info-text';
        info.textContent = item.info;

        checkbox.addEventListener('change', () => wrapper.classList.toggle('checked', checkbox.checked));
        infoButton.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation(); playClick(); info.classList.toggle('visible');
        });

        main.append(checkbox, text, infoButton);
        wrapper.append(main, info);
        container.appendChild(wrapper);
    }

    function renderChecklist(doc) {
        const content = doc.getElementById('a350-checklist-content');
        if (!content) return;
        const previousChecks = new Map();
        content.querySelectorAll('.a350-check-item').forEach(wrapper => {
            const text = wrapper.querySelector('.a350-check-text');
            const checkbox = wrapper.querySelector('input[type="checkbox"]');
            if (text && checkbox) previousChecks.set(text.textContent, checkbox.checked);
        });
        content.innerHTML = '';

        const observation = doc.createElement('div');
        observation.id = 'a350-observation';
        observation.textContent = 'OBS! Every button has to be pushed from left to right (except the engines)';
        content.appendChild(observation);

        let items;
        if (state.checklistMode === 'fullShutdown') {
            items = fullShutdownChecklist;
        } else if (state.checklistMode === 'shortTurnaround') {
            items = shortTurnaroundChecklist;
        } else {
            const key = getChecklistKey();
            const data = checklistData[key];
            if (key === 'apu') {
                const title = doc.createElement('div');
                title.className = 'a350-section-title';
                title.textContent = data.title;
                content.appendChild(title);
                const description = doc.createElement('p');
                description.style.cssText = 'color:#aaa;font-size:11px;line-height:1.4;margin:0 0 14px;';
                description.textContent = data.description;
                content.appendChild(description);
            }
            items = [
                ...data.items,
                ...afterBoardingChecklist,
                ...afterStartChecklist,
                ...flightAndLandingChecklist,
                ...postFlightChecklist
            ];
        }

        items.forEach(item => createChecklistItem(item, content, doc, previousChecks.get(item.text) === true));
    }

    function refreshChecklist() { getDocuments().forEach(renderChecklist); }


    function hideTurnaroundChoice() {
        setModalDisplay('a350-turnaround-modal', 'none');
    }

    function resetENGCycleForNextFlight() {
        clearENGTransitionTimer();
        state.engPanelOpen = false;
        state.engImage = 89;
        state.eng1Started = false;
        state.eng2Started = false;
        state.eng1Starting = false;
        state.eng2Starting = false;
        state.eng1Stopping = false;
        state.eng2Stopping = false;
        state.eng1ShutdownCommandSent = false;
        state.eng2ShutdownCommandSent = false;
        state.engMode = 'NORM';
        state.engNormReached = false;
        state.engineStartPanelActive = false;
        state.engineStartPanelComplete = false;
        state.postFlightShutdownActive = false;
        state.postFlightShutdownComplete = false;
        clearPostFlightShutdownMonitor();
        setEngPanelVisibility(false, 'OPEN', false);
        loadEngImage(89);
        restoreSidebarAfterENG();
    }

    function chooseShortTurnaround() {
        clearLandingChoiceTimer();
        state.landingChoicePending = false;
        hideTurnaroundChoice();
        state.shortTurnaroundActive = true;
        state.fullShutdownActive = false;
        state.checklistMode = 'shortTurnaround';
        state.currentTab = 'before';
        showTab('before');
        resetENGCycleForNextFlight();
        state.sequenceIndex = 0;
        resetChecklist();
        refreshChecklist();
        loadImage(25);
        state.sequenceIndex = 0;
        console.log('[A350 v3.14.0] Short turnaround selected; repeating cycle from image 25.');
    }

    function chooseFullShutdown() {
        clearLandingChoiceTimer();
        state.landingChoicePending = false;
        hideTurnaroundChoice();
        state.shortTurnaroundActive = false;
        state.fullShutdownActive = true;
        state.checklistMode = 'fullShutdown';
        state.currentTab = 'before';
        showTab('before');

        // Every full shutdown requires a fresh EXT connection while image 25 is held.
        // Image 46 is shown only after the new connection has completed.
        state.extTimerToken++;
        state.extBusy = false;
        state.extConnected = false;
        state.extInitiallyConnected = false;
        state.extConnectedDuringSequence = false;

        state.sequenceIndex = 0;
        resetChecklist();
        refreshChecklist();
        updateEXTUI();
        loadImage(25);
        console.log('[A350 v3.14.0] Full shutdown selected; EXT reset to DISCONNECTED and sequence locked at image 25.');
    }

    function completeFullShutdownEXTReset() {
        clearLandingChoiceTimer();
        clearPostFlightAPUTimer();
        clearAPUTimer();
        clearEXTAPUStartTimer();
        clearPostFlightShutdownMonitor();
        clearENGTransitionTimer();
        state.extTimerToken++;
        clearEngineTimers();
        state.landingChoicePending = false;
        state.checklistLocked = false;
        state.lockedChecklistKey = null;
        state.fullShutdownActive = false;
        state.shortTurnaroundActive = false;
        state.postFlightShutdownActive = false;
        state.postFlightShutdownComplete = false;
        state.engineStartPanelActive = false;
        state.engineStartPanelComplete = false;
        state.engPanelOpen = false;
        state.engNormReached = false;
        state.engImage = 89;
        state.eng1Started = false;
        state.eng2Started = false;
        state.eng1ShutdownCommandSent = false;
        state.eng2ShutdownCommandSent = false;
        state.eng1Starting = false;
        state.eng2Starting = false;
        state.eng1Stopping = false;
        state.eng2Stopping = false;
        state.startChoice = null;
        state.checklistMode = 'startup';
        state.currentTab = 'before';
        state.sequenceIndex = 0;
        state.extConnected = false;
        state.extBusy = false;
        state.extInitiallyConnected = false;
        state.extConnectedDuringSequence = false;
        state.extSoundsStarted = false;
        state.apuStarted = false;
        state.apuAvailable = false;
        state.apuGenSoundsPlayed = false;
        stopAllAudio();
        audio.fanRunning.loop = true;
        audio.fanRunning.volume = FAN_NORMAL_VOLUME;
        restoreSidebarAfterENG();
        setEngPanelVisibility(false, 'OPEN', false);
        loadImage(1);
        loadEngImage(89);
        resetChecklist();
        refreshChecklist();
        updateEXTUI();
        showTab('before');
        hideWarning();
        hideTurnaroundChoice();
        setModalDisplay('a350-startup-modal', 'none');
        scheduleStartupChoiceAfterReset();
        console.log('[A350 v3.14.0] EXT supply disconnected after full shutdown. Returned to image 1; startup choice will appear after 5 seconds.');
    }

    // ============================================================
    // EXT GROUND CONTROLS
    // ============================================================

    function updateEXTUI() {
        getDocuments().forEach(doc => {
            const status = doc.getElementById('a350-ext-status');
            const connect = doc.getElementById('a350-ext-connect');
            const disconnect = doc.getElementById('a350-ext-disconnect');
            if (status) status.textContent = state.extBusy
                ? 'EXT PWR — CONNECTING / DISCONNECTING...'
                : state.extConnected ? 'EXT PWR — CONNECTED / AVAIL' : 'EXT PWR — DISCONNECTED';
            if (connect) connect.disabled = state.extBusy || state.extConnected;
            if (disconnect) disconnect.disabled = state.extBusy || !state.extConnected;
        });
    }

    function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    async function connectEXT() {
        if (state.extBusy || state.extConnected) return;
        const imageBeforeConnect = state.image;
        const wasInExtSequence = state.startChoice === 'ext' && !state.fullShutdownActive;
        const isFullShutdownConnectStep = state.fullShutdownActive && imageBeforeConnect === 25 && !state.extConnected;
        state.extBusy = true;
        const token = ++state.extTimerToken;
        updateEXTUI();
        await wait(EXT_DELAY);
        if (token !== state.extTimerToken) return;
        state.extConnected = true;

        if (wasInExtSequence) {
            if (imageBeforeConnect === 1 && state.image === 1) {
                state.extInitiallyConnected = true;
                state.extConnectedDuringSequence = false;
            } else {
                state.extConnectedDuringSequence = true;
                state.extInitiallyConnected = false;
            }
        }
        // Keep the overhead locked until any automatic image transition is complete.
        // Image 25 is the EXT-connect wait; image 46 means EXT is available.
        if (isFullShutdownConnectStep && state.fullShutdownActive && state.image === 25) {
            loadImage(46);
        } else if (wasInExtSequence && imageBeforeConnect === 3 && state.image === 3) {
            loadImage(4);
        }

        state.extBusy = false;
        updateEXTUI();
        refreshChecklist();
    }

    async function disconnectEXT() {
        if (state.extBusy || !state.extConnected) return;
        const disconnectAtBoardingStep = state.startChoice === 'ext' && state.image === 84 && !state.fullShutdownActive;
        const disconnectAtFullShutdownEnd = state.fullShutdownActive && state.image === 64;
        state.extBusy = true;
        const token = ++state.extTimerToken;
        updateEXTUI();
        await wait(EXT_DELAY);
        if (token !== state.extTimerToken) return;
        state.extConnected = false;
        state.extBusy = false;
        state.extInitiallyConnected = false;
        state.extConnectedDuringSequence = false;

        if (disconnectAtBoardingStep) {
            // Do not interrupt Fan Start or Fan Running when EXT is disconnected.
            stopAudio('cabin');
            stopAudio('seatbelts');
            state.extSoundsStarted = true;
            loadImage(25);
        }
        if (disconnectAtFullShutdownEnd) {
            completeFullShutdownEXTReset();
        }
        updateEXTUI();
        refreshChecklist();
    }

    // ============================================================
    // STARTUP SOUND SEQUENCES
    // ============================================================

    function startAPUSounds() {
        startFanSequence(FAN_START_DELAY_APU);
    }

    function startEXTSounds() {
        if (state.extSoundsStarted) return;
        state.extSoundsStarted = true;
        playCabinPowerUp(1000);
        startFanSequence(FAN_START_DELAY_EXT);
    }

    // ============================================================
    // APU START SEQUENCE
    // ============================================================

    function startAPUSequence() {
        if (state.startChoice !== 'apu' || state.image !== 9) return;
        if (state.apuStarted || state.apuAvailable) return;
        state.apuStarted = true;
        state.apuAvailable = false;
        const runToken = ++state.apuRunToken;
        state.apuTimer = setTimeout(() => {
            if (runToken !== state.apuRunToken) return;
            state.apuTimer = null;
            if (state.startChoice !== 'apu' || !state.apuStarted || state.image !== 9) {
                console.warn('[A350 v3.14.0] APU timer cancelled or sequence changed.');
                return;
            }
            state.apuAvailable = true;
            loadImage(10);
            console.log('[A350 v3.14.0] APU AVAIL — image 10 loaded automatically.');
        }, APU_READY_DELAY);
        startAPUSounds();
        console.log('[A350 v3.14.0] APU startup started from image 8.');
    }

    // ============================================================
    // EXT APU START — IMAGE 77 TO IMAGE 78
    // ============================================================

    function startEXTAPUStartDelay() {
        clearEXTAPUStartTimer();
        const runToken = state.extApuStartToken;
        state.extApuStartTimer = setTimeout(() => {
            if (runToken !== state.extApuStartToken) return;
            state.extApuStartTimer = null;
            if (state.startChoice !== 'ext' || state.image !== 77) return;
            loadImage(78);
            console.log('[A350 v3.14.0] EXT APU start delay finished — image 78 loaded.');
        }, EXT_APU_START_DELAY);
    }

    // ============================================================
    // PANEL IMAGE FLOW
    // ============================================================

    function getNextImage() {
        const sequence = getActiveSequence();
        if (!sequence) return null;
        if (sequence[state.sequenceIndex] === state.image) {
            if (state.shortTurnaroundActive && state.sequenceIndex === sequence.length - 1) {
                return sequence[1];
            }
            return state.sequenceIndex >= sequence.length - 1 ? null : sequence[state.sequenceIndex + 1];
        }
        for (let i = Math.max(0, state.sequenceIndex); i < sequence.length - 1; i++) {
            if (sequence[i] === state.image) { state.sequenceIndex = i; return sequence[i + 1]; }
        }
        if (state.shortTurnaroundActive && state.image === sequence[sequence.length - 1]) {
            state.sequenceIndex = sequence.length - 1;
            return sequence[1];
        }
        return null;
    }

    function getPreviousImage() {
        const sequence = getActiveSequence();
        if (!sequence) return null;

        const cursor = Math.max(0, Math.min(state.sequenceIndex, sequence.length - 1));
        if (sequence[cursor] === state.image) {
            if (state.shortTurnaroundActive && cursor === 0) return sequence[sequence.length - 2];
            return cursor > 0 ? sequence[cursor - 1] : null;
        }

        // Prefer the closest matching occurrence at or before the current cursor.
        for (let i = cursor; i >= 0; i--) {
            if (sequence[i] === state.image) {
                state.sequenceIndex = i;
                return i > 0 ? sequence[i - 1] : null;
            }
        }

        // If the sequence cursor is temporarily stale, use the closest occurrence.
        let bestIndex = -1;
        let bestDistance = Infinity;
        for (let i = 0; i < sequence.length; i++) {
            if (sequence[i] !== state.image) continue;
            const distance = Math.abs(i - cursor);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
            }
        }
        if (bestIndex >= 0) {
            state.sequenceIndex = bestIndex;
            return bestIndex > 0 ? sequence[bestIndex - 1] : null;
        }
        return null;
    }

    function handlePreviousImage() {
        playClick();
        const automaticLock = getAutomaticStepLockMessage();
        if (automaticLock) { showWarning(automaticLock); return; }
        if (state.landingChoicePending) { showWarning('Choose FULL SHUTDOWN or SHORT TURNAROUND first.'); return; }

        if (state.engineStartPanelActive && state.image === 28) {
            showWarning('Overhead navigation is locked until the ENG start panel finishes.');
            return;
        }
        if (state.engTransitionPending) {
            showWarning('Wait for the ENG panel sequence to finish.');
            return;
        }
        if (!state.startChoice) {
            showWarning('Choose APU or EXT first.');
            return;
        }
        if (state.image === 38 && state.postFlightAPUTimer !== null) {
            showWarning('Wait until the APU start delay finishes.');
            return;
        }
        if (state.image === 28 && !state.engNormReached) {
            showWarning('Complete the ENG start sequence and reach image 93 (NORM) first.');
            return;
        }
        if (state.postFlightShutdownActive && [40, 41, 42].includes(state.image)) {
            showWarning('Overhead navigation is locked. Finish the ENG shutdown sequence first.');
            return;
        }

        const previous = getPreviousImage();
        if (previous === null) {
            showWarning('This is the first image in the current sequence.');
            return;
        }
        if (state.postFlightShutdownComplete && [40, 41, 42].includes(previous)) {
            showWarning('The engine shutdown sequence is complete; you cannot return to its locked steps.');
            return;
        }

        loadImage(previous);
    }

    function handlePanelClick() {
        const automaticLock = getAutomaticStepLockMessage();
        if (automaticLock) { showWarning(automaticLock); return; }
        if (state.landingChoicePending) { showWarning('Choose FULL SHUTDOWN or SHORT TURNAROUND first.'); return; }
        if (state.engineStartPanelActive && state.image === 28) {
            showWarning('Overhead navigation is locked until the ENG start panel finishes.');
            return;
        }
        if (state.engTransitionPending) {
            showWarning('Wait for the ENG panel sequence to finish.');
            return;
        }
        if (state.startChoice === 'apu' && state.image === 9) return;
        if (state.startChoice === 'ext' && state.image === 77 && state.extApuStartTimer !== null) return;
        if (state.image === 38 && state.postFlightAPUTimer !== null) return;
        if (state.postFlightShutdownActive && state.image === 42 && !state.engPanelOpen) {
            // The ENG panel has already shown image 95 for 2.5 seconds and closed.
            // The large overhead image 42 is now the ENG 2 shutdown step.
            playClick();
            if (!isEngineStoppedForShutdown(2) && !stopEngine(2)) return;
            finishPostFlightShutdown();
            loadImage(43);
            return;
        }

        if (state.postFlightShutdownActive && [40, 41, 42].includes(state.image)) {
            showWarning('Overhead navigation is locked until the ENG panel has completed image 95 and closed.');
            return;
        }
        playClick();
        if (state.fullShutdownActive && state.image === 25 && !state.extConnected) {
            showWarning('Connect EXT PWR in the GROUND tab before continuing.');
            return;
        }
        if (state.fullShutdownActive && state.image === 64) {
            showWarning('Full shutdown complete. Disconnect EXT PWR in the GROUND tab to return to image 1.');
            return;
        }
        if (!state.startChoice && !state.fullShutdownActive && !state.shortTurnaroundActive) { showWarning('Choose APU or EXT first.'); return; }
        if (state.image === 28 && !state.engNormReached) {
            showWarning('Complete the ENG start sequence and reach image 93 (NORM) first.');
            return;
        }
        if (state.startChoice === 'apu' && state.image === 8) {
            loadImage(9); startAPUSequence(); return;
        }
        if (state.startChoice === 'apu' && state.image === 10) {
            if (!state.apuAvailable) { showWarning('Wait until the APU shows AVAIL.'); return; }
            loadImage(11); return;
        }
        if (state.startChoice === 'ext' && state.image === 76) {
            loadImage(77); startEXTAPUStartDelay(); return;
        }
        if (state.startChoice === 'ext' && state.image === 77) return;
        if (state.startChoice === 'ext' && state.extConnectedDuringSequence && state.extConnected && state.image === 5) {
            startEXTSounds(); loadImage(6); return;
        }
        if (state.startChoice === 'ext' && state.extInitiallyConnected && state.extConnected && state.image === 6) {
            if (!state.extSoundsStarted) startEXTSounds();
            const next = getNextImage();
            if (next !== null) loadImage(next);
            return;
        }

        const previousImage = state.image;
        const next = getNextImage();
        if (next === null) { showWarning('End of this startup sequence.'); return; }
        if (state.startChoice === 'ext' && previousImage === 2 && next === 3 && !state.extConnected && !state.extInitiallyConnected) {
            state.checklistLocked = true;
            state.lockedChecklistKey = 'extDisconnected';
        }
        loadImage(next);
    }

    // ============================================================
    // GEOFS ENGINE START / STOP FUNCTIONS
    // ============================================================

    function getAircraft() {
        if (typeof window.geofs === 'undefined' || !window.geofs.aircraft || !window.geofs.aircraft.instance) return null;
        return window.geofs.aircraft.instance;
    }

    function getEngineStatus(engineNumber) {
        const aircraft = getAircraft();
        if (!aircraft) return null;
        const index = engineNumber - 1;
        const candidates = [];
        if (Array.isArray(aircraft.engines)) candidates.push(aircraft.engines[index]);
        if (aircraft.engine && Array.isArray(aircraft.engine.engines)) candidates.push(aircraft.engine.engines[index]);
        const engine = candidates.find(Boolean);

        if (engine && typeof engine === 'object') {
            for (const key of ['running', 'isRunning', 'started', 'isStarted']) {
                if (typeof engine[key] === 'boolean') return engine[key];
            }
            for (const key of ['rpm', 'N1', 'n1', 'rotationSpeed', 'speed']) {
                if (typeof engine[key] === 'number') return engine[key] > 0.1;
            }
        }
        const directKeys = [`engine${engineNumber}Running`, `engine${engineNumber}Started`, `eng${engineNumber}Running`, `eng${engineNumber}Started`];
        for (const key of directKeys) if (typeof aircraft[key] === 'boolean') return aircraft[key];
        return null;
    }

    // Success requires status === true continuously for 3 seconds.
    // False/null resets the stability timer; reaching the overall timeout is failure.
    function waitForEngineStart(engineNumber, onStarted, onFailed) {
        const startTime = Date.now();
        let stableSince = null;
        let finished = false;
        let timer = null;

        function removeTimer() {
            if (timer !== null) {
                clearTimeout(timer);
                state.engineTimers = state.engineTimers.filter(id => id !== timer);
                timer = null;
            }
        }

        function finish(success) {
            if (finished) return;
            finished = true;
            removeTimer();
            if (success) onStarted();
            else onFailed();
        }

        function schedule() {
            const scheduledTimer = setTimeout(() => {
                state.engineTimers = state.engineTimers.filter(id => id !== scheduledTimer);
                if (timer === scheduledTimer) timer = null;
                poll();
            }, ENGINE_POLL_INTERVAL);
            timer = scheduledTimer;
            state.engineTimers.push(scheduledTimer);
        }

        function poll() {
            if (finished) return;
            const status = getEngineStatus(engineNumber);
            const now = Date.now();

            if (status === true) {
                if (stableSince === null) stableSince = now;
                if (
                    now - startTime >= ENGINE_MIN_START_DURATION &&
                    now - stableSince >= ENGINE_STABLE_DURATION
                ) {
                    finish(true);
                    return;
                }
            } else {
                stableSince = null;
            }

            if (now - startTime >= ENGINE_START_FALLBACK) {
                finish(false);
                return;
            }
            schedule();
        }

        schedule();
    }

    function startEngine1() {
        if (state.image !== 28 || !state.engPanelOpen) {
            showWarning('The ENG START panel can only be used when overhead image 28 is displayed and the panel is open.');
            return false;
        }
        const aircraft = getAircraft();
        if (!aircraft) {
            console.warn('[A350 v3.14.0] Aircraft not available.');
            showWarning('GeoFS aircraft is not available.');
            return false;
        }
        try {
            state.eng1ShutdownCommandSent = false;
            state.eng1Started = false;
            state.eng1Starting = true;
            aircraft.startEngines(0);
            console.log('[A350 v3.14.0] ENGINE 1 START COMMAND SENT.');
            waitForEngineStart(1, () => {
                state.eng1Starting = false;
                state.eng1Started = true;
                console.log('[A350 v3.14.0] ENGINE 1 START SEQUENCE COMPLETE (stable status confirmed).');
            }, () => {
                state.eng1Starting = false;
                state.eng1Started = false;
                console.warn('[A350 v3.14.0] ENGINE 1 START NOT CONFIRMED before timeout.');
                showWarning('ENG 1 did not reach a stable running state. Check the engine and try again.');
            });
            return true;
        } catch (error) {
            state.eng1Starting = false;
            state.eng1Started = false;
            console.error('[A350 v3.14.0] ENGINE 1 START ERROR:', error);
            showWarning('Could not start engine 1.');
            return false;
        }
    }

    function startEngine2() {
        if (state.image !== 28 || !state.engPanelOpen) {
            showWarning('The ENG START panel can only be used when overhead image 28 is displayed and the panel is open.');
            return false;
        }
        const aircraft = getAircraft();
        if (!aircraft) {
            console.warn('[A350 v3.14.0] Aircraft not available.');
            showWarning('GeoFS aircraft is not available.');
            return false;
        }
        try {
            state.eng2ShutdownCommandSent = false;
            state.eng2Started = false;
            state.eng2Starting = true;
            aircraft.startEngines(1);
            console.log('[A350 v3.14.0] ENGINE 2 START COMMAND SENT.');
            waitForEngineStart(2, () => {
                state.eng2Starting = false;
                state.eng2Started = true;
                console.log('[A350 v3.14.0] ENGINE 2 START SEQUENCE COMPLETE (stable status confirmed).');
            }, () => {
                state.eng2Starting = false;
                state.eng2Started = false;
                console.warn('[A350 v3.14.0] ENGINE 2 START NOT CONFIRMED before timeout.');
                showWarning('ENG 2 did not reach a stable running state. Check the engine and try again.');
            });
            return true;
        } catch (error) {
            state.eng2Starting = false;
            state.eng2Started = false;
            console.error('[A350 v3.14.0] ENGINE 2 START ERROR:', error);
            showWarning('Could not start engine 2.');
            return false;
        }
    }

    function stopEngine(engineNumber) {
        const aircraft = getAircraft();
        if (!aircraft) {
            showWarning('GeoFS aircraft is not available.');
            return false;
        }
        if (typeof aircraft.stopEngines !== 'function') {
            showWarning('This GeoFS aircraft does not expose the engine shutdown function.');
            return false;
        }

        try {
            // GeoFS engine indices: ENG 1 = 0; ENG 2 = 1.
            if (engineNumber === 1) state.eng1Stopping = true;
            else state.eng2Stopping = true;

            aircraft.stopEngines(engineNumber - 1);

            if (engineNumber === 1) {
                state.eng1ShutdownCommandSent = true;
                state.eng1Started = false;
                state.eng1Starting = false;
                state.eng1Stopping = false;
            } else {
                state.eng2ShutdownCommandSent = true;
                state.eng2Started = false;
                state.eng2Starting = false;
                state.eng2Stopping = false;
            }

            console.log(`[A350 v3.14.0] ENGINE ${engineNumber} STOP COMMAND SENT.`);
            return true;
        } catch (error) {
            if (engineNumber === 1) state.eng1Stopping = false;
            else state.eng2Stopping = false;
            console.error(`[A350 v3.14.0] ENGINE ${engineNumber} STOP ERROR:`, error);
            showWarning(`Could not shut down engine ${engineNumber}.`);
            return false;
        }
    }

    function handleEngPanelClick() {
        // Do not allow clicks to act on a hidden or locked engine panel.
        if (!state.engPanelOpen) {
            showWarning('The ENG panel is locked.');
            return;
        }
        if (state.engTransitionPending) {
            showWarning('Please wait for the ENG panel sequence to finish.');
            return;
        }

        playClick();

        // Normal startup flow at overhead image 28.
        if (state.image === 28) {
            if (state.engImage === 89) {
                state.engMode = 'NORM';
                loadEngImage(90);
                return;
            }
            if (state.engImage === 90) {
                state.engMode = 'IGN/START';
                loadEngImage(91);
                startEngine2();
                return;
            }
            if (state.engImage === 91) {
                if (state.eng2Starting) { showWarning('Wait for ENG 2 to finish starting.'); return; }
                if (!state.eng2Started) { showWarning('ENG 2 has not completed its start sequence.'); return; }
                loadEngImage(92);
                startEngine1();
                return;
            }
            if (state.engImage === 92) {
                if (state.eng1Starting) { showWarning('Wait for ENG 1 to finish starting.'); return; }
                if (!state.eng1Started) { showWarning('ENG 1 has not completed its start sequence.'); return; }
                // Show NORM (image 93) for 2.5 seconds before the ENG panel locks and closes.
                loadEngImage(93);
                state.engMode = 'NORM';
                scheduleENGPanelResult(() => {
                    if (
                        state.engineStartPanelActive &&
                        state.image === 28 &&
                        state.engImage === 93
                    ) {
                        finishEngineStart();
                    }
                });
                return;
            }
            if (state.engImage === 93) {
                state.engMode = 'NORM';
                showWarning('Engine start sequence complete.');
                return;
            }
        }

        // At overhead image 40, image 93 is the starting point for shutdown.
        // First show image 94 together with overhead image 41; the click on 94
        // then sends the ENG 1 shutdown command and advances to image 95 / overhead 42.
        if (state.postFlightShutdownActive && state.image === 40 && state.engImage === 93) {
            loadEngImage(94);
            loadImage(41);
            return;
        }

        if (state.postFlightShutdownActive && state.image === 41 && state.engImage === 94) {
            if (state.eng1Stopping) {
                showWarning('ENG 1 shutdown command is already being processed.');
                return;
            }
            if (stopEngine(1)) {
                loadEngImage(95);
                loadImage(42);
                scheduleENGPanelResult(() => {
                    finishPostFlightENGPanelDisplay();
                });
            }
            return;
        }

        if (state.postFlightShutdownActive && state.image === 42 && state.engImage === 95) {
            showWarning('ENG image 95 is being displayed. Wait for the ENG panel to close, then use overhead image 42 for ENG 2 shutdown.');
            return;
        }

        showWarning('Use the ENG panel at overhead image 28 for engine start, or follow the post-flight shutdown sequence from overhead image 40.');
    }

    // ============================================================
    // COLD & DARK
    // ============================================================

    function applyColdAndDark() {
        stopAllAudio();
        clearAPUTimer();
        clearEXTAPUStartTimer();
        clearPostFlightAPUTimer();
        clearPostFlightShutdownMonitor();
        clearLandingChoiceTimer();
        clearStartupModalTimer();
        clearEngineTimers();
        state.landingChoicePending = false;
        state.startupModalReady = true;
        state.checklistMode = 'startup';
        state.shortTurnaroundActive = false;
        state.fullShutdownActive = false;
        state.postFlightShutdownReleaseScheduled = false;
        state.image = 1;
        state.sequenceIndex = 0;
        state.startChoice = null;
        state.firstOpen = true;
        state.panelPosition = 'center';
        state.apuStarted = false;
        state.apuAvailable = false;
        state.apuGenSoundsPlayed = false;
        state.checklistLocked = false;
        state.lockedChecklistKey = null;
        state.extConnected = false;
        state.extBusy = false;
        state.extConnectedDuringSequence = false;
        state.extInitiallyConnected = false;
        state.extSoundsStarted = false;
        state.fanSequenceRequested = false;
        state.extTimerToken++;
        state.engPanelOpen = false;
        state.postFlightShutdownActive = false;
        state.postFlightShutdownComplete = false;
        state.engImage = 89;
        state.eng1Started = false;
        state.eng2Started = false;
        state.eng1Starting = false;
        state.eng2Starting = false;
        state.eng1Stopping = false;
        state.eng2Stopping = false;
        state.eng1ShutdownCommandSent = false;
        state.eng2ShutdownCommandSent = false;
        state.engMode = 'NORM';
        state.engNormReached = false;
        state.engineStartPanelActive = false;
        state.engineStartPanelComplete = false;
        restoreSidebarAfterENG();
        getDocuments().forEach(doc => {
            const frame = doc.getElementById('a350-eng-image-frame');
            const button = doc.getElementById('a350-eng-toggle');
            if (frame) frame.style.display = 'none';
            if (button) { button.textContent = 'OPEN'; button.disabled = false; }
        });
        loadImage(1);
        loadEngImage(89);
        resetChecklist();
        updateEXTUI();
        refreshChecklist();
        hideWarning();
        if (state.open || getOverheadDocument()) showStartupChoiceModal();
    }

    // ============================================================
    // TABS
    // ============================================================

    function applyTabToDocument(doc, tab) {
        const checklist = doc.getElementById('a350-checklist-content');
        const ground = doc.getElementById('a350-ground-controls');
        const settings = doc.getElementById('a350-settings');
        const engArea = doc.getElementById('a350-eng-area');
        const bottomButtons = doc.getElementById('a350-bottom-buttons');
        doc.querySelectorAll('.a350-tab').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
        if (checklist) checklist.style.display = tab === 'before' ? 'block' : 'none';
        if (ground) ground.style.display = tab === 'ground' ? 'block' : 'none';
        if (settings) settings.style.display = tab === 'settings' ? 'block' : 'none';
        if (engArea) engArea.style.display = tab === 'before' ? 'block' : 'none';
        if (bottomButtons) bottomButtons.style.display = tab === 'before' ? 'flex' : 'none';
    }

    function showTab(tab) {
        if ((state.engineStartPanelActive || state.postFlightShutdownActive) && tab !== 'before') {
            showWarning('The ENG panel sequence is locked. The CHECKLIST tab must remain open.');
            tab = 'before';
        }
        state.currentTab = tab;
        getDocuments().forEach(doc => applyTabToDocument(doc, tab));
    }

    // ============================================================
    // ENG START PANEL
    // ============================================================

    function toggleEngPanel() {
        if (state.engineStartPanelActive) {
            showWarning('The ENG panel stays open and locked until both engines reach NORM.');
            return;
        }
        if (state.postFlightShutdownActive) {
            showWarning('The ENG panel stays open until both engines have been shut down.');
            return;
        }
        if (state.postFlightShutdownComplete || state.engineStartPanelComplete) {
            showWarning('The ENG panel is locked until the next Cold & Dark reset or post-flight sequence.');
            return;
        }
        // During normal startup, reaching image 28 opens the panel automatically.
        if (!state.engPanelOpen && state.image !== 28) {
            showWarning('The ENG START panel unlocks at overhead image 28 and automatically during post-flight shutdown at image 40.');
            return;
        }

        state.engPanelOpen = !state.engPanelOpen;
        setEngPanelVisibility(state.engPanelOpen);
        if (state.engPanelOpen) loadEngImage(state.engImage);
    }

    // ============================================================
    // POPUP WINDOW
    // ============================================================

    function addPopupModalClones(popup) {
        const doc = popup.document;
        ['a350-startup-modal', 'a350-turnaround-modal'].forEach(id => {
            const source = document.getElementById(id);
            if (!source) return;
            const clone = source.cloneNode(true);
            clone.style.display = source.style.display || 'none';
            doc.body.appendChild(clone);
        });

        const startupConfirm = doc.getElementById('a350-start-confirm');
        if (startupConfirm) startupConfirm.addEventListener('click', event => {
            event.preventDefault();
            const popupSelect = doc.getElementById('a350-start-choice');
            const mainSelect = document.getElementById('a350-start-choice');
            if (popupSelect && mainSelect) mainSelect.value = popupSelect.value;
            const mainConfirm = document.getElementById('a350-start-confirm');
            if (mainConfirm) mainConfirm.click();
        });

        const shortButton = doc.getElementById('a350-short-turnaround');
        if (shortButton) shortButton.addEventListener('click', event => {
            event.preventDefault();
            const mainButton = document.getElementById('a350-short-turnaround');
            if (mainButton) mainButton.click();
        });

        const fullButton = doc.getElementById('a350-full-shutdown');
        if (fullButton) fullButton.addEventListener('click', event => {
            event.preventDefault();
            const mainButton = document.getElementById('a350-full-shutdown');
            if (mainButton) mainButton.click();
        });
    }

    function openOverheadWindow() {
        playClick();

        if (overheadWindow && !overheadWindow.closed) {
            const existingPopup = overheadWindow;
            existingPopup.focus();
            // Allow the popup layout to settle before recalculating the cropped image.
            existingPopup.setTimeout(() => {
                if (overheadWindow !== existingPopup || existingPopup.closed) return;
                loadImage(state.image);
                if (state.engPanelOpen) loadEngImage(state.engImage);
                updateEXTUI();
                updateSoundUI();
                syncModalDisplays();
            }, 50);
            return;
        }

        let popup;
        try {
            popup = window.open('', 'A350_OVERHEAD', 'popup=yes,width=1400,height=900,resizable=yes,scrollbars=no');
        } catch (error) {
            console.error('[A350 v3.14.0] Could not open overhead window:', error);
            showWarning('Could not open the overhead window.');
            return;
        }

        if (!popup) {
            showWarning('Popup blocked. Allow popups for GeoFS.');
            return;
        }

        overheadWindow = popup;

        try {
            popup.document.open();
            popup.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>A350 OVERHEAD</title></head><body></body></html>');
            popup.document.close();
            popup.document.documentElement.classList.add('a350-popup-html');
            popup.document.body.classList.add('a350-popup-body');

            const popupStyle = popup.document.createElement('style');
            popupStyle.textContent = style.textContent;
            popup.document.head.appendChild(popupStyle);

            const original = document.getElementById('a350-startup-window');
            if (!original) {
                popup.close();
                overheadWindow = null;
                showWarning('A350 panel could not be copied.');
                return;
            }

            const clone = original.cloneNode(true);
            clone.id = 'a350-overhead-window';
            // A cloned image can inherit a fully-loaded src but not a useful onload
            // sizing callback in the popup. Clear both src attributes before first load.
            const clonedPanelImage = clone.querySelector('#a350-panel-image');
            const clonedEngImage = clone.querySelector('#a350-eng-image');
            if (clonedPanelImage) clonedPanelImage.removeAttribute('src');
            if (clonedEngImage) clonedEngImage.removeAttribute('src');
            popup.document.body.appendChild(clone);
            addPopupModalClones(popup);

            bindPanelEvents(popup.document, popup);
            renderChecklist(popup.document);
            applyTabToDocument(popup.document, state.currentTab);
            updateEXTUI();
            updateSoundUI();
            syncSidebarUI();
            syncModalDisplays();
            setEngPanelVisibility(state.engPanelOpen,
                state.engineStartPanelActive || state.postFlightShutdownActive ? 'LOCKED OPEN' :
                (state.engineStartPanelComplete || state.postFlightShutdownComplete ? 'LOCKED' : null),
                state.engineStartPanelActive || state.engineStartPanelComplete || state.postFlightShutdownActive || state.postFlightShutdownComplete);

            popup.addEventListener('resize', () => {
                popup.setTimeout(() => {
                    if (overheadWindow !== popup || popup.closed) return;
                    loadImage(state.image);
                    if (state.engPanelOpen) loadEngImage(state.engImage);
                }, 50);
            });

            popup.addEventListener('beforeunload', () => {
                if (overheadWindow === popup) overheadWindow = null;
            });

            popup.focus();
            syncSidebarUI();
            popup.setTimeout(() => {
                if (overheadWindow !== popup || popup.closed) return;
                loadImage(state.image);
                if (state.engPanelOpen) loadEngImage(state.engImage);
                syncImageNumber();
                updateEXTUI();
                updateSoundUI();
                syncModalDisplays();
                schedulePanelLayoutRefresh();
            }, 50);
        } catch (error) {
            console.error('[A350 v3.14.0] Failed to create overhead window:', error);
            try { popup.close(); } catch (_) {}
            overheadWindow = null;
            showWarning('Failed to create the overhead window.');
        }
    }

    // ============================================================
    // EVENT BINDING
    // ============================================================

    function bindPanelEvents(doc, popup = null) {
        const sidebarToggle = doc.getElementById('a350-sidebar-toggle');
        if (sidebarToggle) sidebarToggle.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handleSidebarToggle();
        });

        const back = doc.getElementById('a350-back');
        if (back) back.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handlePreviousImage();
        });

        const close = doc.getElementById('a350-close');
        if (close) close.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation(); playClick();
            if (popup) { popup.close(); if (overheadWindow === popup) overheadWindow = null; }
            else closePanel();
        });

        doc.querySelectorAll('.a350-tab').forEach(button => button.addEventListener('click', event => {
            event.preventDefault(); playClick(); showTab(button.dataset.tab);
        }));

        const connect = doc.getElementById('a350-ext-connect');
        if (connect) connect.addEventListener('click', () => { playClick(); connectEXT(); });
        const disconnect = doc.getElementById('a350-ext-disconnect');
        if (disconnect) disconnect.addEventListener('click', () => { playClick(); disconnectEXT(); });

        const soundToggle = doc.getElementById('a350-sound-toggle');
        if (soundToggle) soundToggle.addEventListener('change', () => {
            state.soundEnabled = soundToggle.checked;
            if (!state.soundEnabled) stopAllAudio();
            else audio.fanRunning.volume = FAN_NORMAL_VOLUME;
            updateSoundUI();
        });

        const coldDark = doc.getElementById('a350-cold-dark-reset');
        if (coldDark) coldDark.addEventListener('click', () => { playClick(); applyColdAndDark(); });
        const engToggle = doc.getElementById('a350-eng-toggle');
        if (engToggle) engToggle.addEventListener('click', () => { playClick(); toggleEngPanel(); });
        const engReset = doc.getElementById('a350-eng-reset');
        if (engReset) engReset.addEventListener('click', () => { playClick(); resetChecklist(); });
        const engFrame = doc.getElementById('a350-eng-image-frame');
        if (engFrame) engFrame.addEventListener('click', handleEngPanelClick);

        const panel = doc.getElementById('a350-panel-area');
        if (panel) panel.addEventListener('click', event => {
            if (event.target.closest('#a350-panel-topbar')) return;
            handlePanelClick();
        });

        doc.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (popup) { popup.close(); if (overheadWindow === popup) overheadWindow = null; }
            else if (state.open) closePanel();
        });
    }

    // ============================================================
    // PANEL CREATION
    // ============================================================

    function createPanel() {
        if (document.getElementById('a350-startup-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'a350-startup-overlay';
        const windowElement = document.createElement('div');
        windowElement.id = 'a350-startup-window';
        const left = document.createElement('div');
        left.id = 'a350-left';
        left.innerHTML = `
            <div id="a350-left-header">
                <div id="a350-title">A350 STARTUP</div>
                <div id="a350-version">v3.14.0 Official</div>
                <button id="a350-overhead-button" type="button">OPEN A350 OVERHEAD</button>
            </div>
            <div id="a350-tabs">
                <button class="a350-tab active" data-tab="before">CHECKLIST</button>
                <button class="a350-tab" data-tab="ground">GROUND</button>
                <button class="a350-tab" data-tab="settings">SETTINGS</button>
            </div>
            <div id="a350-checklist-content"></div>
            <div id="a350-eng-area"><div id="a350-eng-image-frame"><img id="a350-eng-image" draggable="false"></div></div>
            <div id="a350-bottom-buttons">
                <button class="a350-bottom-button" id="a350-eng-toggle">OPEN</button>
                <button class="a350-bottom-button" id="a350-eng-reset">RESET</button>
            </div>
            <div id="a350-ground-controls">
                <div class="a350-section-title">GROUND</div>
                <div id="a350-ext-status">EXT PWR — DISCONNECTED</div>
                <button id="a350-ext-connect" class="a350-ground-button">CONNECT EXT PWR</button>
                <button id="a350-ext-disconnect" class="a350-ground-button" disabled>DISCONNECT EXT PWR</button>
            </div>
            <div id="a350-settings">
                <div class="a350-section-title">SETTINGS</div>
                <div class="a350-setting"><label><input id="a350-sound-toggle" type="checkbox" checked> Sound effects</label></div>
                <div class="a350-setting"><button id="a350-cold-dark-reset" class="a350-ground-button">APPLY COLD & DARK</button></div>
            </div>`;

        const panelArea = document.createElement('div');
        panelArea.id = 'a350-panel-area';
        const wrapper = document.createElement('div');
        wrapper.id = 'a350-panel-image-wrapper';
        const image = document.createElement('img');
        image.id = 'a350-panel-image';
        image.draggable = false;
        wrapper.appendChild(image);
        panelArea.appendChild(wrapper);
        const topbar = document.createElement('div');
        topbar.id = 'a350-panel-topbar';
        const topbarLeft = document.createElement('div');
        topbarLeft.id = 'a350-panel-topbar-left';
        const back = document.createElement('button');
        back.id = 'a350-back';
        back.type = 'button';
        back.title = 'Previous image';
        back.setAttribute('aria-label', 'Previous image');
        back.textContent = '←';
        const number = document.createElement('div');
        number.id = 'a350-image-number';
        number.textContent = 'PANEL 1';
        topbarLeft.append(back, number);
        const close = document.createElement('button');
        close.id = 'a350-close';
        close.type = 'button';
        close.textContent = '×';
        topbar.append(topbarLeft, close);
        panelArea.appendChild(topbar);
        const warning = document.createElement('div');
        warning.id = 'a350-warning';
        panelArea.appendChild(warning);
        windowElement.append(left, panelArea);
        const sidebarToggle = document.createElement('button');
        sidebarToggle.id = 'a350-sidebar-toggle';
        sidebarToggle.type = 'button';
        sidebarToggle.textContent = state.sidebarCollapsed ? '>' : '<';
        sidebarToggle.title = state.sidebarCollapsed ? 'Show side panel' : 'Hide side panel';
        sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
        windowElement.appendChild(sidebarToggle);
        overlay.appendChild(windowElement);
        document.body.appendChild(overlay);

        const modal = document.createElement('div');
        modal.id = 'a350-startup-modal';
        modal.innerHTML = `
            <div id="a350-startup-modal-card">
                <h2>How do you want to start the aircraft?</h2>
                <label>Start method<select id="a350-start-choice"><option value="apu">With APU</option><option value="ext">With EXT</option></select></label>
                <p>Choose the aircraft startup method.</p>
                <button id="a350-start-confirm">CONTINUE</button>
            </div>`;
        overlay.appendChild(modal);

        const turnaroundModal = document.createElement('div');
        turnaroundModal.id = 'a350-turnaround-modal';
        turnaroundModal.innerHTML = `
            <div id="a350-turnaround-modal-card">
                <h2>Aircraft shutdown</h2>
                <p>Do you want to shut down the aircraft completely, or are you just doing a short turnaround?</p>
                <div id="a350-turnaround-actions">
                    <button id="a350-short-turnaround" type="button">SHORT TURNAROUND</button>
                    <button id="a350-full-shutdown" type="button">FULL SHUTDOWN</button>
                </div>
            </div>`;
        overlay.appendChild(turnaroundModal);

        const notificationModal = document.createElement('div');
        notificationModal.id = 'a350-notification-modal';
        notificationModal.innerHTML = '<div id="a350-notification-card"></div>';
        overlay.appendChild(notificationModal);

        turnaroundModal.querySelector('#a350-short-turnaround').addEventListener('click', () => {
            playClick();
            chooseShortTurnaround();
        });
        turnaroundModal.querySelector('#a350-full-shutdown').addEventListener('click', () => {
            playClick();
            chooseFullShutdown();
        });

        left.querySelector('#a350-overhead-button').addEventListener('click', openOverheadWindow);
        bindPanelEvents(document);
        renderChecklist(document);
        updateEXTUI();
        syncSidebarUI();
        loadImage(1);
        loadEngImage(89);

        modal.querySelector('#a350-start-confirm').addEventListener('click', () => {
            playClick();
            if (!state.startupModalReady) {
                showWarning('Wait until EXT has been reset and the startup selection is available.');
                return;
            }
            clearAPUTimer();
            clearEXTAPUStartTimer();
            clearPostFlightAPUTimer();
            clearPostFlightShutdownMonitor();
            clearEngineTimers();
            state.postFlightShutdownReleaseScheduled = false;
            state.landingChoicePending = false;
            clearLandingChoiceTimer();
            hideTurnaroundChoice();
            state.checklistMode = 'startup';
            state.shortTurnaroundActive = false;
            state.fullShutdownActive = false;
            state.startChoice = modal.querySelector('#a350-start-choice').value;
            state.panelPosition = 'center';
            state.firstOpen = false;
            state.checklistLocked = false;
            state.lockedChecklistKey = null;
            state.extInitiallyConnected = state.startChoice === 'ext' && state.extConnected;
            state.extConnectedDuringSequence = false;
            state.extSoundsStarted = false;
            state.fanSequenceRequested = false;
            state.postFlightShutdownActive = false;
            state.postFlightShutdownComplete = false;
            state.postFlightShutdownReleaseScheduled = false;
            state.apuStarted = false;
            state.apuAvailable = false;
            state.apuGenSoundsPlayed = false;
            state.eng1Started = false;
            state.eng2Started = false;
            state.eng1Starting = false;
            state.eng2Starting = false;
            state.eng1Stopping = false;
            state.eng2Stopping = false;
            state.eng1ShutdownCommandSent = false;
            state.eng2ShutdownCommandSent = false;
            state.engMode = 'NORM';
            state.engNormReached = false;
            state.engineStartPanelActive = false;
            state.engineStartPanelComplete = false;
            state.engImage = 89;
            state.engPanelOpen = false;
            state.sequenceIndex = 0;
            resetENGCycleForNextFlight();
            getDocuments().forEach(doc => {
                const frame = doc.getElementById('a350-eng-image-frame');
                const button = doc.getElementById('a350-eng-toggle');
                if (frame) frame.style.display = 'none';
                if (button) { button.textContent = 'OPEN'; button.disabled = false; }
            });
            loadEngImage(89);
            positionPanel();
            setModalDisplay('a350-startup-modal', 'none');
            resetChecklist();
            refreshChecklist();
            loadImage(1);
            resetSequenceCursor();
        });
    }

    // ============================================================
    // PANEL POSITION AND OPEN/CLOSE
    // ============================================================

    function positionPanel() {
        const panel = document.getElementById('a350-startup-window');
        if (!panel) return;
        state.panelPosition = 'center';
        panel.style.left = '50%';
        panel.style.right = 'auto';
        panel.style.transform = 'translate(-50%, -50%)';
    }

    function openPanel() {
        createPanel();
        const overlay = document.getElementById('a350-startup-overlay');
        if (!overlay) return;
        overlay.style.display = 'block';
        state.open = true;
        if (state.landingChoicePending) {
            if (state.landingChoiceTimer === null) setModalDisplay('a350-turnaround-modal', 'flex');
        } else if (state.startupModalReady && (state.firstOpen || !state.startChoice)) {
            showStartupChoiceModal();
        } else positionPanel();
        syncSidebarUI();
        loadImage(state.image);
        schedulePanelLayoutRefresh();
        if (state.engPanelOpen) loadEngImage(state.engImage);
        updateEXTUI();
        updateSoundUI();
        console.log('[A350 v3.14.0] Panel opened.');
    }

    function closePanel() {
        const overlay = document.getElementById('a350-startup-overlay');
        if (overlay) overlay.style.display = 'none';
        state.open = false;
        console.log('[A350 v3.14.0] Panel closed.');
    }

    function togglePanel() { if (state.open) closePanel(); else openPanel(); }

    // ============================================================
    // GEOFS MENU BUTTON
    // ============================================================

    function isElementVisible(element) {
        if (!element) return false;
        return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
    }

    function isGeoFSReplayActive() {
        const replayButtons = Array.from(document.querySelectorAll('.geofs-f-recordPlayer button'));
        return replayButtons.some(button => {
            if (!isElementVisible(button)) return false;
            const icon = button.querySelector('i');
            const iconText = icon ? icon.textContent.trim() : '';
            return iconText === 'pause' || iconText === 'play_arrow';
        });
    }

    function updateMenuButtonVisibility() {
        const button = document.getElementById('a350-startup-menu-button');
        if (button) button.classList.toggle('a350-hidden-in-replay', isGeoFSReplayActive());
    }

    function createMenuButton() {
        const existing = document.getElementById('a350-startup-menu-button');
        if (existing) { updateMenuButtonVisibility(); return true; }
        const buttons = Array.from(document.querySelectorAll('button'));
        const findButton = text => buttons.find(button => (button.textContent || '').trim().toLowerCase() === text);
        const aircraftButton = findButton('aircraft');
        const locationButton = findButton('location');
        const cameraButton = findButton('camera');
        const reference = cameraButton || locationButton || aircraftButton;
        if (!reference) return false;
        const button = document.createElement('button');
        button.id = 'a350-startup-menu-button';
        button.type = 'button';
        button.className = 'mdl-button mdl-js-button';
        button.textContent = 'STARTUP';
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            playClick();
            if (hasPendingNotifications()) {
                if (!state.open) openPanel();
                showNotificationModal();
            } else {
                togglePanel();
            }
        });
        reference.insertAdjacentElement('afterend', button);
        if (window.componentHandler && window.componentHandler.upgradeElement) {
            try { window.componentHandler.upgradeElement(button); } catch (_) {}
        }
        updateMenuButtonVisibility();
        return true;
    }

    // ============================================================
    // INITIALIZATION / PUBLIC API
    // ============================================================

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state.open) closePanel();
    });

    window.addEventListener('resize', () => {
        if (state.open) loadImage(state.image);
        if (state.engPanelOpen) loadEngImage(state.engImage);
    });

    window.a350 = {
        state,
        open: openPanel,
        close: closePanel,
        toggle: togglePanel,
        image: loadImage,
        previous: handlePreviousImage,
        next: () => {
            const automaticLock = getAutomaticStepLockMessage();
            if (automaticLock) { showWarning(automaticLock); return; }
            if (state.landingChoicePending) { showWarning('Choose FULL SHUTDOWN or SHORT TURNAROUND first.'); return; }
            if (state.engineStartPanelActive && state.image === 28) {
                showWarning('Overhead navigation is locked until the ENG start panel finishes.');
                return;
            }
            if (state.engTransitionPending) {
                showWarning('Wait for the ENG panel sequence to finish.');
                return;
            }
            if (state.image === 28 && !state.engNormReached) {
                showWarning('Complete the ENG start sequence and reach image 93 (NORM) first.');
                return;
            }
            if (state.image === 38 && state.postFlightAPUTimer !== null) return;
            if (state.postFlightShutdownActive && state.image === 42 && !state.engPanelOpen) {
                if (!isEngineStoppedForShutdown(2) && !stopEngine(2)) return;
                finishPostFlightShutdown();
                loadImage(43);
                return;
            }
            if (state.postFlightShutdownActive && [40, 41, 42].includes(state.image)) {
                showWarning('Overhead navigation is locked until the ENG panel has completed image 95 and closed.');
                return;
            }
            if (state.fullShutdownActive && state.image === 25 && !state.extConnected) {
                showWarning('Connect EXT PWR in the GROUND tab before continuing.');
                return;
            }
            if (state.fullShutdownActive && state.image === 64) {
                showWarning('Disconnect EXT PWR in the GROUND tab to complete full shutdown.');
                return;
            }
            const next = getNextImage();
            if (next !== null) loadImage(next);
        },
        connectEXT,
        disconnectEXT,
        coldDark: applyColdAndDark,
        resetChecklist,
        startEngine1,
        startEngine2
    };

    createPanel();
    let menuAttempts = 0;
    const menuTimer = setInterval(() => {
        menuAttempts++;
        if (createMenuButton() || menuAttempts >= 120) clearInterval(menuTimer);
    }, 500);
    setInterval(updateMenuButtonVisibility, 400);
    checkForUpdates();
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
    console.log('[A350 v3.14.0] GeoFS A350 Startup v3.14.0 Official ready.');
})();
