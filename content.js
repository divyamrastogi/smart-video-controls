/**
 * Smart Video Controls - Content Script
 * Runs in ALL frames (parent pages and cross-origin iframes).
 *
 * Architecture:
 *  - Keyboard shortcuts are handled directly in whichever frame has focus.
 *  - When the parent page has keyboard focus, commands are forwarded to iframes
 *    via postMessage (works across cross-origin boundaries).
 *  - Videos are detected via MutationObserver so dynamically added videos
 *    (e.g. after clicking "play" on animepahe) are tracked automatically.
 *  - Playback position is saved to chrome.storage.local and restored on return.
 */
(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  const IS_IFRAME = window !== window.top;
  const SVC_COMMAND_MSG = 'svc-command';
  const SHORTCUTS_KEY = 'svc_shortcuts';
  const LOGGER_KEY = 'svc_logger_visible';
  const SKIP_SEC = 10;
  const VOL_STEP = 0.1;
  const SPEED_STEP = 0.25;

  const DEFAULT_SHORTCUTS = {
    playPause:   { key: ' ',          label: 'Space', modifiers: {} },
    skipForward: { key: 'ArrowRight', label: '→',     modifiers: {} },
    skipBack:    { key: 'ArrowLeft',  label: '←',     modifiers: {} },
    volumeUp:    { key: 'ArrowUp',    label: '↑',     modifiers: {} },
    volumeDown:  { key: 'ArrowDown',  label: '↓',     modifiers: {} },
    speedUp:     { key: '>',          label: '>',     modifiers: {} },
    speedDown:   { key: '<',          label: '<',     modifiers: {} },
  };

  // ── State ────────────────────────────────────────────────────────────────────

  let shortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
  let trackedVideo = null;
  let saveTimer = null;

  // ── Position storage ─────────────────────────────────────────────────────────

  function getPositionKey() {
    const url = location.href.replace(/#.*$/, '');
    if (IS_IFRAME) {
      const parent = (document.referrer || 'unknown').replace(/#.*$/, '');
      return 'svc_pos::' + parent + '::' + url;
    }
    return 'svc_pos::' + url;
  }

  function savePosition(video) {
    if (!video || !video.isConnected || video.currentTime < 2) return;
    const key = getPositionKey();
    chrome.storage.local.set({
      [key]: {
        currentTime: video.currentTime,
        duration: video.duration || 0,
        savedAt: Date.now(),
      },
    });
    svcLog('Saved ' + video.currentTime.toFixed(1) + 's');
  }

  function restorePosition(video) {
    const key = getPositionKey();
    chrome.storage.local.get(key, (result) => {
      const saved = result[key];
      if (!saved || saved.currentTime < 2) return;
      // Don't restore near the end
      if (saved.duration > 0 && saved.currentTime > saved.duration - 15) return;
      // Don't restore saves older than 30 days
      if (Date.now() - saved.savedAt > 30 * 24 * 60 * 60 * 1000) return;

      svcLog('Restoring to ' + saved.currentTime.toFixed(1) + 's');
      const seek = () => { video.currentTime = saved.currentTime; };
      if (video.readyState >= 1) {
        seek();
      } else {
        video.addEventListener('loadedmetadata', seek, { once: true });
      }
    });
  }

  // ── Video tracking ───────────────────────────────────────────────────────────

  function trackVideo(video) {
    if (video._svcTracked) return;
    video._svcTracked = true;
    video.dataset.svcTracked = '1'; // visible from main world (dataset is shared between worlds)
    trackedVideo = video;
    svcLog('Tracking video');

    restorePosition(video);

    video.addEventListener('ended', () => savePosition(video));

    // Save on pause
    video.addEventListener('pause', () => {
      savePosition(video);
      clearInterval(saveTimer);
      saveTimer = null;
    });

    // Save every 10s while playing
    video.addEventListener('play', () => {
      if (saveTimer) return;
      saveTimer = setInterval(() => {
        if (trackedVideo && !trackedVideo.paused) savePosition(trackedVideo);
      }, 10000);
    });
  }

  function getActiveVideo() {
    if (trackedVideo && trackedVideo.isConnected) return trackedVideo;
    const all = document.querySelectorAll('video');
    for (const v of all) {
      if (!v.paused || v.readyState > 0) return v;
    }
    return all[0] || null;
  }

  // ── Commands ─────────────────────────────────────────────────────────────────

  function applyCommand(action) {
    const video = getActiveVideo();
    if (!video) return false;

    switch (action) {
      case 'playPause':
        video.paused ? video.play().catch(() => {}) : video.pause();
        break;
      case 'skipForward':
        video.currentTime = Math.min(video.currentTime + SKIP_SEC, video.duration || 1e9);
        break;
      case 'skipBack':
        video.currentTime = Math.max(video.currentTime - SKIP_SEC, 0);
        break;
      case 'volumeUp':
        if (video.muted) {
          video.muted = false;
          video.volume = Math.max(video.volume, 0.1);
        } else {
          video.volume = Math.min(1, video.volume + VOL_STEP);
        }
        break;
      case 'volumeDown':
        video.volume = Math.max(0, video.volume - VOL_STEP);
        if (video.volume < 0.01) video.muted = true;
        break;
      case 'speedUp':
        video.playbackRate = Math.min(4, +(video.playbackRate + SPEED_STEP).toFixed(2));
        break;
      case 'speedDown':
        video.playbackRate = Math.max(0.25, +(video.playbackRate - SPEED_STEP).toFixed(2));
        break;
      default:
        return false;
    }

    svcLog(action + ' → t=' + (video.currentTime || 0).toFixed(1) + 's');
    return true;
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  function findAction(event) {
    for (const [action, def] of Object.entries(shortcuts)) {
      if (event.key !== def.key) continue;
      const m = def.modifiers || {};
      if (!!event.ctrlKey  !== !!m.ctrl)  continue;
      if (!!event.altKey   !== !!m.alt)   continue;
      if (!!event.shiftKey !== !!m.shift) continue;
      if (!!event.metaKey  !== !!m.meta)  continue;
      return action;
    }
    return null;
  }

  function forwardToIframes(action) {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe) => {
      try {
        // postMessage works even for cross-origin iframes
        iframe.contentWindow.postMessage({ type: SVC_COMMAND_MSG, action }, '*');
      } catch (_) {}
    });
    return iframes.length > 0;
  }

  // Listen on `window` in capture phase so we run before document-level listeners
  // (including the video player's own keyboard shortcuts). stopImmediatePropagation
  // prevents all subsequent handlers — including the player's — from seeing the event.
  window.addEventListener('keydown', (event) => {
    // Never capture keys typed into inputs
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;

    const action = findAction(event);
    if (!action) return;

    const video = getActiveVideo();
    if (video) {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyCommand(action);
    } else if (!IS_IFRAME) {
      // No video on this page — forward shortcut to iframes
      const hadIframes = forwardToIframes(action);
      if (hadIframes) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  }, /* capture */ true);

  // ── postMessage: receive commands from parent ────────────────────────────────

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== SVC_COMMAND_MSG) return;
    applyCommand(event.data.action);
  });

  // ── MutationObserver: detect dynamically added videos ────────────────────────

  function scanForVideos() {
    document.querySelectorAll('video').forEach(trackVideo);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.tagName === 'VIDEO') { trackVideo(node); continue; }
        node.querySelectorAll('video').forEach(trackVideo);
      }
    }
  });

  // ── Visual logger (parent frame only) ────────────────────────────────────────

  let logEl = null;
  let logEntriesEl = null;
  let logVisible = false;

  function createLogger() {
    if (IS_IFRAME || logEl) return;

    logEl = document.createElement('div');
    logEl.id = 'svc-logger';
    logEl.style.cssText = [
      'position:fixed', 'bottom:10px', 'right:10px', 'width:380px',
      'max-height:260px', 'background:rgba(0,0,0,0.88)', 'color:#00e676',
      'font:11px/1.4 monospace', 'padding:8px 10px', 'border-radius:6px',
      'border:1px solid #00e676', 'z-index:2147483647', 'display:none',
      'box-shadow:0 4px 16px rgba(0,0,0,0.6)',
    ].join(';');

    logEl.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<strong style="color:#fff">SVC Debug</strong>' +
        '<button id="svc-log-close" style="background:none;border:none;color:#00e676;cursor:pointer;font-size:18px;line-height:1">×</button>' +
      '</div>' +
      '<div id="svc-log-entries" style="overflow-y:auto;max-height:200px"></div>';

    document.documentElement.appendChild(logEl);
    logEntriesEl = logEl.querySelector('#svc-log-entries');

    logEl.querySelector('#svc-log-close').addEventListener('click', () => setLoggerVisible(false));

    // Restore last visibility preference
    chrome.storage.local.get(LOGGER_KEY, (r) => {
      if (r[LOGGER_KEY]) setLoggerVisible(true);
    });
  }

  function setLoggerVisible(visible) {
    logVisible = visible;
    if (logEl) logEl.style.display = visible ? 'block' : 'none';
    chrome.storage.local.set({ [LOGGER_KEY]: visible });
  }

  function svcLog(msg) {
    const ts = new Date().toISOString().substring(11, 23);
    const ctx = IS_IFRAME ? '[iframe]' : '[top]';
    const line = '[' + ts + '] ' + ctx + ' ' + msg;
    console.log('[SVC]', line);
    if (logEntriesEl && logVisible) {
      const d = document.createElement('div');
      d.textContent = line;
      logEntriesEl.appendChild(d);
      while (logEntriesEl.children.length > 100) logEntriesEl.firstChild.remove();
      logEntriesEl.scrollTop = logEntriesEl.scrollHeight;
    }
  }

  // ── Extension message handler (from popup) ────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;

    switch (msg.type) {
      case 'svc-command': {
        const ok = applyCommand(msg.action);
        if (!ok && !IS_IFRAME) forwardToIframes(msg.action);
        sendResponse({ success: true });
        return false;
      }

      case 'svc-status': {
        const video = getActiveVideo();
        sendResponse({
          hasVideo: !!video,
          paused: video ? video.paused : null,
          currentTime: video ? video.currentTime : null,
          duration: video ? video.duration : null,
          volume: video ? video.volume : null,
          playbackRate: video ? video.playbackRate : null,
          isIframe: IS_IFRAME,
          url: location.href,
        });
        return false;
      }

      case 'svc-get-shortcuts': {
        sendResponse({ shortcuts });
        return false;
      }

      case 'svc-set-shortcuts': {
        shortcuts = Object.assign({}, DEFAULT_SHORTCUTS, msg.shortcuts);
        chrome.storage.local.set({ [SHORTCUTS_KEY]: shortcuts });
        sendResponse({ success: true });
        return false;
      }

      case 'svc-toggle-logger': {
        if (!IS_IFRAME) {
          const next = msg.visible !== undefined ? msg.visible : !logVisible;
          setLoggerVisible(next);
          sendResponse({ success: true, visible: next });
        } else {
          sendResponse({ success: false });
        }
        return false;
      }

      case 'svc-clear-logs': {
        if (logEntriesEl) logEntriesEl.innerHTML = '';
        sendResponse({ success: true });
        return false;
      }
    }

    return false;
  });

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    // Load saved shortcuts
    chrome.storage.local.get(SHORTCUTS_KEY, (result) => {
      if (result[SHORTCUTS_KEY]) {
        shortcuts = Object.assign({}, DEFAULT_SHORTCUTS, result[SHORTCUTS_KEY]);
      }
    });

    // Create debug logger only in the top frame
    if (!IS_IFRAME) {
      if (document.body) {
        createLogger();
      } else {
        document.addEventListener('DOMContentLoaded', createLogger, { once: true });
      }
    }

    // Find any videos already on the page
    scanForVideos();

    // Watch for videos added dynamically (e.g. after clicking play)
    observer.observe(document.documentElement, { childList: true, subtree: true });

    svcLog('Init (' + (IS_IFRAME ? 'iframe' : 'top') + ') ' + location.href.substring(0, 70));
  }

  window.addEventListener('beforeunload', () => {
    if (trackedVideo) savePosition(trackedVideo);
    clearInterval(saveTimer);
  });

  init();
})();
