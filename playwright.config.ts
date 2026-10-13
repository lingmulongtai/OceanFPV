import { defineConfig, devices } from '@playwright/test';
const nativeGpu=process.env.OCEANFPV_NATIVE_GPU==='1';
if(nativeGpu&&process.platform!=='win32')throw new Error('Native Direct3D11 verification requires Windows');
export default defineConfig({
  testDir: './tests/browser', timeout: 180000, expect: { timeout: 20000 },
  fullyParallel: false, workers: 1, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: { mode: 'retain-on-failure', screenshots: false }, screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 640, height: 480 }, launchOptions: { args: ['--enable-webgl', '--ignore-gpu-blocklist',nativeGpu?'--use-angle=d3d11':'--enable-unsafe-swiftshader'] } } }],
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
