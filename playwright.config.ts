import { defineConfig, devices } from '@playwright/test';

const localExecPath =
  '/Users/mize/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    viewport: { width: 1366, height: 820 }
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 820 },
        launchOptions: {
          executablePath: localExecPath,
          args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
        }
      }
    }
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 30000
  }
});
