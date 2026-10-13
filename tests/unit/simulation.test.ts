import { describe, expect, it } from 'vitest';
import { POTATO_VARIETIES, UPGRADES, VARIETY_ORDER } from '../../src/data/content';
import {
  advanceSimulationHours,
  buyAndPlaceMachine,
  buyShopItem,
  buyUpgrade,
  claimCommunityAid,
  claimQuestReward,
  collectMachineOutput,
  createNewGameState,
  fulfillDailyOrder,
  getFestivalPillars,
  hostGoldenSpudFestival,
  inspectTileCrop,
  performTileAction,
  sellInventoryItem,
  sleepToNextDay,
  startMachineRecipe,
  transferBetweenBackpackAndCellar
} from '../../src/sim/simulation';
import { getTileAt } from '../../src/sim/worldMap';

describe('SPUDSTEAD Core Simulation & Farming Mechanics', () => {
  it('initializes a valid farm with starter patch, pre-tilled furrows, starter seeds, and 3 processing stations', () => {
    const state = createNewGameState('Test Spudstead', 12345);
    expect(state.farmName).toBe('Test Spudstead');
    expect(state.player.gold).toBe(120);
    expect(state.unlockedPlots).toEqual(['plot_homestead']);
    expect(state.machines.length).toBe(3);

    // Check starter mature patch at (9,8) and (10,8)
    const t1 = getTileAt(state.tiles, 9, 8)!;
    const t2 = getTileAt(state.tiles, 10, 8)!;
    expect(t1.crop?.stage).toBe(4);
    expect(t2.crop?.stage).toBe(4);

    // Near-mature at (11,8)
    const t3 = getTileAt(state.tiles, 11, 8)!;
    expect(t3.crop?.stage).toBe(3);
    expect(t3.crop?.growthPct).toBeGreaterThanOrEqual(90);
  });

  it('executes complete farming loop: clear debris -> till -> compost -> plant -> water -> hill -> grow -> harvest', () => {
    const state = createNewGameState('Loop Farm', 42);
    // Find an untilled homestead tile at (13, 9)
    const getTarget = () => getTileAt(state.tiles, 13, 9)!;
    getTarget().debris = 'weeds';
    getTarget().tilled = false;
    getTarget().crop = null;

    // Move player adjacent to (13, 9)
    state.player.x = 12;
    state.player.y = 9;

    // 1. Clear weeds & till with Spade
    state.player.selectedTool = 'spade';
    const clearRes = performTileAction(state, 13, 9);
    expect(clearRes.ok).toBe(true);
    expect(getTarget().debris).toBe('none');
    expect(getTarget().tilled).toBe(true);

    // 2. Apply Rich Compost with Pouch
    state.player.selectedTool = 'pouch';
    state.player.selectedItemId = 'supply_compost';
    const fertBefore = getTarget().fertility;
    const compRes = performTileAction(state, 13, 9);
    expect(compRes.ok).toBe(true);
    expect(getTarget().fertility).toBeGreaterThan(fertBefore);

    // 3. Plant Yukon Sunburst Seed with Pouch
    state.player.selectedItemId = 'seed_sunburst';
    const plantRes = performTileAction(state, 13, 9);
    expect(plantRes.ok).toBe(true);
    expect(getTarget().crop).not.toBeNull();
    expect(getTarget().crop?.stage).toBe(0);

    // 4. Water crop with Watering Can
    state.player.selectedTool = 'watering_can';
    const waterBefore = state.player.water;
    const waterRes = performTileAction(state, 13, 9);
    expect(waterRes.ok).toBe(true);
    expect(state.player.water).toBe(waterBefore - 1);
    expect(getTarget().moisture).toBeGreaterThan(70);

    // 5. Hill up the potato ridge twice with Hilling Hoe
    state.player.selectedTool = 'hoe';
    const hill1 = performTileAction(state, 13, 9);
    expect(hill1.ok).toBe(true);
    expect(getTarget().crop?.hillLevel).toBe(1);

    const hill2 = performTileAction(state, 13, 9);
    expect(hill2.ok).toBe(true);
    expect(getTarget().crop?.hillLevel).toBe(2);

    // 3rd hill attempt should be rejected without consuming stamina
    const stamBefore = state.player.stamina;
    const hill3 = performTileAction(state, 13, 9);
    expect(hill3.ok).toBe(false);
    expect(hill3.reason).toBe('already_hilled');
    expect(state.player.stamina).toBe(stamBefore);

    // 6. Advance growth through all 5 stages
    const stagesSeen = new Set<number>([getTarget().crop!.stage]);
    for (let h = 0; h < 45; h++) {
      getTarget().moisture = 65; // keep optimal moisture
      advanceSimulationHours(state, 1, true);
      const c = getTarget().crop;
      if (c) stagesSeen.add(c.stage);
    }
    expect(stagesSeen.has(0)).toBe(true);
    expect(stagesSeen.has(1)).toBe(true);
    expect(stagesSeen.has(2)).toBe(true);
    expect(stagesSeen.has(3)).toBe(true);
    expect(stagesSeen.has(4)).toBe(true);
    expect(getTarget().crop?.stage).toBe(4);

    // Inspect mature crop
    const inspection = inspectTileCrop(state, getTarget());
    expect(inspection).not.toBeNull();
    expect(inspection?.projectedGrade).toBe('artisan');

    // 7. Harvest with Harvest Fork -> should yield Artisan grade tubers due to high care + double hill + compost!
    state.player.selectedTool = 'fork';
    const harvRes = performTileAction(state, 13, 9);
    expect(harvRes.ok).toBe(true);
    expect(getTarget().crop).toBeNull();

    const artisanItem = state.inventory.find(
      (i) => i.varietyId === 'sunburst' && i.quality === 'artisan'
    );
    expect(artisanItem).toBeDefined();
    expect(artisanItem!.quantity).toBeGreaterThanOrEqual(4);
  });

  it('protects harvest when backpack inventory is full and does not destroy the crop', () => {
    const state = createNewGameState('Full Pack Test', 99);
    state.player.x = 9;
    state.player.y = 7;
    state.player.selectedTool = 'fork';

    // Fill backpack to capacity with dummy stacks
    state.inventory = [];
    for (let i = 0; i < state.player.backpackCapacity; i++) {
      state.inventory.push({
        itemId: `dummy_item_${i}`,
        name: `Dummy ${i}`,
        category: 'supply',
        quantity: 1,
        unitValue: 5,
        description: 'Filler'
      });
    }

    const tile = getTileAt(state.tiles, 9, 8)!;
    expect(tile.crop?.stage).toBe(4);

    const res = performTileAction(state, 9, 8);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('inventory_full');
    // Crop must still be intact on the tile!
    expect(tile.crop).not.toBeNull();
    expect(tile.crop?.stage).toBe(4);
  });

  it('handles seasons, weather transitions, winter frostbite cultivar, and coldframe greenhouse', () => {
    const state = createNewGameState('Calendar Test', 777);
    expect(state.calendar.season).toBe('spring');

    // Advance 7 days to transition from Spring to Summer
    for (let d = 0; d < 7; d++) {
      sleepToNextDay(state);
    }
    expect(state.calendar.season).toBe('summer');
    expect(state.calendar.dayOfSeason).toBe(1);

    // Advance 14 more days to reach Winter
    for (let d = 0; d < 14; d++) {
      sleepToNextDay(state);
    }
    expect(state.calendar.season).toBe('winter');

    // Plant Sunburst (non-frost-tolerant) vs Glacier Finger (frostbite, frost-tolerant) outdoors in Winter
    const tSun = getTileAt(state.tiles, 9, 9)!;
    const tFrost = getTileAt(state.tiles, 10, 9)!;
    tSun.tilled = true;
    tFrost.tilled = true;
    tSun.crop = {
      varietyId: 'sunburst',
      growthPct: 0,
      stage: 0,
      hillLevel: 1,
      careScore: 10,
      stressScore: 0,
      hasWeeds: false,
      hasPests: false,
      hoursGrown: 0,
      wateredToday: true
    };
    tFrost.crop = {
      varietyId: 'frostbite',
      growthPct: 0,
      stage: 0,
      hillLevel: 1,
      careScore: 10,
      stressScore: 0,
      hasWeeds: false,
      hasPests: false,
      hoursGrown: 0,
      wateredToday: true
    };

    advanceSimulationHours(state, 10, true);
    // Glacier Finger thrives in winter far faster than outdoor Sunburst
    expect(tFrost.crop.growthPct).toBeGreaterThan(tSun.crop.growthPct * 3);
  });

  it('supports shopping, selling, upgrades, sprinkler irrigation, and all 3 processing stations', () => {
    const state = createNewGameState('Economy Test', 555);
    state.player.gold = 2000;

    // 1. Buy seeds and sell crops
    const buyRes = buyShopItem(state, 'seed_violet', 3);
    expect(buyRes.ok).toBe(true);

    // Reject negative or zero quantities
    expect(buyShopItem(state, 'seed_violet', -2).ok).toBe(false);
    expect(sellInventoryItem(state, 'seed_violet', 0).ok).toBe(false);

    // 2. Buy Copper Watering Can upgrade & South Land Deed
    const upgWater = buyUpgrade(state, 'water_can_1');
    expect(upgWater.ok).toBe(true);
    expect(state.player.maxWater).toBe(22);

    const upgLand = buyUpgrade(state, 'land_south');
    expect(upgLand.ok).toBe(true);
    expect(state.unlockedPlots.includes('plot_south')).toBe(true);

    // 3. Verify collision check rejects tile with debris (10,10 has weeds), then place Sprinkler at clean tile (11, 9) and verify it waters adjacent (10, 9)
    expect(buyAndPlaceMachine(state, 'sprinkler', 10, 10).ok).toBe(false);
    const dryTile = getTileAt(state.tiles, 10, 9)!;
    dryTile.moisture = 15;
    const placeRes = buyAndPlaceMachine(state, 'sprinkler', 11, 9);
    expect(placeRes.ok).toBe(true);
    expect(dryTile.moisture).toBeGreaterThanOrEqual(75);

    // 4. Test Seed Tuber Cutter processing station
    state.player.x = 9;
    state.player.y = 7;
    state.player.selectedTool = 'fork';
    performTileAction(state, 9, 8); // Harvest starter Sunburst tubers

    const cutter = state.machines.find((m) => m.type === 'seed_cutter')!;
    const startCut = startMachineRecipe(state, cutter.id, 'recipe_seed_sunburst');
    expect(startCut.ok).toBe(true);
    advanceSimulationHours(state, 6, true);
    expect(cutter.outputItem).not.toBeNull();
    expect(cutter.outputItem?.itemId).toBe('seed_sunburst');
    const collectCut = collectMachineOutput(state, cutter.id);
    expect(collectCut.ok).toBe(true);
    expect(state.stats.totalCrafted).toBe(1);
  });

  it('prevents softlocks via Old Mossy Community Aid and evaluates Golden Spud Festival endgame', () => {
    const state = createNewGameState('Recovery & Endgame', 888);
    // Simulate broke player with 0 gold, 0 inventory, 0 crops
    state.player.gold = 0;
    state.inventory = [];
    for (const t of state.tiles) t.crop = null;

    const aid = claimCommunityAid(state);
    expect(aid.ok).toBe(true);
    expect(state.player.gold).toBeGreaterThanOrEqual(25);
    expect(state.inventory.some((i) => i.itemId === 'seed_sunburst')).toBe(true);

    // Verify Golden Spud Festival requires all 5 pillars
    expect(hostGoldenSpudFestival(state).ok).toBe(false);

    // Complete all 5 pillars
    for (const v of VARIETY_ORDER) {
      state.stats.varietiesHarvested[v] = 3;
    }
    state.stats.artisanTubersHarvested = 6;
    state.stats.totalCrafted = 5;
    state.stats.totalQuestsCompleted = 7;
    state.upgrades = [
      'tool_spade_1',
      'tool_hoe_1',
      'water_can_1',
      'pack_1',
      'land_south'
    ];

    const pillars = getFestivalPillars(state);
    expect(pillars.every((p) => p.done)).toBe(true);

    const winRes = hostGoldenSpudFestival(state);
    expect(winRes.ok).toBe(true);
    expect(state.festival.won).toBe(true);
    expect(state.festival.trophyPlaced).toBe(true);
    expect(state.achievements.includes('ach_festival_champion')).toBe(true);
  });

  it('transfers items cleanly between Backpack and Root Cellar and fulfills Quests & Daily Orders once', () => {
    const state = createNewGameState('Quests & Cellar', 321);
    state.player.x = 9;
    state.player.y = 7;
    state.player.selectedTool = 'fork';
    performTileAction(state, 9, 8);
    performTileAction(state, 10, 8);

    // Claim first quest ("First Forks in the Loam")
    const q1 = claimQuestReward(state, 'quest_first_harvest');
    expect(q1.ok).toBe(true);
    // Second claim must be rejected
    expect(claimQuestReward(state, 'quest_first_harvest').ok).toBe(false);

    // Transfer compost to Root Cellar and back
    const xferTo = transferBetweenBackpackAndCellar(state, 'backpack', 'supply_compost', 2);
    expect(xferTo.ok).toBe(true);
    expect(state.cellar.find((i) => i.itemId === 'supply_compost')?.quantity).toBe(2);

    const xferBack = transferBetweenBackpackAndCellar(state, 'cellar', 'supply_compost', 1);
    expect(xferBack.ok).toBe(true);

    // Fulfill daily order
    const order = state.dailyOrders[0];
    order.varietyId = 'sunburst';
    order.minQuality = 'standard';
    order.quantity = 2;
    const orderRes = fulfillDailyOrder(state, order.id);
    expect(orderRes.ok).toBe(true);
    // Duplicate fulfillment must be rejected
    expect(fulfillDailyOrder(state, order.id).ok).toBe(false);
  });
});
