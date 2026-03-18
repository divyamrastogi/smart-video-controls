/**
 * Smart Video Controls - Popup
 *
 * Uses chrome.scripting.executeScript (allFrames:true) to query/control video
 * in all frames including cross-origin iframes. Shortcut config is read/written
 * directly to chrome.storage.local and broadcast to content scripts.
 */

const DEFAULT_SHORTCUTS = {
  playPause:   { key: ' ',          label: 'Space' },
  skipForward: { key: 'ArrowRight', label: '→'     },
  skipBack:    { key: 'ArrowLeft',  label: '←'     },
  volumeUp:    { key: 'ArrowUp',    label: '↑'     },
  volumeDown:  { key: 'ArrowDown',  label: '↓'     },
  speedUp:     { key: '>',          label: '>'     },
  speedDown:   { key: '<',          label: '<'     },
};

const ACTION_LABELS = {
  playPause:   'Play / Pause',
  skipForward: 'Skip Forward 10s',
  skipBack:    'Skip Back 10s',
  volumeUp:    'Volume Up',
  volumeDown:  'Volume Down',
  speedUp:     'Speed Up',
  speedDown:   'Speed Down',
};

let currentShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
let editingAction = null;
let editingKeyHandler = null;
let activeTabId = null;
let loggerVisible = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Execute a function in all frames of the active tab.
 * Returns a flat array of results (one per frame that has a video).
 */
async function execInAllFrames(fn, args = []) {
  try {
    const tab = await getTab();
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: fn,
      args,
    });
    return results.map((r) => r.result).filter(Boolean);
  } catch (e) {
    console.warn('[SVC popup] execInAllFrames failed:', e.message);
    return [];
  }
}

/**
 * Send a message to the top-level content script.
 * (Content script then forwards commands to iframes via postMessage.)
 */
async function sendToTab(message) {
  try {
    const tab = await getTab();
    activeTabId = tab.id;
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (e) {
    console.warn('[SVC popup] sendToTab failed:', e.message);
    return null;
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

async function refreshStatus() {
  const statusEl = document.getElementById('status');
  const playBtn = document.getElementById('playPauseBtn');

  // Query all frames directly — works even for cross-origin iframes
  const frameResults = await execInAllFrames(() => {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;
    const v = videos.find((x) => !x.paused) || videos[0];
    return {
      paused: v.paused,
      currentTime: v.currentTime,
      duration: v.duration,
      volume: v.volume,
      playbackRate: v.playbackRate,
      isIframe: window !== window.top,
    };
  });

  const found = frameResults.find(Boolean);

  if (found) {
    const mins = Math.floor(found.currentTime / 60);
    const secs = Math.floor(found.currentTime % 60).toString().padStart(2, '0');
    const totalMins = found.duration ? Math.floor(found.duration / 60) : 0;
    const totalSecs = found.duration
      ? Math.floor(found.duration % 60).toString().padStart(2, '0')
      : '--';

    const location = found.isIframe ? ' (in iframe)' : '';
    const state = found.paused ? '⏸ Paused' : '▶ Playing';
    statusEl.textContent =
      state + location + '  ' + mins + ':' + secs + ' / ' + totalMins + ':' + totalSecs +
      '  ×' + (found.playbackRate || 1).toFixed(2) +
      '  🔊' + Math.round((found.volume || 1) * 100) + '%';
    statusEl.className = 'has-video';

    // Update play/pause button icon — use child elements to avoid destroying .label span
    if (playBtn) {
      const iconEl  = playBtn.querySelector('.icon');
      const labelEl = playBtn.querySelector('.label');
      if (iconEl)  iconEl.textContent  = found.paused ? '▶' : '⏸';
      if (labelEl) labelEl.textContent = found.paused ? 'Play' : 'Pause';
    }
  } else {
    statusEl.textContent = 'No video detected on this page';
    statusEl.className = 'no-video';
    if (playBtn) {
      const iconEl  = playBtn.querySelector('.icon');
      const labelEl = playBtn.querySelector('.label');
      if (iconEl)  iconEl.textContent  = '▶';
      if (labelEl) labelEl.textContent = 'Play';
    }
  }
}

// ── Controls ──────────────────────────────────────────────────────────────────

async function sendCommand(action) {
  // Use scripting.executeScript so it reaches all frames directly
  await execInAllFrames((action, skipSec, volStep, speedStep) => {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return;
    const v = videos.find((x) => !x.paused) || videos[0];

    switch (action) {
      case 'playPause':
        v.paused ? v.play().catch(() => {}) : v.pause();
        break;
      case 'skipForward':
        v.currentTime = Math.min(v.currentTime + skipSec, v.duration || 1e9);
        break;
      case 'skipBack':
        v.currentTime = Math.max(v.currentTime - skipSec, 0);
        break;
      case 'volumeUp':
        if (v.muted) { v.muted = false; v.volume = Math.max(v.volume, 0.1); }
        else v.volume = Math.min(1, v.volume + volStep);
        break;
      case 'volumeDown':
        v.volume = Math.max(0, v.volume - volStep);
        if (v.volume < 0.01) v.muted = true;
        break;
      case 'speedUp':
        v.playbackRate = Math.min(4, +(v.playbackRate + speedStep).toFixed(2));
        break;
      case 'speedDown':
        v.playbackRate = Math.max(0.25, +(v.playbackRate - speedStep).toFixed(2));
        break;
    }
  }, [action, 10, 0.1, 0.25]);

  // Small delay then refresh status
  setTimeout(refreshStatus, 300);
}

// ── Shortcut config ───────────────────────────────────────────────────────────

async function loadShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.local.get('svc_shortcuts', (result) => {
      if (result.svc_shortcuts) {
        currentShortcuts = Object.assign({}, DEFAULT_SHORTCUTS, result.svc_shortcuts);
      }
      resolve(currentShortcuts);
    });
  });
}

async function saveShortcuts() {
  await chrome.storage.local.set({ svc_shortcuts: currentShortcuts });
  // Notify content script to reload shortcuts
  await sendToTab({ type: 'svc-set-shortcuts', shortcuts: currentShortcuts });
}

function renderShortcuts() {
  const table = document.getElementById('shortcuts-table');
  table.innerHTML = '';

  for (const [action, def] of Object.entries(currentShortcuts)) {
    const tr = document.createElement('tr');
    tr.dataset.action = action;

    const labelDisplay = def.label || (def.key === ' ' ? 'Space' : def.key);

    tr.innerHTML =
      '<td class="action-name">' + (ACTION_LABELS[action] || action) + '</td>' +
      '<td><span class="key-badge" data-badge="' + action + '">' + labelDisplay + '</span></td>' +
      '<td class="td-right"><button class="edit-btn" data-edit="' + action + '">Edit</button></td>';

    table.appendChild(tr);
  }

  // Attach edit listeners
  table.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditing(btn.dataset.edit));
  });
}

function startEditing(action) {
  if (editingAction) cancelEditing();

  editingAction = action;
  const badge = document.querySelector('[data-badge="' + action + '"]');
  if (badge) {
    badge.textContent = 'Press key…';
    badge.classList.add('recording');
  }

  editingKeyHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      cancelEditing();
      return;
    }

    const key = e.key;
    const label = key === ' ' ? 'Space' : key;
    currentShortcuts[action] = { key, label };

    saveShortcuts();
    cancelEditing();
    renderShortcuts();
  };

  document.addEventListener('keydown', editingKeyHandler, { capture: true, once: true });
}

function cancelEditing() {
  if (editingKeyHandler) {
    document.removeEventListener('keydown', editingKeyHandler, true);
    editingKeyHandler = null;
  }
  editingAction = null;
  renderShortcuts();
}

// ── Logger toggle ─────────────────────────────────────────────────────────────

async function syncLoggerButtonLabel() {
  const btn = document.getElementById('toggle-logger-btn');
  if (!btn) return;
  const data = await chrome.storage.local.get('svc_logger_visible');
  loggerVisible = !!data.svc_logger_visible;
  btn.textContent = loggerVisible ? 'Hide Logger' : 'Show Logger';
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadShortcuts();
  renderShortcuts();
  refreshStatus();
  syncLoggerButtonLabel();

  // Quick control buttons
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => sendCommand(btn.dataset.action));
  });

  // Reset shortcuts
  document.getElementById('reset-btn').addEventListener('click', async () => {
    currentShortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
    await saveShortcuts();
    renderShortcuts();
  });

  // Logger toggle
  document.getElementById('toggle-logger-btn').addEventListener('click', async () => {
    loggerVisible = !loggerVisible;
    await sendToTab({ type: 'svc-toggle-logger', visible: loggerVisible });
    await chrome.storage.local.set({ svc_logger_visible: loggerVisible });
    document.getElementById('toggle-logger-btn').textContent =
      loggerVisible ? 'Hide Logger' : 'Show Logger';
  });

  // Clear logs
  document.getElementById('clear-logs-btn').addEventListener('click', async () => {
    await sendToTab({ type: 'svc-clear-logs' });
  });
});
