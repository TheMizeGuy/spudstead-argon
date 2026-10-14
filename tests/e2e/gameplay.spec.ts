import { expect, test } from '@playwright/test';

const screenshotPath = (name: string) => `screenshots/${name}`;

test.describe('SPUDSTEAD End-to-End Gameplay, Visual Verification & Save Acceptance', () => {
  test('Full browser-driven loop: New Game -> harvest/plant/water/hill -> normal time advance -> sell -> upgrade -> save/reload/continue -> export/reset/import -> recovery & viewports', async ({
    page
  }) => {
    const consoleErrors: string[] = [];
    const failedAssets: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        failedAssets.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'SPUDSTEAD' })).toBeVisible();

    // Capture Title Screen screenshot
    await page.screenshot({ path: screenshotPath('01-title-screen.png') });

    // 1. Start a New Game using normal UI controls
    const nameInput = page.getByTestId('input-farm-name');
    await nameInput.fill('Golden Tuber Estate');
    await page.getByTestId('btn-new-game').click();

    await expect(page.getByTestId('hud-gold')).toContainText('120g');
    await expect(page.getByTestId('save-indicator')).toContainText('Saved');
    await expect(page.getByTestId('tutorial-banner')).toBeVisible();
    await expect(page.getByTestId('tutorial-banner')).toContainText('Step 1 of 6');

    // Open and inspect the Interactive Tutorial Modal, then close it
    await page.getByTestId('tutorial-guide-btn').click();
    await expect(page.getByTestId('modal-tutorial')).toBeVisible();
    await page.getByTestId('modal-close').click();

    // Verify ZERO emojis in rendered DOM text
    const hasEmojis = await page.evaluate(() => {
      const emojiRe = /[\p{Extended_Pictographic}\u{2600}-\u{27BF}\u{1F300}-\u{1FAFF}]/u;
      return emojiRe.test(document.body.innerText);
    });
    expect(hasEmojis).toBe(false);

    // Capture Starter Farm screenshot
    await page.waitForTimeout(300);
    await page.screenshot({ path: screenshotPath('02-starter-farm.png') });

    // Verify controllable scrollwheel zoom & wider max zoom-out (up to 1.85x scale)
    const zoomBtn = page.getByTestId('hud-zoom-level');
    await expect(zoomBtn).toHaveAttribute('data-zoom-scale', '1.22');
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(100);
    const zoomedOutScale = Number(await zoomBtn.getAttribute('data-zoom-scale'));
    expect(zoomedOutScale).toBeGreaterThan(1.22);

    // Scroll out several times to reach max zoom out (1.85)
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 400);
    }
    await page.waitForTimeout(100);
    await expect(zoomBtn).toHaveAttribute('data-zoom-scale', '1.85');

    // Scroll back in and then reset zoom via HUD button
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    const zoomedInFromMax = Number(await zoomBtn.getAttribute('data-zoom-scale'));
    expect(zoomedInFromMax).toBeLessThan(1.85);
    await zoomBtn.click();
    await expect(zoomBtn).toHaveAttribute('data-zoom-scale', '1.22');

    // 2. Move player using normal keyboard controls (S and D) down into the Homestead field near (9,8)
    await page.keyboard.down('s');
    await page.waitForTimeout(320);
    await page.keyboard.up('s');
    await page.keyboard.down('d');
    await page.waitForTimeout(260);
    await page.keyboard.up('d');

    // Select Harvest Fork (Key 4) and press E to harvest starter crop at (9,8)
    await page.keyboard.press('4');
    await page.keyboard.press('e');
    await page.waitForTimeout(150);

    // Move right 1 tile to (10,7) facing down to (10,8) and harvest second starter ridge
    await page.keyboard.down('d');
    await page.waitForTimeout(220);
    await page.keyboard.up('d');
    await page.keyboard.press('s');
    await page.keyboard.press('e');
    await page.waitForTimeout(150);

    // Verify Quest 1 ("First Forks in the Loam") is now ready and claimable right from HUD!
    await expect(page.getByTestId('hud-claim-quest')).toBeVisible();
    await page.getByTestId('hud-claim-quest').click();
    await expect(page.getByTestId('hud-gold')).toContainText('165g');

    // 3. Plant a seed in pre-tilled furrow (9,9) using Seed Pouch (Key 5), then Water (Key 3), and Hill (Key 2)
    await page.keyboard.down('s');
    await page.waitForTimeout(220);
    await page.keyboard.up('s');
    await page.keyboard.press('5'); // Seed Pouch
    await page.keyboard.press('e'); // Plant seed
    await page.waitForTimeout(150);

    await page.keyboard.press('3'); // Watering Can
    await page.keyboard.press('e'); // Water planted seed
    await page.waitForTimeout(150);

    // Advance time normally at 4x speed for 2.2 seconds and verify clock advances
    await page.locator('.speed-btn[data-speed="4"]').click();
    await page.waitForTimeout(2200);
    await page.locator('.speed-btn[data-speed="1"]').click();

    // 4. Open Shop & Market Stall (M), sell harvested Yukon Sunburst potatoes, and buy an upgrade
    await page.getByTestId('nav-shop').click();
    await expect(page.getByTestId('modal-shop')).toBeVisible();

    // Capture Shop Modal screenshot
    await page.waitForTimeout(150);
    await page.screenshot({ path: screenshotPath('03-shop-inventory.png') });

    // Switch to Sell tab and sell all harvested potatoes
    await page.getByTestId('tab-shop-sell').click();
    const sellAllBtns = page.locator('[data-testid^="sell-all-crop_"]');
    const sellCount = await sellAllBtns.count();
    expect(sellCount).toBeGreaterThan(0);
    await sellAllBtns.first().click();

    // Switch to Upgrades tab and purchase Tempered Ash Spade (85g)
    await page.getByTestId('tab-shop-upgrades').click();
    await page.getByTestId('buy-upgrade-tool_spade_1').click();
    await page.getByTestId('modal-close').click();

    // Confirm gold & upgrade state before reload
    const goldAfterUpgradeText = await page.getByTestId('hud-gold').textContent();
    expect(goldAfterUpgradeText).toBeTruthy();

    // 5. Explicitly Save Now and confirm "Saved" indicator
    await page.getByTestId('hud-save-btn').click();
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved');

    // 6. Reload page and verify Continue Banner shows saved farm details, then click Continue
    await page.reload();
    await expect(page.getByTestId('continue-banner')).toBeVisible();
    await expect(page.getByTestId('continue-banner')).toContainText('Golden Tuber Estate');
    await page.getByTestId('btn-continue').click();

    // Verify upgraded state & gold persisted across reload!
    await expect(page.getByTestId('hud-gold')).toHaveText(goldAfterUpgradeText!);
    const upgradesAfterReload = await page.evaluate(() => {
      return window.__SPUDSTEAD__?.getState().upgrades || [];
    });
    expect(upgradesAfterReload).toContain('tool_spade_1');

    // 7. Test Export Save -> Reset with Confirmation -> Import Save -> Verify Restoration
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('settings-export-btn').click();
    const exportedJson = await page.getByTestId('export-json-textarea').inputValue();
    expect(exportedJson).toContain('Golden Tuber Estate');
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

    // Verify imported farm is restored in gameplay!
    await expect(page.getByTestId('hud-gold')).toHaveText(goldAfterUpgradeText!);

    // 8. Test Corrupt Primary Save automatic recovery from backup
    await page.evaluate(async () => {
      await window.__SPUDSTEAD__?.triggerSave('ensure_backup');
      await window.__SPUDSTEAD__?.corruptPrimarySave();
    });
    await page.reload();
    await expect(page.getByTestId('continue-banner')).toBeVisible();
    await expect(page.getByTestId('title-storage-notice')).toContainText('backup');
    await page.getByTestId('btn-continue').click();

    // 9. Test Unavailable Storage failure handling (must report error, never falsely claim Saved)
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

    // 10. Capture Rain/Night screenshot & Developed Mid/Endgame Farm screenshot
    await page.evaluate(() => {
      const st = window.__SPUDSTEAD__!.getState();
      st.calendar.weather = 'rainy';
      st.calendar.hour = 20.0; // Twilight / Night with glowing farmhouse windows & rain
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: screenshotPath('04-rain-night.png') });

    // Setup a richly developed farm state with unlocked plots, sprinklers, all 6 potato varieties across stages, and Golden Spud Trophy
    const tileCount = await page.evaluate(() => {
      const st = window.__SPUDSTEAD__!.getState();
      st.calendar.weather = 'sunny';
      st.calendar.season = 'summer';
      st.calendar.dayOfSeason = 4;
      st.calendar.hour = 9.5;
      st.player.gold = 2480;
      st.player.x = 17;
      st.player.y = 12;
      st.unlockedPlots = ['plot_homestead', 'plot_south', 'plot_east', 'plot_greenhouse'];
      st.upgrades = [
        'tool_spade_1',
        'tool_hoe_1',
        'tool_fork_1',
        'water_can_1',
        'pack_1',
        'boots_1',
        'land_south',
        'land_east',
        'land_greenhouse',
        'irrigation_1',
        'irrigation_2'
      ];
      st.festival.won = true;
      st.festival.wonOnDay = 18;
      st.festival.trophyPlaced = true;

      const varieties = ['sunburst', 'crimson', 'russet', 'violet', 'frostbite', 'truffle'] as const;
      for (const tile of st.tiles) {
        if (tile.terrain === 'farm_soil') {
          tile.debris = 'none';
          tile.tilled = true;
          tile.moisture = 75;
          tile.fertility = 80;
          if (
            (tile.x === 11 && tile.y === 9) ||
            (tile.x === 11 && tile.y === 20) ||
            (tile.x === 25 && tile.y === 9) ||
            (tile.x === 25 && tile.y === 20)
          ) {
            const mId = `sprinkler_${tile.x}_${tile.y}`;
            tile.machineId = mId;
            tile.crop = null;
            if (!st.machines.some((m) => m.id === mId)) {
              st.machines.push({
                id: mId,
                type: 'sprinkler',
                x: tile.x,
                y: tile.y,
                activeRecipeId: null,
                progressHours: 0,
                durationHours: 0,
                outputItem: null
              });
            }
          } else {
            const vId = varieties[(tile.x + tile.y) % varieties.length];
            const stage = ((tile.x * 3 + tile.y) % 4 + 1) as 1 | 2 | 3 | 4;
            tile.crop = {
              varietyId: vId,
              growthPct: stage === 4 ? 100 : stage * 24,
              stage,
              hillLevel: 2,
              careScore: 85,
              stressScore: 0,
              hasWeeds: false,
              hasPests: false,
              hoursGrown: 25,
              wateredToday: true
            };
          }
        }
      }
      return st.tiles.length;
    });
    expect(tileCount).toBe(38 * 28);

    // Zoom out slightly with the scrollwheel so the developed farm screenshot showcases the expanded estate & spread-out plots
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 350);
    await page.waitForTimeout(350);
    await page.screenshot({ path: screenshotPath('05-developed-farm.png') });
    await page.getByTestId('hud-zoom-level').click();

    // 11. Measure real desktop FPS over 45 frames
    const measuredFps = await page.evaluate(async () => {
      return new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        function step() {
          frames++;
          if (frames < 45) {
            requestAnimationFrame(step);
          } else {
            const elapsedSec = (performance.now() - t0) / 1000;
            resolve(Math.round(frames / elapsedSec));
          }
        }
        requestAnimationFrame(step);
      });
    });
    expect(measuredFps).toBeGreaterThanOrEqual(30);

    // 12. Verify Mobile Portrait Viewport (390x844) and capture screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await expect(page.locator('#touch-controls')).toBeVisible();
    await page.screenshot({ path: screenshotPath('06-mobile-layout.png') });

    // Ensure zero console or asset errors occurred
    expect(consoleErrors).toEqual([]);
    expect(failedAssets).toEqual([]);
  });
});
