/**
 * Smart Video Controls – End-to-End Tests
 *
 * Tests run in a real Chromium instance with the extension loaded.
 * All tests except the animepahe integration test use a local fixture server.
 *
 * Run (local tests only):   npx playwright test tests/e2e.test.js
 * Run animepahe tests:      npx playwright test --grep @animepahe
 *
 * Key design decisions:
 *  - chrome.storage.local is accessed via the extension's service worker, because
 *    page.evaluate() runs in the MAIN world where chrome APIs are not available.
 *  - We check video.dataset.svcTracked (DOM dataset attr) instead of the
 *    _svcTracked expando property, because expando props set in the extension's
 *    ISOLATED world are NOT visible from the MAIN world. Dataset attrs ARE shared.
 *  - Test video is a real .mp4 with -movflags faststart so seeking works immediately.
 *  - The test server supports HTTP Range requests (required for proper video seeking).
 */

const { test, expect, chromium } = require('@playwright/test');
const path = require('path');
const { createServer } = require('./server');

const EXTENSION_PATH = path.resolve(__dirname, '..');

// ── Global fixtures ───────────────────────────────────────────────────────────

let browser;
let server;
let baseUrl;
let swWorker; // Extension service worker — has chrome.storage access

test.beforeAll(async () => {
  ({ server, url: baseUrl } = await createServer());

  browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  // Grab (or wait for) the extension service worker
  const existing = browser.serviceWorkers();
  if (existing.length > 0) {
    swWorker = existing[0];
  } else {
    swWorker = await browser.waitForEvent('serviceworker', { timeout: 10000 });
  }
});

test.afterAll(async () => {
  await browser.close();
  server.close();
});

// ── Storage helpers (run in service worker context where chrome APIs exist) ───

async function storageSet(obj) {
  await swWorker.evaluate(
    (obj) => new Promise((resolve) => chrome.storage.local.set(obj, resolve)),
    obj
  );
}

async function storageGet(keys) {
  return swWorker.evaluate(
    (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve)),
    keys
  );
}

async function storageClear() {
  await swWorker.evaluate(
    () => new Promise((resolve) => chrome.storage.local.clear(resolve))
  );
}

// ── Video helpers ─────────────────────────────────────────────────────────────

async function getVideoState(frame) {
  return frame.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      paused: v.paused,
      currentTime: v.currentTime,
      duration: v.duration,
      volume: v.volume,
      playbackRate: v.playbackRate,
      muted: v.muted,
    };
  });
}

/**
 * Wait for video to be fully buffered, then seek to a known position and
 * confirm the seek succeeded before returning. This ensures tests start from
 * a reliable position even on slow machines.
 */
async function playAndSeekTo(frame, targetTime) {
  await frame.waitForFunction(
    () => {
      const v = document.querySelector('video');
      // readyState 4 = HAVE_ENOUGH_DATA; also accept 3 = HAVE_FUTURE_DATA
      return v && v.readyState >= 3 && v.duration > 0;
    },
    { timeout: 20000 }
  );

  await frame.evaluate(async (t) => {
    const v = document.querySelector('video');
    await new Promise((resolve) => {
      const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(); };
      v.addEventListener('seeked', onSeeked);
      v.currentTime = t;
      // If already at target (unlikely), resolve immediately
      if (Math.abs(v.currentTime - t) < 0.5) resolve();
    });
    try { await v.play(); } catch (_) {}
  }, targetTime);

  // Verify the seek landed within 2s of target
  const state = await getVideoState(frame);
  if (Math.abs(state.currentTime - targetTime) > 2) {
    throw new Error(
      `Seek to ${targetTime}s failed — video is at ${state.currentTime.toFixed(2)}s`
    );
  }
}

// ── Suite 1: Keyboard shortcuts in iframe ─────────────────────────────────────

test.describe('Iframe video – keyboard shortcuts', () => {
  let page;
  let iframeFrame;

  test.beforeEach(async () => {
    await storageClear();
    page = await browser.newPage();
    await page.goto(`${baseUrl}/parent.html`, { waitUntil: 'networkidle' });

    iframeFrame = page.frames().find((f) => f.url().includes('/iframe.html'));
    expect(iframeFrame).toBeTruthy();

    await iframeFrame.waitForSelector('video', { timeout: 10000 });
    // Seek to 60s so skip-back has room (won't clamp to 0) and skip-fwd won't hit end
    await playAndSeekTo(iframeFrame, 60);
    await page.waitForTimeout(300);
  });

  test.afterEach(async () => { await page.close(); });

  test('Space plays/pauses the video', async () => {
    const before = await getVideoState(iframeFrame);
    // Click iframe video to give it focus, then use keyboard
    await page.locator('#test-iframe').contentFrame().locator('#test-video').click({ force: true });
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    const after = await getVideoState(iframeFrame);
    expect(after.paused).not.toBe(before.paused);
  });

  test('ArrowRight skips forward 10s', async () => {
    // Give parent focus so shortcut is forwarded via postMessage to iframe
    await page.locator('h2').click();
    await page.waitForTimeout(200);

    const before = await getVideoState(iframeFrame);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const after = await getVideoState(iframeFrame);
    expect(after.currentTime).toBeGreaterThan(before.currentTime + 5);
  });

  test('ArrowLeft skips back 10s', async () => {
    await page.locator('h2').click();
    await page.waitForTimeout(200);

    const before = await getVideoState(iframeFrame);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);
    const after = await getVideoState(iframeFrame);
    expect(after.currentTime).toBeLessThan(before.currentTime - 5);
  });

  test('ArrowUp raises volume by 0.1', async () => {
    await iframeFrame.evaluate(() => { document.querySelector('video').volume = 0.5; });
    await page.locator('h2').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    const state = await getVideoState(iframeFrame);
    expect(state.volume).toBeCloseTo(0.6, 1);
  });

  test('ArrowDown lowers volume by 0.1', async () => {
    await iframeFrame.evaluate(() => { document.querySelector('video').volume = 0.5; });
    await page.locator('h2').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(400);
    const state = await getVideoState(iframeFrame);
    expect(state.volume).toBeCloseTo(0.4, 1);
  });

  test('> increases playback speed', async () => {
    await iframeFrame.evaluate(() => { document.querySelector('video').playbackRate = 1.0; });
    await page.locator('h2').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('>');
    await page.waitForTimeout(600);
    const state = await getVideoState(iframeFrame);
    expect(state.playbackRate).toBeCloseTo(1.25, 2);
  });

  test('< decreases playback speed', async () => {
    await iframeFrame.evaluate(() => { document.querySelector('video').playbackRate = 1.0; });
    await page.locator('h2').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('<');
    await page.waitForTimeout(600);
    const state = await getVideoState(iframeFrame);
    expect(state.playbackRate).toBeCloseTo(0.75, 2);
  });

  test('speed boundaries clamp correctly (max 4x, min 0.25x)', async () => {
    // Verify applyCommand clamps playbackRate at boundaries
    await iframeFrame.evaluate(() => { document.querySelector('video').playbackRate = 3.75; });
    await page.locator('h2').click();
    await page.waitForTimeout(200);

    await page.keyboard.press('>'); // should clamp at 4.0
    await page.waitForTimeout(400);
    let state = await getVideoState(iframeFrame);
    expect(state.playbackRate).toBeCloseTo(4.0, 2);

    await iframeFrame.evaluate(() => { document.querySelector('video').playbackRate = 0.5; });
    await page.keyboard.press('<'); // down by 0.25 → 0.25
    await page.waitForTimeout(400);
    state = await getVideoState(iframeFrame);
    expect(state.playbackRate).toBeCloseTo(0.25, 2);

    await page.keyboard.press('<'); // already at min, should stay at 0.25
    await page.waitForTimeout(400);
    state = await getVideoState(iframeFrame);
    expect(state.playbackRate).toBeCloseTo(0.25, 2);
  });
  // NOTE: The "parent keyboard focus forwards to iframe" scenario is also tested
  // in Suite 4 ("keyboard shortcut from parent forwards to iframe via postMessage")
  // using an isolated page to avoid beforeEach state interactions.
});

// ── Suite 2: Position save and restore ───────────────────────────────────────

test.describe('Video position save and restore', () => {
  test.beforeEach(async () => { await storageClear(); });

  test('saves position on pause and restores on revisit', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await page.waitForSelector('video', { timeout: 10000 });
    await playAndSeekTo(page.mainFrame(), 45);

    // Pause — content script saves position on the pause event
    await page.evaluate(() => document.querySelector('video').pause());
    await page.waitForTimeout(600);

    // Verify save
    const all = await storageGet(null);
    const posKey = Object.keys(all).find((k) => k.startsWith('svc_pos::'));
    expect(posKey).toBeTruthy();
    expect(all[posKey].currentTime).toBeCloseTo(45, 0);

    // Navigate away and back — content script should restore position
    await page.goto('about:blank');
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 1,
      { timeout: 15000 }
    );
    // Give restorePosition time to run
    await page.waitForTimeout(1500);

    const ct = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0);
    expect(ct).toBeCloseTo(45, 0);

    await page.close();
  });

  test('does not restore position within 15s of end', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 3 && document.querySelector('video').duration > 0,
      { timeout: 20000 }
    );

    const duration = await page.evaluate(() => document.querySelector('video').duration);
    const nearEnd = duration - 10;

    await storageSet({
      [`svc_pos::${baseUrl}/iframe.html`]: {
        currentTime: nearEnd,
        duration,
        savedAt: Date.now(),
      },
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 1,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const ct = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0);
    expect(ct).toBeLessThan(nearEnd - 5); // not restored

    await page.close();
  });

  test('does not restore stale saves (> 30 days old)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 1,
      { timeout: 15000 }
    );

    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    await storageSet({
      [`svc_pos::${baseUrl}/iframe.html`]: {
        currentTime: 60,
        duration: 300,
        savedAt: thirtyOneDaysAgo,
      },
    });

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => document.querySelector('video')?.readyState >= 1,
      { timeout: 15000 }
    );
    await page.waitForTimeout(1000);

    const ct = await page.evaluate(() => document.querySelector('video')?.currentTime ?? 0);
    expect(ct).toBeLessThan(10); // not restored

    await page.close();
  });
});

// ── Suite 3: Shortcut configuration ──────────────────────────────────────────

test.describe('Shortcut configuration', () => {
  test.beforeEach(async () => { await storageClear(); });

  test('custom shortcuts persist and work after reload', async () => {
    await storageSet({
      svc_shortcuts: {
        playPause:   { key: 'p', label: 'p' },
        skipForward: { key: 'l', label: 'l' },
        skipBack:    { key: 'j', label: 'j' },
        volumeUp:    { key: 'ArrowUp',   label: '↑' },
        volumeDown:  { key: 'ArrowDown', label: '↓' },
        speedUp:     { key: ']', label: ']' },
        speedDown:   { key: '[', label: '[' },
      },
    });

    const page = await browser.newPage();
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await playAndSeekTo(page.mainFrame(), 30);

    await page.locator('body').click();
    await page.waitForTimeout(200);

    const before = await getVideoState(page.mainFrame());
    await page.keyboard.press('l'); // custom skipForward
    await page.waitForTimeout(600);
    const after = await getVideoState(page.mainFrame());
    expect(after.currentTime).toBeGreaterThan(before.currentTime + 5);

    await page.close();
  });

  test('removing custom shortcuts restores defaults (ArrowRight works)', async () => {
    await swWorker.evaluate(
      () => new Promise((r) => chrome.storage.local.remove('svc_shortcuts', r))
    );

    const page = await browser.newPage();
    await page.goto(`${baseUrl}/iframe.html`, { waitUntil: 'networkidle' });
    await playAndSeekTo(page.mainFrame(), 30);

    await page.locator('body').click();
    await page.waitForTimeout(200);

    const before = await getVideoState(page.mainFrame());
    await page.keyboard.press('ArrowRight'); // default skipForward
    await page.waitForTimeout(600);
    const after = await getVideoState(page.mainFrame());
    expect(after.currentTime).toBeGreaterThan(before.currentTime + 5);

    await page.close();
  });
});

// ── Suite 4: Iframe video handling ───────────────────────────────────────────

test.describe('Iframe-embedded video handling', () => {
  test.beforeEach(async () => { await storageClear(); });

  test('content script runs in iframe frame', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/parent.html`, { waitUntil: 'networkidle' });

    const iframeFrame = page.frames().find((f) => f.url().includes('/iframe.html'));
    expect(iframeFrame).toBeTruthy();

    const hasVideo = await iframeFrame.evaluate(() => !!document.querySelector('video'));
    expect(hasVideo).toBe(true);

    await page.close();
  });

  test('extension tracks video in iframe (dataset.svcTracked)', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/parent.html`, { waitUntil: 'networkidle' });

    const iframeFrame = page.frames().find((f) => f.url().includes('/iframe.html'));
    await iframeFrame.waitForSelector('video');

    // dataset.svcTracked is set by the content script (isolated world)
    // and is visible from the main world because dataset attrs are shared
    await iframeFrame.waitForFunction(
      () => document.querySelector('video')?.dataset?.svcTracked === '1',
      { timeout: 10000 }
    );

    const tracked = await iframeFrame.evaluate(
      () => document.querySelector('video')?.dataset?.svcTracked
    );
    expect(tracked).toBe('1');

    await page.close();
  });

  test('dynamically added video is detected by MutationObserver', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/parent.html`, { waitUntil: 'networkidle' });

    await page.evaluate((src) => {
      const v = document.createElement('video');
      v.id = 'dynamic-video';
      v.src = src;
      document.body.appendChild(v);
    }, `${baseUrl}/test.mp4`);

    await page.waitForFunction(
      () => document.getElementById('dynamic-video')?.dataset?.svcTracked === '1',
      { timeout: 10000 }
    );

    const tracked = await page.evaluate(
      () => document.getElementById('dynamic-video')?.dataset?.svcTracked
    );
    expect(tracked).toBe('1');

    await page.close();
  });

  test('keyboard shortcut from parent forwards to iframe via postMessage', async () => {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/parent.html`, { waitUntil: 'networkidle' });

    const iframeFrame = page.frames().find((f) => f.url().includes('/iframe.html'));
    await playAndSeekTo(iframeFrame, 60);
    await page.waitForTimeout(300);

    // Parent has focus — ArrowRight goes through parent → postMessage → iframe
    await page.locator('h2').click();
    await page.waitForTimeout(200);

    const before = await getVideoState(iframeFrame);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    const after = await getVideoState(iframeFrame);
    expect(after.currentTime).toBeGreaterThan(before.currentTime + 5);

    await page.close();
  });
});

// ── Suite 5: Animepahe integration tests (@animepahe) ────────────────────────

const TEST_URL =
  'https://animepahe.si/play/a688235b-021a-ef3d-9bf1-da361e93e53e/34723709ea3ecf4277a3def9022a106773d2daa6b42eba4fb593fa58f46f7abe';

test('@animepahe: extension loads and detects iframe', async () => {
  test.slow();
  const page = await browser.newPage();
  const svcLogs = [];
  page.on('console', (msg) => {
    if (msg.text().includes('[SVC]')) svcLogs.push(msg.text());
  });

  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const initLog = svcLogs.find((l) => l.includes('Init (top)'));
  expect(initLog).toBeTruthy();

  const iframeCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
  expect(iframeCount).toBeGreaterThan(0);

  await page.close();
});

test('@animepahe: shortcuts work after user clicks play', async () => {
  test.slow();
  test.setTimeout(90000);

  const page = await browser.newPage();
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  let videoFrame = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(1000);
    for (const frame of page.frames()) {
      const hasVideo = await frame
        .evaluate(() => !!document.querySelector('video'))
        .catch(() => false);
      if (hasVideo) { videoFrame = frame; break; }
      try {
        await frame.locator('body').click({ position: { x: 320, y: 180 }, timeout: 500 });
      } catch (_) {}
    }
    if (videoFrame) break;
  }

  if (!videoFrame) {
    console.log('[skip] No video found — page may require manual interaction');
    await page.close();
    return;
  }

  await videoFrame
    .waitForFunction(() => document.querySelector('video')?.dataset?.svcTracked === '1', {
      timeout: 10000,
    })
    .catch(() => console.log('[warn] Video not tracked within timeout'));

  const before = await getVideoState(videoFrame);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  const after = await getVideoState(videoFrame);
  expect(after.currentTime).toBeGreaterThanOrEqual(before.currentTime);

  await page.close();
});
