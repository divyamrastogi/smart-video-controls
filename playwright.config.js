// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    headless: false, // Chrome extensions don't work in headless mode
    actionTimeout: 10000,
    trace: 'on-first-retry',
  },
  // Run all tests in a single worker so they share the browser instance
  workers: 1,
  projects: [
    {
      name: 'extension',
      use: {
        // We launch the browser manually in beforeAll, so no browser needed here
        browserName: 'chromium',
      },
    },
  ],
  // Grep to exclude @animepahe tests by default (they need network + manual play)
  grep: /^(?!.*@animepahe)/,
});
