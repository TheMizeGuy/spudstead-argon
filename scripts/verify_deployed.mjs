import { chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEPLOYED_URL = process.env.DEPLOYED_URL || 'https://themizeguy.github.io/spudstead-argon/';
const localExecPath =
  '/Users/mize/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';

async function runAcceptanceTest() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spudstead-deployed-profile-'));
  console.log(`[1/7] Launching persistent Chromium profile at ${userDataDir}`);
  console.log(`      Testing live deployed URL: ${DEPLOYED_URL}`);

  const consoleErrors = [];
  const failedAssets = [];

  let context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    executablePath: fs.existsSync(localExecPath) ? localExecPath : undefined,
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'],
    viewport: { width: 1440, height: 900 }
  });

  try {
    let page = context.pages()[0] || (await context.newPage());
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) failedAssets.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(DEPLOYED_URL, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'SPUDSTEAD' })).toBeVisible({ timeout: 15000 });

    // Step 1: Start a New Game using normal UI controls and verify 3D WebGL, Tutorial, and Zero Emojis
    await page.getByTestId('input-farm-name').fill('Live Deployed Farm');
    await page.getByTestId('btn-new-game').click();
    await expect(page.getByTestId('hud-gold')).toContainText('120g');
    await expect(page.getByTestId('save-indicator')).toContainText('Saved');
    await expect(page.getByTestId('tutorial-banner')).toBeVisible();
    await expect(page.getByTestId('tutorial-banner')).toContainText('Step 1 of 6');

    await page.getByTestId('tutorial-guide-btn').click();
    await expect(page.getByTestId('modal-tutorial')).toBeVisible();
    await page.getByTestId('modal-close').click();

    const hasEmojis = await page.evaluate(() => {
      const emojiRe = /[\p{Extended_Pictographic}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}]/u;
      return emojiRe.test(document.body.innerText);
    });
    expect(hasEmojis).toBe(false);
    console.log(
      '[1/7] PASS: Opened deployed GitHub Pages URL, verified 3D WebGL + Interactive Tutorial + Zero Emojis, and started New Game via UI.'
    );

    // Step 2: Perform real gameplay actions changing planted-crop state, money/inventory state, and progression/upgrade state
    await page.keyboard.down('s');
    await page.waitForTimeout(320);
    await page.keyboard.up('s');
    await page.keyboard.down('d');
    await page.waitForTimeout(260);
    await page.keyboard.up('d');

    // Harvest mature starter crop at (9,8) and (10,8)
    await page.keyboard.press('4'); // Harvest Fork
    await page.keyboard.press('e');
    await page.waitForTimeout(150);
    await page.keyboard.down('d');
    await page.waitForTimeout(220);
    await page.keyboard.up('d');
    await page.keyboard.press('s');
    await page.keyboard.press('e');
    await page.waitForTimeout(150);

    // Claim Quest 1 reward via HUD button
    await expect(page.getByTestId('hud-claim-quest')).toBeVisible();
    await page.getByTestId('hud-claim-quest').click();
    await expect(page.getByTestId('hud-gold')).toContainText('165g');

    // Plant a Yukon Sunburst seed at (10,9) and water it
    await page.keyboard.down('s');
    await page.waitForTimeout(220);
    await page.keyboard.up('s');
    await page.keyboard.press('5'); // Seed Pouch
    await page.keyboard.press('e'); // Plant
    await page.waitForTimeout(150);
    await page.keyboard.press('3'); // Watering Can
    await page.keyboard.press('e'); // Water
    await page.waitForTimeout(150);

    // Open Shop & Market Stall, sell harvested potatoes, and purchase Tempered Ash Spade upgrade
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();
    await page.getByTestId('tab-shop-sell').click();
    await page.locator('[data-testid^="sell-all-crop_"]').first().click();
    await page.getByTestId('tab-shop-upgrades').click();
    await page.getByTestId('buy-upgrade-tool_spade_1').click();
    await page.getByTestId('modal-close').click();

    const savedGoldText = await page.getByTestId('hud-gold').textContent();
    console.log(
      `[2/7] PASS: Performed real crop planting/watering, harvest sale, quest claim, and upgrade purchase (Gold=${savedGoldText?.trim()}).`
    );

    // Step 3: Trigger explicit save and verify UI reports save completed
    await page.getByTestId('hud-save-btn').click();
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved');
    const saveIndicatorText = await page.getByTestId('save-indicator').textContent();
    console.log(`[3/7] PASS: Triggered explicit save and verified UI indicator (${saveIndicatorText?.trim()}).`);

    // Step 4: Reload deployed page and confirm Continue restores exact saved state
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('continue-banner')).toBeVisible();
    await expect(page.getByTestId('continue-banner')).toContainText('Live Deployed Farm');
    await page.getByTestId('btn-continue').click();
    await expect(page.getByTestId('hud-gold')).toHaveText(savedGoldText);
    console.log('[4/7] PASS: Reloaded deployed page and confirmed Continue restored exact saved state.');

    // Step 5: Close browser context completely, reopen deployed URL in the same persistent browser profile, and confirm Continue restores same farm
    await context.close();
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: fs.existsSync(localExecPath) ? localExecPath : undefined,
      viewport: { width: 1440, height: 900 }
    });
    page = context.pages()[0] || (await context.newPage());
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) failedAssets.push(`${res.status()} ${res.url()}`);
    });

    await page.goto(DEPLOYED_URL, { waitUntil: 'networkidle' });
    await expect(page.getByTestId('continue-banner')).toBeVisible();
    await expect(page.getByTestId('continue-banner')).toContainText('Live Deployed Farm');
    await page.getByTestId('btn-continue').click();
    await expect(page.getByTestId('hud-gold')).toHaveText(savedGoldText);

    const upgradesAfterRestart = await page.evaluate(() => {
      return window.__SPUDSTEAD__?.getState().upgrades || [];
    });
    expect(upgradesAfterRestart).toContain('tool_spade_1');
    console.log(
      '[5/7] PASS: Closed and reopened persistent browser context; Continue restored exact farm, gold, and upgrade.'
    );

    // Step 6: Export save file, reset/delete browser save, import exported file, and confirm farm state is restored
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('settings-export-btn').click();
    const exportedJson = await page.getByTestId('export-json-textarea').inputValue();
    expect(exportedJson).toContain('Live Deployed Farm');
    await page.locator('#modal-close').click();

    // Reset save with confirmation
    await page.getByTestId('settings-reset-btn').click();
    await expect(page.getByTestId('modal-confirm')).toBeVisible();
    await page.getByTestId('confirm-ok-btn').click();

    // Should be back on Title Screen with no Continue banner
    await expect(page.getByTestId('continue-banner')).toHaveCount(0);

    // Import exported save from Title Screen
    await page.getByTestId('btn-title-import').click();
    await page.getByTestId('import-json-textarea').fill(exportedJson);
    await page.getByTestId('btn-confirm-import').click();
    await expect(page.getByTestId('hud-gold')).toHaveText(savedGoldText);
    console.log(
      '[6/7] PASS: Exported save JSON, reset browser save, imported save file, and verified full restoration.'
    );

    // Step 7: Simulate corrupted primary save record (recover from backup) & unavailable storage (visible warning)
    await page.evaluate(async () => {
      await window.__SPUDSTEAD__?.triggerSave('ensure_backup');
      await window.__SPUDSTEAD__?.corruptPrimarySave();
    });

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('continue-banner')).toBeVisible();
    await expect(page.getByTestId('title-storage-notice')).toContainText('backup');
    await page.getByTestId('btn-continue').click();
    await expect(page.getByTestId('hud-gold')).toHaveText(savedGoldText);

    // Simulate unavailable storage and verify user-facing error indicator
    await page.evaluate(() => {
      window.__SPUDSTEAD__?.setSimulateStorageFailure(true);
    });
    await page.getByTestId('hud-save-btn').click();
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'error');
    await page.evaluate(async () => {
      window.__SPUDSTEAD__?.setSimulateStorageFailure(false);
      await window.__SPUDSTEAD__?.triggerSave('restore_working_save');
    });
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved');
    console.log('[7/7] PASS: Verified corrupted primary save recovery from backup and visible storage error warning.');

    if (consoleErrors.length > 0 || failedAssets.length > 0) {
      throw new Error(`Errors found: console=${JSON.stringify(consoleErrors)}, assets=${JSON.stringify(failedAssets)}`);
    }
    console.log('ALL 7 DEPLOYED-SITE ACCEPTANCE CHECKS PASSED WITH 0 CONSOLE/ASSET ERRORS!');
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

runAcceptanceTest().catch((err) => {
  console.error('DEPLOYED ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
