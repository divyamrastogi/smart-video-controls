#!/usr/bin/env node
'use strict';

/**
 * publish.js — Chrome Web Store publish script
 *
 * Usage:  node publish.js [options]
 *
 * Options:
 *   --bump patch|minor|major   Bump version in manifest.json before packaging
 *   --publish                  Publish after uploading
 *   --dry-run                  Build zip only; skip upload/publish
 *   --help                     Show help and credential setup guide
 *
 * Credentials (via .env file or environment variables):
 *   CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, EXTENSION_ID
 */

const fs = require('fs');
const https = require('https');
const { spawnSync } = require('child_process');

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { bump: null, publish: false, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--bump') {
      const type = argv[++i];
      if (!['patch', 'minor', 'major'].includes(type)) {
        die(`--bump requires patch, minor, or major — got: ${type}`);
      }
      args.bump = type;
    } else if (arg === '--publish') {
      args.publish = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      die(`Unknown argument: ${arg}\nRun with --help for usage.`);
    }
  }
  return args;
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold:  '\x1b[1m',
  red:   '\x1b[31m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
};

function die(msg) {
  console.error(`${c.red}Error:${c.reset} ${msg}`);
  process.exit(1);
}

function log(msg)     { console.log(`${c.cyan}→${c.reset} ${msg}`); }
function success(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function warn(msg)    { console.log(`${c.yellow}⚠${c.reset}  ${msg}`); }
function header(msg)  { console.log(`\n${c.bold}${msg}${c.reset}`); }

// ─── .env loader ─────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync('.env')) return;
  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Version helpers ──────────────────────────────────────────────────────────

function validateVersion(v) {
  return /^\d+(\.\d+){0,3}$/.test(v);
}

function bumpVersion(current, type) {
  const parts = current.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  if (type === 'major')      { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[1]++; parts[2] = 0; }
  else                       { parts[2]++; }
  return parts.join('.');
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function readManifest() {
  if (!fs.existsSync('manifest.json')) {
    die('manifest.json not found. Run this script from the extension root directory.');
  }
  try {
    return JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  } catch (e) {
    die(`manifest.json is not valid JSON: ${e.message}`);
  }
}

function writeManifest(manifest) {
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Derive every file/directory the extension needs from manifest.json.
 * Returns { rootFiles: string[], dirs: string[] } where dirs are top-level
 * subdirectory names (e.g. 'modules', 'images').
 */
function collectPackageEntries(manifest) {
  const files = new Set(['manifest.json']);

  // Background service worker
  if (manifest.background?.service_worker) {
    files.add(manifest.background.service_worker);
  }

  // Content scripts (JS + CSS)
  for (const cs of manifest.content_scripts || []) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) {
      files.add(f);
    }
  }

  // Action popup + icons
  const popup = manifest.action?.default_popup;
  if (popup) {
    files.add(popup);
    // Include the companion JS file if it exists (popup.html → popup.js)
    const popupJs = popup.replace(/\.html$/, '.js');
    if (fs.existsSync(popupJs)) files.add(popupJs);
  }
  for (const icon of Object.values(manifest.action?.default_icon || {})) {
    files.add(icon);
  }

  // Web-accessible resources (no wildcards)
  for (const res of manifest.web_accessible_resources || []) {
    for (const r of res.resources || []) {
      if (!r.includes('*')) files.add(r);
    }
  }

  // Split into root files vs. subdirectory buckets
  const dirs = new Set();
  const rootFiles = new Set();
  for (const f of files) {
    if (f.includes('/')) {
      dirs.add(f.split('/')[0]);
    } else {
      rootFiles.add(f);
    }
  }

  return { rootFiles: [...rootFiles].sort(), dirs: [...dirs].sort() };
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateManifestFiles(manifest) {
  header('Validating extension files');

  if (!validateVersion(manifest.version)) {
    die(`Invalid version format in manifest.json: "${manifest.version}"`);
  }
  success(`Version: ${manifest.version}`);

  const { rootFiles, dirs } = collectPackageEntries(manifest);

  const missingFiles = rootFiles.filter(f => !fs.existsSync(f));
  if (missingFiles.length) {
    die(`Missing files referenced in manifest:\n  ${missingFiles.join('\n  ')}`);
  }

  const missingDirs = dirs.filter(d => !fs.existsSync(d));
  if (missingDirs.length) {
    die(`Missing directories referenced in manifest:\n  ${missingDirs.join('\n  ')}`);
  }

  success(`All ${rootFiles.length} root file(s) and ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'} exist.`);
}

// ─── Zip packaging ───────────────────────────────────────────────────────────

function buildZipName(version) {
  return `extension-v${version}.zip`;
}

function createZip(manifest, zipPath, dryRun) {
  header('Packaging extension');

  const { rootFiles, dirs } = collectPackageEntries(manifest);
  const entries = [...rootFiles, ...dirs.map(d => `${d}/`)];

  log(`Entries to include:\n    ${entries.join('\n    ')}`);
  log(`Output: ${zipPath}`);

  if (dryRun) {
    warn('[dry-run] Skipping zip creation.');
    return;
  }

  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
    log(`Removed existing ${zipPath}`);
  }

  // zip is available on macOS and most Linux distros
  const result = spawnSync('zip', ['-r', zipPath, ...rootFiles, ...dirs], {
    stdio: 'inherit',
  });

  if (result.error) {
    die(`Failed to run zip: ${result.error.message}\nMake sure the 'zip' utility is installed.`);
  }
  if (result.status !== 0) {
    die(`zip exited with code ${result.status}`);
  }

  const stat = fs.statSync(zipPath);
  success(`Created ${zipPath} (${(stat.size / 1024).toFixed(1)} KB)`);
}

// ─── HTTPS helpers ────────────────────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function httpsUploadFile(options, filePath) {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(filePath);
    const reqOptions = {
      ...options,
      headers: { ...options.headers, 'Content-Length': fileBuffer.length },
    };
    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

async function getAccessToken(clientId, clientSecret, refreshToken) {
  log('Fetching OAuth2 access token...');

  const body = [
    `client_id=${encodeURIComponent(clientId)}`,
    `client_secret=${encodeURIComponent(clientSecret)}`,
    `refresh_token=${encodeURIComponent(refreshToken)}`,
    'grant_type=refresh_token',
  ].join('&');

  const res = await httpsRequest({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);

  if (res.status !== 200 || !res.data?.access_token) {
    die(`Failed to get access token (HTTP ${res.status}): ${JSON.stringify(res.data)}`);
  }

  success('Access token obtained.');
  return res.data.access_token;
}

// ─── Chrome Web Store API ─────────────────────────────────────────────────────

async function uploadZip(accessToken, extensionId, zipPath) {
  header('Uploading to Chrome Web Store');
  log(`Extension ID: ${extensionId}`);
  log(`File: ${zipPath}`);

  const res = await httpsUploadFile({
    hostname: 'www.googleapis.com',
    path: `/upload/chromewebstore/v1.1/items/${extensionId}`,
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
    },
  }, zipPath);

  if (res.status !== 200) {
    die(`Upload failed (HTTP ${res.status}):\n${JSON.stringify(res.data, null, 2)}`);
  }

  if (res.data?.uploadState === 'FAILURE') {
    const errors = res.data.itemError?.map(e => `  • ${e.error_code}: ${e.error_detail}`).join('\n') || JSON.stringify(res.data);
    die(`Upload rejected by the Web Store:\n${errors}`);
  }

  success(`Upload accepted. State: ${res.data?.uploadState || 'IN_PROGRESS'}`);
  return res.data;
}

async function publishExtension(accessToken, extensionId) {
  header('Publishing extension');

  const res = await httpsRequest({
    hostname: 'www.googleapis.com',
    path: `/chromewebstore/v1.1/items/${extensionId}/publish`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-goog-api-version': '2',
      'Content-Length': 0,
    },
  });

  if (res.status !== 200) {
    die(`Publish failed (HTTP ${res.status}):\n${JSON.stringify(res.data, null, 2)}`);
  }

  const status = Array.isArray(res.data?.status) ? res.data.status.join(', ') : JSON.stringify(res.data);
  success(`Published! Status: ${status}`);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
${c.bold}Chrome Web Store publish script${c.reset}

${c.bold}Usage:${c.reset}
  node publish.js [options]

${c.bold}Options:${c.reset}
  --bump patch|minor|major   Auto-increment version in manifest.json
  --publish                  Upload and publish to the Chrome Web Store
  --dry-run                  Build the zip and show what would happen; no upload
  --help                     Show this help

${c.bold}Examples:${c.reset}
  node publish.js --dry-run
  node publish.js --bump patch --dry-run
  node publish.js --bump patch
  node publish.js --bump minor --publish

${c.bold}Environment variables / .env file:${c.reset}
  CLIENT_ID       Google OAuth2 client ID
  CLIENT_SECRET   Google OAuth2 client secret
  REFRESH_TOKEN   OAuth2 refresh token (offline)
  EXTENSION_ID    Chrome Web Store extension ID

──────────────────────────────────────────────────────────────────
${c.bold}Setting up Chrome Web Store API credentials${c.reset}
──────────────────────────────────────────────────────────────────

${c.bold}1. Create a Google Cloud project${c.reset}
   • Open https://console.cloud.google.com/
   • Create a new project (or select an existing one).

${c.bold}2. Enable the Chrome Web Store API${c.reset}
   • Go to APIs & Services → Enable APIs and Services
   • Search for "Chrome Web Store API" and click Enable.

${c.bold}3. Create OAuth 2.0 credentials${c.reset}
   • APIs & Services → Credentials → Create Credentials → OAuth client ID
   • Application type: Desktop app
   • Save the CLIENT_ID and CLIENT_SECRET shown after creation.

${c.bold}4. Obtain a refresh token${c.reset}
   a) Open this URL in your browser (replace <CLIENT_ID>):

      https://accounts.google.com/o/oauth2/auth?\\
        client_id=<CLIENT_ID>\\
        &response_type=code\\
        &scope=https://www.googleapis.com/auth/chromewebstore\\
        &redirect_uri=urn:ietf:wg:oauth:2.0:oob\\
        &access_type=offline

   b) Authorize the app and copy the authorization code shown.

   c) Exchange the code for tokens with curl:

      curl -X POST https://oauth2.googleapis.com/token \\
        -d client_id=<CLIENT_ID> \\
        -d client_secret=<CLIENT_SECRET> \\
        -d code=<AUTH_CODE> \\
        -d grant_type=authorization_code \\
        -d redirect_uri=urn:ietf:wg:oauth:2.0:oob

   d) Copy the "refresh_token" value from the JSON response.

${c.bold}5. Find your Extension ID${c.reset}
   • Upload your extension once manually at
     https://chrome.google.com/webstore/devconsole
   • The ID appears in the URL on the extension detail page.

${c.bold}6. Create a .env file${c.reset} in this directory:

   CLIENT_ID=your_client_id_here
   CLIENT_SECRET=your_client_secret_here
   REFRESH_TOKEN=your_refresh_token_here
   EXTENSION_ID=your_extension_id_here

   ${c.yellow}Add .env to .gitignore to keep credentials out of source control.${c.reset}
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  loadEnv();

  // ── 1. Read and validate manifest ─────────────────────────────────────────
  let manifest = readManifest();
  validateManifestFiles(manifest);

  // ── 2. Bump version ───────────────────────────────────────────────────────
  if (args.bump) {
    header('Bumping version');
    const oldVersion = manifest.version;
    manifest.version = bumpVersion(oldVersion, args.bump);
    log(`${oldVersion} → ${c.bold}${manifest.version}${c.reset}  (${args.bump})`);
    if (!args.dryRun) {
      writeManifest(manifest);
      success(`manifest.json updated.`);
    } else {
      warn('[dry-run] manifest.json not modified.');
    }
  }

  // ── 3. Build zip ──────────────────────────────────────────────────────────
  const zipPath = buildZipName(manifest.version);
  createZip(manifest, zipPath, args.dryRun);

  if (args.dryRun) {
    header('Dry run complete');
    warn('No files were uploaded or published.');
    console.log(`\nTo upload for real, run:\n  node publish.js${args.bump ? ` --bump ${args.bump}` : ''} --publish\n`);
    return;
  }

  // ── 4. Upload ─────────────────────────────────────────────────────────────
  const clientId     = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  const refreshToken = process.env.REFRESH_TOKEN;
  const extensionId  = process.env.EXTENSION_ID;

  const missing = ['CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN', 'EXTENSION_ID']
    .filter(k => !process.env[k]);

  if (missing.length) {
    die(
      `Missing required credential(s): ${missing.join(', ')}\n\n` +
      `Set them in a .env file or as environment variables.\n` +
      `Run  node publish.js --help  for detailed setup instructions.`
    );
  }

  const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
  await uploadZip(accessToken, extensionId, zipPath);

  // ── 5. Publish (optional) ─────────────────────────────────────────────────
  if (args.publish) {
    await publishExtension(accessToken, extensionId);
  } else {
    warn('Extension uploaded but not published.');
    log('Run with --publish to make it live, or publish manually in the Developer Dashboard.');
  }

  header('Done');
  success(`Extension v${manifest.version} processed successfully.`);
}

main().catch(e => die(e.message || String(e)));
