import {
  ACHIEVEMENTS,
  DAYS_PER_SEASON,
  DAY_END_HOUR,
  DAY_START_HOUR,
  FestivalPillarStatus,
  MACHINE_BLUEPRINTS,
  MACHINE_RECIPES,
  PLOT_INFO,
  POTATO_VARIETIES,
  QUALITY_LABELS,
  QUALITY_MULTIPLIERS,
  QUESTS,
  REAL_SECONDS_PER_GAME_HOUR,
  SEASONS,
  SUPPLIES,
  TOOLS,
  UPGRADES,
  VARIETY_ORDER
} from '../data/content';
import {
  ActionFeedback,
  DailyOrder,
  Direction,
  GameState,
  InventoryItem,
  MachineType,
  PlacedMachine,
  PlotId,
  PotatoVarietyId,
  QualityGrade,
  Season,
  SoilTile,
  ToolId,
  UpgradeId,
  WeatherType
} from '../data/types';
import { SeededRng } from './rng';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  createInitialMapTiles,
  getTileAt,
  isTileWalkable,
  isWaterSourceAdjacent
} from './worldMap';

export const CURRENT_SCHEMA_VERSION = 1;

export function createNewGameState(farmName: string = 'Spudstead Acres', seed: number = 20261013): GameState {
  const rng = new SeededRng(seed);
  const tiles = createInitialMapTiles(rng);

  // Place starter processing stations in the Processing Courtyard
  const starterMachines: PlacedMachine[] = [
    {
      id: 'mach_starter_composter',
      type: 'composter',
      x: 10,
      y: 3,
      activeRecipeId: null,
      progressHours: 0,
      durationHours: 0,
      outputItem: null
    },
    {
      id: 'mach_starter_cutter',
      type: 'seed_cutter',
      x: 12,
      y: 3,
      activeRecipeId: null,
      progressHours: 0,
      durationHours: 0,
      outputItem: null
    },
    {
      id: 'mach_starter_kitchen',
      type: 'kitchen',
      x: 14,
      y: 3,
      activeRecipeId: null,
      progressHours: 0,
      durationHours: 0,
      outputItem: null
    }
  ];

  for (const m of starterMachines) {
    const t = getTileAt(tiles, m.x, m.y);
    if (t) t.machineId = m.id;
  }

  const starterInventory: InventoryItem[] = [
    {
      itemId: 'seed_sunburst',
      name: 'Yukon Sunburst Seed',
      category: 'seed',
      varietyId: 'sunburst',
      quantity: 6,
      unitValue: 10,
      description: POTATO_VARIETIES.sunburst.description
    },
    {
      itemId: 'seed_crimson',
      name: 'Crimson Rose Seed',
      category: 'seed',
      varietyId: 'crimson',
      quantity: 4,
      unitValue: 13,
      description: POTATO_VARIETIES.crimson.description
    },
    {
      itemId: 'supply_compost',
      name: SUPPLIES.supply_compost.name,
      category: 'supply',
      quantity: 3,
      unitValue: SUPPLIES.supply_compost.sellPrice,
      description: SUPPLIES.supply_compost.description
    }
  ];

  const varietiesHarvested: Record<PotatoVarietyId, number> = {
    sunburst: 0,
    crimson: 0,
    russet: 0,
    violet: 0,
    frostbite: 0,
    truffle: 0
  };

  const bestQualityByVariety: Record<PotatoVarietyId, QualityGrade | null> = {
    sunburst: null,
    crimson: null,
    russet: null,
    violet: null,
    frostbite: null,
    truffle: null
  };

  const state: GameState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    saveRevision: 1,
    farmName: farmName.trim() || 'Spudstead Acres',
    createdAt: Date.now(),
    lastSavedAt: Date.now(),
    rngState: rng.getState(),
    calendar: {
      year: 1,
      season: 'spring',
      dayOfSeason: 1,
      totalDays: 1,
      hour: DAY_START_HOUR + 1.5, // 7:30 AM
      weather: 'sunny',
      tomorrowWeather: 'rainy',
      dailyDemandVariety: 'sunburst',
      dailyProcessedBonusId: 'proc_kettle_chips'
    },
    player: {
      x: 8,
      y: 6,
      facing: 'down',
      action: 'idle',
      actionTimer: 0,
      stamina: 100,
      maxStamina: 100,
      water: 12,
      maxWater: 12,
      selectedTool: 'fork',
      selectedItemId: 'seed_sunburst',
      gold: 120,
      backpackCapacity: 12
    },
    tiles,
    unlockedPlots: ['plot_homestead'],
    inventory: starterInventory,
    cellar: [],
    machines: starterMachines,
    upgrades: [],
    completedQuests: [],
    dailyOrders: generateDailyOrders(rng, 'spring', 1),
    achievements: [],
    stats: {
      varietiesHarvested,
      bestQualityByVariety,
      processedCrafted: {},
      totalHarvested: 0,
      totalHilled: 0,
      totalComposted: 0,
      totalCrafted: 0,
      totalQuestsCompleted: 0,
      lifetimeGoldEarned: 0,
      artisanTubersHarvested: 0
    },
    dayStats: {
      day: 1,
      season: 'spring',
      year: 1,
      harvestedCount: 0,
      goldEarned: 0,
      goldSpent: 0,
      questsCompleted: 0,
      cropsPlanted: 0
    },
    festival: {
      won: false,
      wonOnDay: null,
      trophyPlaced: false
    },
    settings: {
      musicVolume: 0.55,
      sfxVolume: 0.75,
      muted: false,
      screenShake: true,
      reducedMotion: false,
      timeSpeed: 1
    },
    tutorialStep: 0
  };

  state.rngState = rng.getState();
  return state;
}

export function generateDailyOrders(
  rng: SeededRng,
  season: Season,
  totalDays: number
): DailyOrder[] {
  const unlockedVarieties = VARIETY_ORDER.filter(
    (v) => POTATO_VARIETIES[v].unlockDay <= Math.max(2, totalDays)
  );
  const seasonalPool = unlockedVarieties.filter((v) =>
    POTATO_VARIETIES[v].preferredSeasons.includes(season)
  );
  const pool = seasonalPool.length > 0 ? seasonalPool : unlockedVarieties;

  const orders: DailyOrder[] = [];
  for (let i = 0; i < 2; i++) {
    const vId = rng.pick(pool);
    const vDef = POTATO_VARIETIES[vId];
    const qty = rng.nextInt(2, 4);
    const minQuality: QualityGrade =
      totalDays >= 6 && i === 1 ? 'prime' : 'standard';
    const mult = QUALITY_MULTIPLIERS[minQuality];
    const rewardGold = Math.round(vDef.baseSellPrice * qty * mult * 1.45 + 15);
    orders.push({
      id: `order_d${totalDays}_${i + 1}`,
      patron: i === 0 ? 'mireille' : 'barnaby',
      title:
        i === 0
          ? `Bistro Order: ${qty}× ${vDef.name}`
          : `Seed Guild Sample: ${qty}× ${vDef.name}`,
      varietyId: vId,
      minQuality,
      quantity: qty,
      rewardGold,
      completed: false
    });
  }
  return orders;
}

export function makeCropItemId(varietyId: PotatoVarietyId, quality: QualityGrade): string {
  return `crop_${varietyId}_${quality}`;
}

export function canFitItemInList(
  list: InventoryItem[],
  capacity: number,
  itemId: string
): boolean {
  const existing = list.find((i) => i.itemId === itemId);
  if (existing) return true;
  return list.length < capacity;
}

export function addItemToList(
  list: InventoryItem[],
  capacity: number,
  item: InventoryItem
): boolean {
  if (item.quantity <= 0) return false;
  const existing = list.find((i) => i.itemId === item.itemId);
  if (existing) {
    existing.quantity += item.quantity;
    return true;
  }
  if (list.length >= capacity) {
    return false;
  }
  list.push({ ...item });
  return true;
}

export function removeItemFromList(
  list: InventoryItem[],
  itemId: string,
  quantity: number
): boolean {
  if (quantity <= 0) return false;
  const idx = list.findIndex((i) => i.itemId === itemId);
  if (idx === -1) return false;
  if (list[idx].quantity < quantity) return false;
  list[idx].quantity -= quantity;
  if (list[idx].quantity <= 0) {
    list.splice(idx, 1);
  }
  return true;
}

export function computeCropStage(growthPct: number): 0 | 1 | 2 | 3 | 4 {
  if (growthPct >= 100) return 4;
  if (growthPct >= 72) return 3;
  if (growthPct >= 45) return 2;
  if (growthPct >= 20) return 1;
  return 0;
}

export function hasUpgrade(state: GameState, id: UpgradeId): boolean {
  return state.upgrades.includes(id);
}

/**
 * Advances the simulation by `dtHours` (in-game hours).
 * Used both by real-time frame ticks and overnight sleep!
 */
export function advanceSimulationHours(
  state: GameState,
  dtHours: number,
  allowOvernightWrap: boolean = false
): { dayEnded: boolean } {
  if (dtHours <= 0) return { dayEnded: false };

  const prevHour = state.calendar.hour;
  state.calendar.hour += dtHours;

  // Trigger midday sprinklers if crossing 13:00
  if (prevHour < 13 && state.calendar.hour >= 13) {
    runPlacedSprinklers(state);
  }

  // Advance crops and soil
  const weather = state.calendar.weather;
  const season = state.calendar.season;

  for (const tile of state.tiles) {
    if (tile.terrain !== 'farm_soil') continue;
    if (tile.plotId && !state.unlockedPlots.includes(tile.plotId)) continue;

    const inGreenhouse = tile.plotId === 'plot_greenhouse';

    // Weather moisture changes
    if (!inGreenhouse && (weather === 'rainy' || weather === 'stormy')) {
      tile.moisture = Math.min(100, tile.moisture + dtHours * (weather === 'stormy' ? 9.5 : 7.0));
    } else if (!inGreenhouse && weather === 'frosty') {
      tile.moisture = Math.max(15, tile.moisture - dtHours * 1.1);
    } else {
      const drainRate = inGreenhouse ? 1.4 : weather === 'breezy' ? 2.8 : 2.1;
      if (tile.tilled || tile.crop) {
        tile.moisture = Math.max(0, tile.moisture - dtHours * drainRate);
      }
    }

    if (tile.crop) {
      const crop = tile.crop;
      const vDef = POTATO_VARIETIES[crop.varietyId];

      // Weeds & Pests drain moisture and add stress
      if (crop.hasWeeds) {
        tile.moisture = Math.max(0, tile.moisture - dtHours * 1.2);
        crop.stressScore += dtHours * 0.9;
      }
      if (crop.hasPests) {
        crop.stressScore += dtHours * 1.3;
      }

      if (crop.growthPct < 100) {
        // Calculate growth multiplier
        let speedMult = 1.0;

        // Season suitability
        if (inGreenhouse) {
          speedMult *= 1.2;
          crop.careScore += dtHours * 0.8;
        } else if (vDef.preferredSeasons.includes(season)) {
          speedMult *= 1.15;
          crop.careScore += dtHours * 0.6;
        } else if (season === 'winter' && !vDef.frostTolerant) {
          speedMult *= 0.25;
          crop.stressScore += dtHours * 1.2;
        } else {
          speedMult *= 0.8;
        }

        // Frost bonus for Glacier Finger
        if (vDef.frostTolerant && (season === 'winter' || weather === 'frosty')) {
          speedMult *= 1.25;
          crop.careScore += dtHours * 1.4;
        }

        // South Sun-Terrace bonus in Spring/Summer
        if (tile.plotId === 'plot_south' && (season === 'spring' || season === 'summer')) {
          speedMult *= 1.12;
        }

        // Moisture band check
        const [optMin, optMax] = vDef.optimalMoisture;
        if (tile.moisture >= optMin && tile.moisture <= optMax) {
          speedMult *= 1.18;
          crop.careScore += dtHours * 1.65;
        } else if (tile.moisture < 12) {
          speedMult *= 0.3;
          crop.stressScore += dtHours * 2.0;
        } else if (tile.moisture < optMin) {
          speedMult *= 0.72;
          crop.stressScore += dtHours * 0.5;
        } else if (tile.moisture > optMax + 15) {
          // Hilling improves ridge drainage!
          if (crop.hillLevel === 0) {
            speedMult *= 0.82;
            crop.stressScore += dtHours * 0.8;
          } else {
            crop.careScore += dtHours * 0.5;
          }
        }

        // Fertility bonus
        const fertMult = 0.85 + (tile.fertility / 100) * 0.4;
        speedMult *= fertMult;
        if (tile.fertility >= 60) {
          crop.careScore += dtHours * ((tile.fertility - 45) / 55) * 1.3;
        }

        const basePctPerHour = 100 / vDef.growthHours;
        crop.growthPct = Math.min(100, crop.growthPct + basePctPerHour * speedMult * dtHours);
        crop.hoursGrown += dtHours;
        crop.stage = computeCropStage(crop.growthPct);
      }
    }
  }

  // Advance processing machines
  const speedBonus = hasUpgrade(state, 'processing_mastery') ? 1.35 : 1.0;
  for (const m of state.machines) {
    if (m.activeRecipeId && !m.outputItem) {
      m.progressHours += dtHours * speedBonus;
      if (m.progressHours >= m.durationHours) {
        const recipe = MACHINE_RECIPES.find((r) => r.id === m.activeRecipeId);
        if (recipe) {
          let qty = recipe.outputQuantity;
          if (m.type === 'seed_cutter' && hasUpgrade(state, 'processing_mastery')) {
            qty += 1; // 3 seeds per potato!
          }
          m.outputItem = {
            itemId: recipe.outputItemId,
            name: recipe.outputName,
            category: recipe.outputCategory,
            varietyId: recipe.inputVarietyId,
            quantity: qty,
            unitValue: recipe.outputBaseValue,
            description: recipe.description
          };
        }
        m.activeRecipeId = null;
        m.progressHours = 0;
        m.durationHours = 0;
      }
    }
  }

  if (!allowOvernightWrap && state.calendar.hour >= DAY_END_HOUR) {
    state.calendar.hour = DAY_END_HOUR;
    return { dayEnded: true };
  }

  return { dayEnded: false };
}

export function tickSimulation(state: GameState, dtSeconds: number): { dayEnded: boolean } {
  // Decay player action animation timer even when time is paused
  if (state.player.actionTimer > 0) {
    state.player.actionTimer = Math.max(0, state.player.actionTimer - dtSeconds);
    if (state.player.actionTimer === 0) {
      state.player.action = 'idle';
    }
  }

  if (state.settings.timeSpeed === 0 || dtSeconds <= 0) {
    return { dayEnded: false };
  }

  const dtHours = (dtSeconds * state.settings.timeSpeed) / REAL_SECONDS_PER_GAME_HOUR;
  return advanceSimulationHours(state, dtHours, false);
}

export function runPlacedSprinklers(state: GameState): number {
  let wateredTiles = 0;
  const radius = hasUpgrade(state, 'irrigation_2') ? 2 : 1;
  const careBonus = hasUpgrade(state, 'irrigation_1') ? 6 : 2;
  const targetMoisture = hasUpgrade(state, 'irrigation_1') ? 85 : 78;

  for (const m of state.machines) {
    if (m.type !== 'sprinkler') continue;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tile = getTileAt(state.tiles, m.x + dx, m.y + dy);
        if (!tile || tile.terrain !== 'farm_soil') continue;
        if (tile.plotId && !state.unlockedPlots.includes(tile.plotId)) continue;
        tile.moisture = Math.max(tile.moisture, targetMoisture);
        if (tile.crop) {
          tile.crop.wateredToday = true;
          tile.crop.careScore += careBonus;
        }
        wateredTiles++;
      }
    }
  }
  return wateredTiles;
}

export function pickWeatherForSeason(rng: SeededRng, season: Season): WeatherType {
  const r = rng.next();
  if (season === 'spring') {
    if (r < 0.45) return 'sunny';
    if (r < 0.75) return 'rainy';
    if (r < 0.92) return 'breezy';
    return 'stormy';
  }
  if (season === 'summer') {
    if (r < 0.58) return 'sunny';
    if (r < 0.80) return 'breezy';
    if (r < 0.94) return 'rainy';
    return 'stormy';
  }
  if (season === 'autumn') {
    if (r < 0.35) return 'sunny';
    if (r < 0.62) return 'breezy';
    if (r < 0.85) return 'rainy';
    return 'frosty';
  }
  // winter
  if (r < 0.55) return 'frosty';
  if (r < 0.85) return 'breezy';
  return 'sunny';
}

export function sleepToNextDay(state: GameState): void {
  const rng = new SeededRng(state.rngState);

  // Simulate remaining hours from current hour until next morning 06:00
  const remainingToday = Math.max(0, DAY_END_HOUR - state.calendar.hour);
  const overnightHours = remainingToday + 8; // 22:00 -> 06:00 is 8 hours
  advanceSimulationHours(state, overnightHours, true);

  // Advance calendar day & season
  state.calendar.totalDays += 1;
  state.calendar.dayOfSeason += 1;
  if (state.calendar.dayOfSeason > DAYS_PER_SEASON) {
    state.calendar.dayOfSeason = 1;
    const sIdx = SEASONS.indexOf(state.calendar.season);
    const nextIdx = (sIdx + 1) % SEASONS.length;
    state.calendar.season = SEASONS[nextIdx];
    if (nextIdx === 0) {
      state.calendar.year += 1;
    }
  }

  state.calendar.hour = DAY_START_HOUR;
  state.calendar.weather = state.calendar.tomorrowWeather;
  state.calendar.tomorrowWeather = pickWeatherForSeason(rng, state.calendar.season);

  // Rotate daily market demand
  const unlockedVarieties = VARIETY_ORDER.filter(
    (v) => POTATO_VARIETIES[v].unlockDay <= state.calendar.totalDays
  );
  state.calendar.dailyDemandVariety = rng.pick(
    unlockedVarieties.length > 0 ? unlockedVarieties : ['sunburst']
  );
  const dishIds = [
    'proc_kettle_chips',
    'proc_rose_gratin',
    'proc_hearth_chowder',
    'proc_truffle_galette'
  ];
  state.calendar.dailyProcessedBonusId = rng.pick(dishIds);

  // Restore player stamina
  state.player.stamina = state.player.maxStamina;

  // Morning sprinkler pass
  runPlacedSprinklers(state);

  // Rainy morning hydration
  if (state.calendar.weather === 'rainy' || state.calendar.weather === 'stormy') {
    for (const tile of state.tiles) {
      if (tile.terrain === 'farm_soil' && tile.plotId !== 'plot_greenhouse') {
        tile.moisture = Math.max(tile.moisture, 80);
        if (tile.crop) tile.crop.wateredToday = true;
      }
    }
  }

  // Morning weed/pest checks and Grove foraging respawn
  for (const tile of state.tiles) {
    if (tile.crop && tile.crop.growthPct < 100) {
      tile.crop.wateredToday =
        state.calendar.weather === 'rainy' || state.calendar.weather === 'stormy';
      // Occasional weed or beetle spawn on un-hilled or low-care plants
      const weedChance = tile.crop.hillLevel >= 2 ? 0.03 : 0.08;
      if (!tile.crop.hasWeeds && rng.next() < weedChance) {
        tile.crop.hasWeeds = true;
      } else if (
        !tile.crop.hasPests &&
        tile.crop.stage >= 2 &&
        state.calendar.season !== 'winter' &&
        rng.next() < 0.06
      ) {
        tile.crop.hasPests = true;
      }
    } else if (tile.terrain === 'forage_ground' && tile.debris === 'none') {
      const r = rng.next();
      if (r < 0.45) tile.debris = 'weeds';
      else if (r < 0.60) tile.debris = 'wild_sprout';
      else if (r < 0.72) tile.debris = 'rock';
    }
  }

  // Refresh Daily Orders
  state.dailyOrders = generateDailyOrders(
    rng,
    state.calendar.season,
    state.calendar.totalDays
  );

  // Reset daily summary stats
  state.dayStats = {
    day: state.calendar.dayOfSeason,
    season: state.calendar.season,
    year: state.calendar.year,
    harvestedCount: 0,
    goldEarned: 0,
    goldSpent: 0,
    questsCompleted: 0,
    cropsPlanted: 0
  };

  state.rngState = rng.getState();
  evaluateAchievements(state);
}

export function getTargetCoordsForTool(
  state: GameState,
  targetX: number,
  targetY: number,
  tool: ToolId
): { x: number; y: number }[] {
  const dx = Math.sign(targetX - state.player.x) || (state.player.facing === 'right' ? 1 : state.player.facing === 'left' ? -1 : 0);
  const dy = Math.sign(targetY - state.player.y) || (state.player.facing === 'down' ? 1 : state.player.facing === 'up' ? -1 : 0);

  if (tool === 'watering_can') {
    if (hasUpgrade(state, 'water_can_2')) {
      const coords: { x: number; y: number }[] = [];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          coords.push({ x: targetX + ox, y: targetY + oy });
        }
      }
      return coords;
    }
    if (hasUpgrade(state, 'water_can_1')) {
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
        return [
          { x: targetX, y: targetY },
          { x: targetX + dx, y: targetY },
          { x: targetX + dx * 2, y: targetY }
        ];
      }
      const stepY = dy !== 0 ? dy : 1;
      return [
        { x: targetX, y: targetY },
        { x: targetX, y: targetY + stepY },
        { x: targetX, y: targetY + stepY * 2 }
      ];
    }
  }

  return [{ x: targetX, y: targetY }];
}

/**
 * Executes the currently selected tool on target tile `(tx, ty)`.
 * Enforces range, stamina, water, tool suitability, and inventory capacity.
 */
export function performTileAction(
  state: GameState,
  tx: number,
  ty: number
): ActionFeedback {
  const tile = getTileAt(state.tiles, tx, ty);
  if (!tile) {
    return {
      ok: false,
      reason: 'invalid_tile',
      message: 'Choose a valid tile on the farm.',
      kind: 'warning'
    };
  }

  // Face toward target tile
  const dx = tx - state.player.x;
  const dy = ty - state.player.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    state.player.facing = dx > 0 ? 'right' : 'left';
  } else if (dy !== 0) {
    state.player.facing = dy > 0 ? 'down' : 'up';
  }

  // Check distance (must be within 2.5 tiles of player)
  const dist = Math.hypot(dx, dy);
  if (dist > 2.65) {
    return {
      ok: false,
      reason: 'out_of_range',
      message: 'Move closer to that tile first (within 2 tiles).',
      kind: 'warning',
      worldX: tx,
      worldY: ty
    };
  }

  const tool = state.player.selectedTool;

  // Special case: clicking water or the stone well refills the watering can regardless or when using watering can
  if (
    tile.terrain === 'water' ||
    (tx === 5 && ty === 9) ||
    (tool === 'watering_can' && isWaterSourceAdjacent(tx, ty, state.tiles) && tile.terrain !== 'farm_soil')
  ) {
    state.player.water = state.player.maxWater;
    state.player.action = 'water';
    state.player.actionTimer = 0.35;
    return {
      ok: true,
      message: `Refilled Watering Can (${state.player.water}/${state.player.maxWater})!`,
      kind: 'success',
      worldX: tx,
      worldY: ty,
      sfx: 'water'
    };
  }

  // Check locked plot
  if (tile.plotId && !state.unlockedPlots.includes(tile.plotId)) {
    const pInfo = PLOT_INFO[tile.plotId];
    return {
      ok: false,
      reason: 'locked_plot',
      message: `${pInfo.name} is locked! Purchase the ${pInfo.name} Deed in Barnaby's Shop (${pInfo.badge}).`,
      kind: 'warning',
      worldX: tx,
      worldY: ty
    };
  }

  const rng = new SeededRng(state.rngState);

  // 1. SPADE: Clear debris (weeds/rocks/wild_sprouts) OR till farm soil
  if (tool === 'spade') {
    const staminaCost = Math.max(
      1,
      TOOLS.spade.staminaCost - (hasUpgrade(state, 'tool_spade_1') ? 1 : 0)
    );
    if (state.player.stamina < staminaCost) {
      return {
        ok: false,
        reason: 'no_stamina',
        message: 'Too exhausted! Sleep at the Farmhouse to restore stamina.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    if (tile.debris !== 'none') {
      const dType = tile.debris;
      if (dType === 'wild_sprout') {
        if (!canFitItemInList(state.inventory, state.player.backpackCapacity, 'seed_sunburst')) {
          return {
            ok: false,
            reason: 'inventory_full',
            message: 'Backpack is full! Store or sell items before foraging wild sprouts.',
            kind: 'warning',
            worldX: tx,
            worldY: ty
          };
        }
        addItemToList(state.inventory, state.player.backpackCapacity, {
          itemId: 'seed_sunburst',
          name: 'Yukon Sunburst Seed',
          category: 'seed',
          varietyId: 'sunburst',
          quantity: 1,
          unitValue: 10,
          description: POTATO_VARIETIES.sunburst.description
        });
        tile.debris = 'none';
        state.player.stamina -= staminaCost;
        state.player.action = 'clear';
        state.player.actionTimer = 0.32;
        return {
          ok: true,
          message: 'Dug up a Wild Yukon Sunburst Seed Eye!',
          kind: 'success',
          worldX: tx,
          worldY: ty,
          sfx: 'dig'
        };
      }

      if (dType === 'weeds') {
        addItemToList(state.inventory, state.player.backpackCapacity, {
          itemId: 'supply_mulch',
          name: SUPPLIES.supply_mulch.name,
          category: 'supply',
          quantity: 1,
          unitValue: SUPPLIES.supply_mulch.sellPrice,
          description: SUPPLIES.supply_mulch.description
        });
      }
      tile.debris = 'none';
      if (tile.terrain === 'farm_soil') {
        tile.tilled = true;
      }
      state.player.stamina -= staminaCost;
      state.player.action = 'till';
      state.player.actionTimer = 0.32;
      return {
        ok: true,
        message:
          dType === 'weeds'
            ? 'Cleared weeds (+1 Field Clippings) and prepared soil!'
            : 'Cracked field stone and cleared the plot!',
        kind: 'success',
        worldX: tx,
        worldY: ty,
        sfx: 'dig'
      };
    }

    if (tile.terrain !== 'farm_soil') {
      return {
        ok: false,
        reason: 'wrong_terrain',
        message: 'Only farm plot tiles or overgrown debris can be dug with the Spade.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    if (tile.machineId) {
      return {
        ok: false,
        reason: 'occupied_tile',
        message: 'There is a machine placed on this tile.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    if (tile.crop) {
      return {
        ok: false,
        reason: 'occupied_tile',
        message:
          tile.crop.stage === 4
            ? 'Switch to the Harvest Fork (Key 4) to harvest this mature ridge!'
            : 'A potato crop is already growing here! Use Hilling Hoe (2) or Watering Can (3).',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    if (tile.tilled) {
      return {
        ok: false,
        reason: 'already_tilled',
        message: 'Soil is already tilled! Switch to Seed Pouch (Key 5) to plant.',
        kind: 'info',
        worldX: tx,
        worldY: ty
      };
    }

    tile.tilled = true;
    state.player.stamina -= staminaCost;
    state.player.action = 'till';
    state.player.actionTimer = 0.32;
    if (state.tutorialStep === 1) state.tutorialStep = 2;
    return {
      ok: true,
      message: 'Tilled fresh potato furrow!',
      kind: 'success',
      worldX: tx,
      worldY: ty,
      sfx: 'dig'
    };
  }

  // 2. HILLING HOE: Hill growing potato ridges (up to 2x) OR clear crop weeds/pests
  if (tool === 'hoe') {
    if (tile.debris === 'weeds') {
      // Allow hoe to clear surface weeds too
      tile.debris = 'none';
      addItemToList(state.inventory, state.player.backpackCapacity, {
        itemId: 'supply_mulch',
        name: SUPPLIES.supply_mulch.name,
        category: 'supply',
        quantity: 1,
        unitValue: SUPPLIES.supply_mulch.sellPrice,
        description: SUPPLIES.supply_mulch.description
      });
      state.player.action = 'hill';
      state.player.actionTimer = 0.3;
      return {
        ok: true,
        message: 'Cleared weeds (+1 Field Clippings)!',
        kind: 'success',
        worldX: tx,
        worldY: ty,
        sfx: 'hill'
      };
    }

    if (!tile.crop) {
      return {
        ok: false,
        reason: 'no_crop',
        message: 'Use the Hilling Hoe on planted potato ridges to earth up stems or remove weeds/beetles.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    const crop = tile.crop;
    if (crop.hasWeeds || crop.hasPests) {
      const hadWeeds = crop.hasWeeds;
      crop.hasWeeds = false;
      crop.hasPests = false;
      crop.careScore += 8;
      if (hadWeeds) {
        addItemToList(state.inventory, state.player.backpackCapacity, {
          itemId: 'supply_mulch',
          name: SUPPLIES.supply_mulch.name,
          category: 'supply',
          quantity: 1,
          unitValue: SUPPLIES.supply_mulch.sellPrice,
          description: SUPPLIES.supply_mulch.description
        });
      }
      state.player.stamina = Math.max(0, state.player.stamina - 1);
      state.player.action = 'hill';
      state.player.actionTimer = 0.3;
      return {
        ok: true,
        message: 'Cleared weeds and beetles from the potato ridge (+8 Care)!',
        kind: 'success',
        worldX: tx,
        worldY: ty,
        sfx: 'hill'
      };
    }

    if (crop.hillLevel >= 2) {
      return {
        ok: false,
        reason: 'already_hilled',
        message: 'This potato ridge is already fully double-hilled (Max Hill 2/2)!',
        kind: 'info',
        worldX: tx,
        worldY: ty
      };
    }

    if (state.player.stamina < TOOLS.hoe.staminaCost) {
      return {
        ok: false,
        reason: 'no_stamina',
        message: 'Insufficient stamina to hill the ridge! Rest at the Farmhouse.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    const upgradedHoe = hasUpgrade(state, 'tool_hoe_1');
    crop.hillLevel = upgradedHoe ? 2 : Math.min(2, crop.hillLevel + 1);
    crop.careScore += upgradedHoe ? 28 : 18;
    state.player.stamina -= TOOLS.hoe.staminaCost;
    state.player.action = 'hill';
    state.player.actionTimer = 0.34;
    state.stats.totalHilled += 1;
    evaluateAchievements(state);

    return {
      ok: true,
      message: `Earthed up potato ridge (Hill ${crop.hillLevel}/2)! Tubers protected & yield boosted.`,
      kind: 'success',
      worldX: tx,
      worldY: ty,
      sfx: 'hill'
    };
  }

  // 3. WATERING CAN: Hydrate 1, 3, or 3x3 tiles
  if (tool === 'watering_can') {
    if (state.player.water <= 0) {
      return {
        ok: false,
        reason: 'no_water',
        message: 'Watering Can is empty! Refill at the Stone Well or Pond on the left.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }
    if (state.player.stamina < TOOLS.watering_can.staminaCost) {
      return {
        ok: false,
        reason: 'no_stamina',
        message: 'Insufficient stamina to water! Rest at the Farmhouse.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    const coords = getTargetCoordsForTool(state, tx, ty, 'watering_can');
    let wateredCount = 0;
    for (const c of coords) {
      const t = getTileAt(state.tiles, c.x, c.y);
      if (!t || t.terrain !== 'farm_soil') continue;
      if (t.plotId && !state.unlockedPlots.includes(t.plotId)) continue;
      t.moisture = Math.min(100, t.moisture + 48);
      if (t.crop) {
        t.crop.wateredToday = true;
        t.crop.careScore += 6;
      }
      wateredCount++;
    }

    if (wateredCount === 0) {
      return {
        ok: false,
        reason: 'wrong_terrain',
        message: 'Aim the Watering Can at farm soil tiles (or click the Pond/Well to refill).',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    state.player.water = Math.max(0, state.player.water - 1);
    state.player.stamina -= TOOLS.watering_can.staminaCost;
    state.player.action = 'water';
    state.player.actionTimer = 0.35;
    if (state.tutorialStep === 3) state.tutorialStep = 4;

    return {
      ok: true,
      message:
        wateredCount > 1
          ? `Watered ${wateredCount} ridges (${state.player.water}/${state.player.maxWater} water left)!`
          : `Watered soil to ${Math.round(tile.moisture)}% moisture!`,
      kind: 'success',
      worldX: tx,
      worldY: ty,
      sfx: 'water'
    };
  }

  // 4. HARVEST FORK: Harvest Stage 4 mature potato ridges
  if (tool === 'fork') {
    if (!tile.crop) {
      return {
        ok: false,
        reason: 'no_crop',
        message: 'Nothing growing on this tile to harvest.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    const crop = tile.crop;
    const vDef = POTATO_VARIETIES[crop.varietyId];
    if (crop.stage < 4 || crop.growthPct < 100) {
      const remainingPct = Math.ceil(100 - crop.growthPct);
      return {
        ok: false,
        reason: 'not_mature',
        message: `${vDef.name} is still growing (${Math.floor(crop.growthPct)}% mature — ${remainingPct}% left). Keep it watered and hilled!`,
        kind: 'info',
        worldX: tx,
        worldY: ty
      };
    }

    if (state.player.stamina < TOOLS.fork.staminaCost) {
      return {
        ok: false,
        reason: 'no_stamina',
        message: 'Insufficient stamina to lift the ridge! Rest at the Farmhouse.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    // Calculate quality grade from careScore, hillLevel, fertility, and fork upgrade
    const forkBonus = hasUpgrade(state, 'tool_fork_1') ? 12 : 0;
    const finalScore =
      crop.careScore -
      crop.stressScore * 0.7 +
      crop.hillLevel * 15 +
      tile.fertility * 0.25 +
      forkBonus;

    let quality: QualityGrade = 'standard';
    if (finalScore >= 76 && crop.hillLevel >= 1) {
      quality = 'artisan';
    } else if (finalScore >= 46) {
      quality = 'prime';
    }

    // Calculate yield
    let yieldCount = rng.nextInt(vDef.yieldMin, vDef.yieldMax);
    if (crop.hillLevel >= 1) yieldCount += 1;
    if (crop.hillLevel >= 2 && tile.fertility >= 65) yieldCount += 1;
    if (hasUpgrade(state, 'tool_fork_1') && crop.hillLevel >= 1) yieldCount += 1;
    if (crop.stressScore > 35) yieldCount = Math.max(1, yieldCount - 1);

    const itemId = makeCropItemId(crop.varietyId, quality);
    if (!canFitItemInList(state.inventory, state.player.backpackCapacity, itemId)) {
      return {
        ok: false,
        reason: 'inventory_full',
        message:
          'Backpack is full! Sell harvest at the Market Stall or store items in the Root Cellar first.',
        kind: 'error',
        worldX: tx,
        worldY: ty
      };
    }

    const unitValue = Math.round(vDef.baseSellPrice * QUALITY_MULTIPLIERS[quality]);
    addItemToList(state.inventory, state.player.backpackCapacity, {
      itemId,
      name: `${vDef.name} (${QUALITY_LABELS[quality]})`,
      category: 'crop',
      varietyId: crop.varietyId,
      quality,
      quantity: yieldCount,
      unitValue,
      description: `${QUALITY_LABELS[quality]} grade ${vDef.name}. Sell at the Market Stall, cut into seeds, or cook in the Artisan Kitchen.`
    });

    // Clear crop & update soil fertility
    tile.crop = null;
    tile.fertility = Math.max(20, tile.fertility - 12);
    state.player.stamina -= TOOLS.fork.staminaCost;
    state.player.action = 'harvest';
    state.player.actionTimer = 0.4;

    // Update collection & daily stats
    state.stats.totalHarvested += yieldCount;
    state.stats.varietiesHarvested[crop.varietyId] += yieldCount;
    state.dayStats.harvestedCount += yieldCount;
    if (quality === 'artisan') {
      state.stats.artisanTubersHarvested += yieldCount;
    }
    const prevBest = state.stats.bestQualityByVariety[crop.varietyId];
    const rank: Record<QualityGrade, number> = { standard: 1, prime: 2, artisan: 3 };
    if (!prevBest || rank[quality] > rank[prevBest]) {
      state.stats.bestQualityByVariety[crop.varietyId] = quality;
    }

    if (state.tutorialStep === 0) state.tutorialStep = 1;
    state.rngState = rng.getState();
    evaluateAchievements(state);

    return {
      ok: true,
      message: `Harvested ${yieldCount}× ${vDef.name} (${QUALITY_LABELS[quality]})!`,
      kind: 'success',
      worldX: tx,
      worldY: ty,
      sfx: 'harvest'
    };
  }

  // 5. SEED & COMPOST POUCH: Plant selected seed potato OR apply selected compost/fertilizer
  if (tool === 'pouch') {
    if (tile.terrain !== 'farm_soil') {
      return {
        ok: false,
        reason: 'wrong_terrain',
        message: 'Select a tilled farm soil tile to plant seeds or apply compost.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    if (tile.debris !== 'none') {
      return {
        ok: false,
        reason: 'debris_present',
        message: 'Clear weeds or rocks with the Spade (Key 1) before planting!',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    const selectedItem = state.inventory.find(
      (i) => i.itemId === state.player.selectedItemId && i.quantity > 0
    );
    if (!selectedItem) {
      // Auto-select first seed or supply if available
      const fallback = state.inventory.find(
        (i) => (i.category === 'seed' || i.category === 'supply') && i.quantity > 0
      );
      if (!fallback) {
        return {
          ok: false,
          reason: 'no_seeds',
          message: "No seeds or compost in your Pouch! Buy seeds at Barnaby's Shop or visit Old Mossy.",
          kind: 'warning',
          worldX: tx,
          worldY: ty
        };
      }
      state.player.selectedItemId = fallback.itemId;
      return performTileAction(state, tx, ty);
    }

    if (state.player.stamina < TOOLS.pouch.staminaCost) {
      return {
        ok: false,
        reason: 'no_stamina',
        message: 'Insufficient stamina! Rest at the Farmhouse.',
        kind: 'warning',
        worldX: tx,
        worldY: ty
      };
    }

    // Applying Compost / Fertilizer / Mulch
    if (selectedItem.category === 'supply') {
      const sDef = SUPPLIES[selectedItem.itemId];
      if (!sDef) {
        return {
          ok: false,
          reason: 'invalid_item',
          message: 'Select a valid seed or soil amendment.',
          kind: 'warning'
        };
      }
      if (!tile.tilled && !tile.crop) {
        tile.tilled = true;
      }
      tile.fertility = Math.min(100, tile.fertility + sDef.fertilityBoost);
      tile.moisture = Math.min(100, tile.moisture + sDef.moistureBoost);
      if (tile.crop) {
        tile.crop.careScore += sDef.careBoost;
      }
      removeItemFromList(state.inventory, selectedItem.itemId, 1);
      state.player.stamina -= TOOLS.pouch.staminaCost;
      state.player.action = 'plant';
      state.player.actionTimer = 0.3;
      state.stats.totalComposted += 1;

      return {
        ok: true,
        message: `Applied ${sDef.name}! Soil fertility is now ${Math.round(tile.fertility)}%.`,
        kind: 'success',
        worldX: tx,
        worldY: ty,
        sfx: 'plant'
      };
    }

    // Planting a Seed Potato
    if (selectedItem.category === 'seed' && selectedItem.varietyId) {
      if (!tile.tilled) {
        return {
          ok: false,
          reason: 'not_tilled',
          message: 'Till this soil first using the Homestead Spade (Key 1)!',
          kind: 'warning',
          worldX: tx,
          worldY: ty
        };
      }
      if (tile.crop) {
        return {
          ok: false,
          reason: 'occupied_tile',
          message: 'A potato plant is already growing in this furrow!',
          kind: 'warning',
          worldX: tx,
          worldY: ty
        };
      }

      const vDef = POTATO_VARIETIES[selectedItem.varietyId];
      tile.crop = {
        varietyId: vDef.id,
        growthPct: 0,
        stage: 0,
        hillLevel: 0,
        careScore: tile.fertility >= 65 ? 12 : 6,
        stressScore: 0,
        hasWeeds: false,
        hasPests: false,
        hoursGrown: 0,
        wateredToday: tile.moisture >= 55
      };

      removeItemFromList(state.inventory, selectedItem.itemId, 1);
      state.player.stamina -= TOOLS.pouch.staminaCost;
      state.player.action = 'plant';
      state.player.actionTimer = 0.3;
      state.dayStats.cropsPlanted += 1;
      if (state.tutorialStep <= 2) state.tutorialStep = 3;

      return {
        ok: true,
        message: `Planted ${vDef.name} Seed! Keep moisture at ${vDef.optimalMoisture[0]}–${vDef.optimalMoisture[1]}% and hill as it grows.`,
        kind: 'success',
        worldX: tx,
        worldY: ty,
        sfx: 'plant'
      };
    }
  }

  return {
    ok: false,
    reason: 'invalid_action',
    message: 'Cannot use that tool here.',
    kind: 'warning'
  };
}

/**
 * Purchases seeds or supplies from Barnaby's Shop.
 */
export function buyShopItem(
  state: GameState,
  itemId: string,
  quantity: number
): ActionFeedback {
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: 'invalid_quantity', message: 'Select a valid positive quantity.', kind: 'warning' };
  }

  let unitCost = 0;
  let itemTemplate: InventoryItem | null = null;

  if (itemId.startsWith('seed_')) {
    const vId = itemId.replace('seed_', '') as PotatoVarietyId;
    const vDef = POTATO_VARIETIES[vId];
    if (!vDef) {
      return { ok: false, reason: 'unknown_item', message: 'Unknown seed variety.', kind: 'error' };
    }
    unitCost = vDef.seedCost;
    itemTemplate = {
      itemId,
      name: `${vDef.name} Seed`,
      category: 'seed',
      varietyId: vId,
      quantity: qty,
      unitValue: Math.floor(vDef.seedCost * 0.5),
      description: vDef.description
    };
  } else if (SUPPLIES[itemId]) {
    const sDef = SUPPLIES[itemId];
    unitCost = sDef.buyPrice;
    itemTemplate = {
      itemId,
      name: sDef.name,
      category: 'supply',
      quantity: qty,
      unitValue: sDef.sellPrice,
      description: sDef.description
    };
  }

  if (!itemTemplate) {
    return { ok: false, reason: 'unknown_item', message: 'Item not available in shop.', kind: 'error' };
  }

  const totalCost = unitCost * qty;
  if (state.player.gold < totalCost) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      message: `Need ${totalCost}g (you have ${state.player.gold}g). Sell harvests or complete orders!`,
      kind: 'warning'
    };
  }

  if (!canFitItemInList(state.inventory, state.player.backpackCapacity, itemId)) {
    return {
      ok: false,
      reason: 'inventory_full',
      message: 'Backpack is full! Store items in the Root Cellar or upgrade your Field Pack.',
      kind: 'error'
    };
  }

  state.player.gold -= totalCost;
  state.dayStats.goldSpent += totalCost;
  addItemToList(state.inventory, state.player.backpackCapacity, itemTemplate);
  if (itemTemplate.category === 'seed') {
    state.player.selectedItemId = itemId;
  }

  return {
    ok: true,
    message: `Purchased ${qty}× ${itemTemplate.name} for ${totalCost}g!`,
    kind: 'success',
    sfx: 'coin'
  };
}

export function getEffectiveSellPrice(state: GameState, item: InventoryItem): number {
  let price = item.unitValue;
  if (item.category === 'crop' && item.varietyId === state.calendar.dailyDemandVariety) {
    price = Math.round(price * 1.25);
  }
  if (item.category === 'processed') {
    if (hasUpgrade(state, 'processing_mastery')) {
      price = Math.round(price * 1.2);
    }
    if (item.itemId === state.calendar.dailyProcessedBonusId) {
      price = Math.round(price * 1.2);
    }
  }
  return Math.max(1, price);
}

export function sellInventoryItem(
  state: GameState,
  itemId: string,
  quantity: number
): ActionFeedback {
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: 'invalid_quantity', message: 'Select a positive quantity to sell.', kind: 'warning' };
  }

  const existing = state.inventory.find((i) => i.itemId === itemId);
  if (!existing || existing.quantity < qty) {
    return { ok: false, reason: 'insufficient_items', message: 'Not enough items in backpack to sell.', kind: 'warning' };
  }

  const unitPrice = getEffectiveSellPrice(state, existing);
  const totalEarned = unitPrice * qty;
  const itemName = existing.name;

  removeItemFromList(state.inventory, itemId, qty);
  state.player.gold += totalEarned;
  state.dayStats.goldEarned += totalEarned;
  state.stats.lifetimeGoldEarned += totalEarned;
  evaluateAchievements(state);

  return {
    ok: true,
    message: `Sold ${qty}× ${itemName} for ${totalEarned}g!`,
    kind: 'success',
    sfx: 'coin'
  };
}

export function buyUpgrade(state: GameState, upgradeId: UpgradeId): ActionFeedback {
  const uDef = UPGRADES.find((u) => u.id === upgradeId);
  if (!uDef) {
    return { ok: false, reason: 'unknown_upgrade', message: 'Unknown upgrade.', kind: 'error' };
  }
  if (state.upgrades.includes(upgradeId)) {
    return { ok: false, reason: 'already_owned', message: 'You already own this upgrade.', kind: 'info' };
  }
  if (uDef.prerequisite && !state.upgrades.includes(uDef.prerequisite)) {
    const pre = UPGRADES.find((u) => u.id === uDef.prerequisite);
    return {
      ok: false,
      reason: 'missing_prerequisite',
      message: `Requires ${pre ? pre.name : uDef.prerequisite} first!`,
      kind: 'warning'
    };
  }
  if (state.player.gold < uDef.cost) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      message: `Need ${uDef.cost}g to purchase ${uDef.name} (you have ${state.player.gold}g).`,
      kind: 'warning'
    };
  }

  state.player.gold -= uDef.cost;
  state.dayStats.goldSpent += uDef.cost;
  state.upgrades.push(upgradeId);

  // Apply immediate stat/unlock effects
  if (upgradeId === 'water_can_1') {
    state.player.maxWater = 22;
    state.player.water = 22;
  } else if (upgradeId === 'water_can_2') {
    state.player.maxWater = 36;
    state.player.water = 36;
  } else if (upgradeId === 'pack_1') {
    state.player.backpackCapacity = 18;
  } else if (upgradeId === 'pack_2') {
    state.player.backpackCapacity = 24;
  } else if (upgradeId === 'boots_1') {
    state.player.maxStamina = 140;
    state.player.stamina = Math.min(140, state.player.stamina + 40);
  } else if (upgradeId === 'land_south' && !state.unlockedPlots.includes('plot_south')) {
    state.unlockedPlots.push('plot_south');
  } else if (upgradeId === 'land_east' && !state.unlockedPlots.includes('plot_east')) {
    state.unlockedPlots.push('plot_east');
  } else if (upgradeId === 'land_greenhouse' && !state.unlockedPlots.includes('plot_greenhouse')) {
    state.unlockedPlots.push('plot_greenhouse');
  }

  evaluateAchievements(state);
  return {
    ok: true,
    message: `Unlocked ${uDef.name}! ${uDef.benefitText}`,
    kind: 'success',
    sfx: 'fanfare'
  };
}

export function canPlaceMachineAt(
  state: GameState,
  type: MachineType,
  x: number,
  y: number
): { valid: boolean; reason: string } {
  const tile = getTileAt(state.tiles, x, y);
  if (!tile) return { valid: false, reason: 'Out of bounds.' };
  if (tile.machineId) return { valid: false, reason: 'Tile already has a machine.' };
  if (x === Math.round(state.player.x) && y === Math.round(state.player.y)) {
    return { valid: false, reason: 'Cannot place directly under yourself.' };
  }
  if (tile.debris !== 'none') {
    return { valid: false, reason: 'Clear weeds or rocks from this tile first.' };
  }
  if (tile.crop) {
    return { valid: false, reason: 'Cannot place over a growing crop.' };
  }
  if (tile.terrain === 'stone_floor') {
    return { valid: true, reason: 'Valid courtyard placement.' };
  }
  if (tile.terrain === 'farm_soil') {
    if (tile.plotId && !state.unlockedPlots.includes(tile.plotId)) {
      return { valid: false, reason: 'Unlock this farm plot deed first.' };
    }
    return { valid: true, reason: type === 'sprinkler' ? 'Waters surrounding soil tiles!' : 'Valid farm placement.' };
  }
  return { valid: false, reason: 'Must be placed on unlocked farm soil or courtyard stone.' };
}

export function buyAndPlaceMachine(
  state: GameState,
  type: MachineType,
  x: number,
  y: number
): ActionFeedback {
  const bp = MACHINE_BLUEPRINTS[type];
  if (!bp) {
    return { ok: false, reason: 'unknown_machine', message: 'Unknown infrastructure type.', kind: 'error' };
  }
  if (state.player.gold < bp.cost) {
    return {
      ok: false,
      reason: 'insufficient_gold',
      message: `Need ${bp.cost}g to build ${bp.name} (you have ${state.player.gold}g).`,
      kind: 'warning'
    };
  }
  const check = canPlaceMachineAt(state, type, x, y);
  if (!check.valid) {
    return { ok: false, reason: 'invalid_placement', message: check.reason, kind: 'warning' };
  }

  const tile = getTileAt(state.tiles, x, y)!;
  const id = `mach_${type}_${Date.now()}_${state.machines.length}`;
  const machine: PlacedMachine = {
    id,
    type,
    x,
    y,
    activeRecipeId: null,
    progressHours: 0,
    durationHours: 0,
    outputItem: null
  };

  state.player.gold -= bp.cost;
  state.dayStats.goldSpent += bp.cost;
  tile.tilled = false;
  tile.machineId = id;
  state.machines.push(machine);

  // If sprinkler, immediately run an initial watering pulse!
  if (type === 'sprinkler') {
    runPlacedSprinklers(state);
  }
  evaluateAchievements(state);

  return {
    ok: true,
    message: `Placed ${bp.name} at (${x}, ${y})!`,
    kind: 'success',
    worldX: x,
    worldY: y,
    sfx: 'fanfare'
  };
}

export function startMachineRecipe(
  state: GameState,
  machineId: string,
  recipeId: string
): ActionFeedback {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine) {
    return { ok: false, reason: 'no_machine', message: 'Machine not found.', kind: 'error' };
  }
  if (machine.outputItem) {
    return {
      ok: false,
      reason: 'output_waiting',
      message: 'Collect the finished output from this station first!',
      kind: 'warning'
    };
  }
  if (machine.activeRecipeId) {
    return {
      ok: false,
      reason: 'already_busy',
      message: 'This station is already processing a batch.',
      kind: 'info'
    };
  }

  const recipe = MACHINE_RECIPES.find((r) => r.id === recipeId && r.machineType === machine.type);
  if (!recipe) {
    return { ok: false, reason: 'invalid_recipe', message: 'Recipe not valid for this station.', kind: 'error' };
  }

  // Find matching input item in player's backpack
  const matchingInput = state.inventory.find((item) => {
    if (item.quantity < recipe.inputQuantity) return false;
    if (recipe.inputItemId && item.itemId !== recipe.inputItemId) return false;
    if (recipe.inputCategory && item.category !== recipe.inputCategory) return false;
    if (recipe.inputVarietyId && item.varietyId !== recipe.inputVarietyId) return false;
    return true;
  });

  if (!matchingInput) {
    return {
      ok: false,
      reason: 'missing_ingredients',
      message: `Requires ${recipe.inputQuantity}× matching input in your Backpack!`,
      kind: 'warning'
    };
  }

  removeItemFromList(state.inventory, matchingInput.itemId, recipe.inputQuantity);
  machine.activeRecipeId = recipe.id;
  machine.progressHours = 0;
  machine.durationHours = recipe.durationHours;

  return {
    ok: true,
    message: `Started ${recipe.name} (${recipe.durationHours}h)!`,
    kind: 'success',
    worldX: machine.x,
    worldY: machine.y,
    sfx: 'ui'
  };
}

export function collectMachineOutput(
  state: GameState,
  machineId: string
): ActionFeedback {
  const machine = state.machines.find((m) => m.id === machineId);
  if (!machine || !machine.outputItem) {
    return { ok: false, reason: 'no_output', message: 'No finished batch to collect yet.', kind: 'info' };
  }

  const out = machine.outputItem;
  if (!canFitItemInList(state.inventory, state.player.backpackCapacity, out.itemId)) {
    return {
      ok: false,
      reason: 'inventory_full',
      message: 'Backpack is full! Free up space before collecting machine output.',
      kind: 'error'
    };
  }

  addItemToList(state.inventory, state.player.backpackCapacity, out);
  machine.outputItem = null;
  state.stats.totalCrafted += 1;
  state.stats.processedCrafted[out.itemId] =
    (state.stats.processedCrafted[out.itemId] || 0) + out.quantity;
  evaluateAchievements(state);

  return {
    ok: true,
    message: `Collected ${out.quantity}× ${out.name}!`,
    kind: 'success',
    worldX: machine.x,
    worldY: machine.y,
    sfx: 'harvest'
  };
}

export function getQuestProgress(state: GameState, questId: string): { current: number; target: number; ready: boolean } {
  const q = QUESTS.find((item) => item.id === questId);
  if (!q) return { current: 0, target: 1, ready: false };

  const req = q.requirement;
  let current = 0;

  if (req.type === 'harvest_count') {
    current = state.stats.totalHarvested;
  } else if (req.type === 'harvest_variety' && req.varietyId) {
    current = state.stats.varietiesHarvested[req.varietyId] || 0;
  } else if (req.type === 'harvest_quality') {
    if (req.quality === 'artisan') {
      current = state.stats.artisanTubersHarvested;
    } else {
      // Prime or Artisan count in inventory + lifetime
      const invCount = state.inventory
        .filter((i) => i.category === 'crop' && (i.quality === 'prime' || i.quality === 'artisan'))
        .reduce((acc, i) => acc + i.quantity, 0);
      current = Math.max(invCount, state.stats.artisanTubersHarvested);
      // Also check bestQualityByVariety
      const primeVarCount = Object.values(state.stats.bestQualityByVariety).filter(
        (qGrade) => qGrade === 'prime' || qGrade === 'artisan'
      ).length;
      current = Math.max(current, primeVarCount * 3);
    }
  } else if (req.type === 'hill_count') {
    current = state.stats.totalHilled;
  } else if (req.type === 'craft_count') {
    current = state.stats.totalCrafted;
  } else if (req.type === 'buy_upgradeCount') {
    current = state.upgrades.length;
  } else if (req.type === 'place_sprinkler') {
    current = state.machines.filter((m) => m.type === 'sprinkler').length;
  }

  return {
    current: Math.min(req.target, current),
    target: req.target,
    ready: current >= req.target
  };
}

export function claimQuestReward(state: GameState, questId: string): ActionFeedback {
  if (state.completedQuests.includes(questId)) {
    return { ok: false, reason: 'already_claimed', message: 'Quest reward already claimed!', kind: 'info' };
  }
  const q = QUESTS.find((item) => item.id === questId);
  if (!q) {
    return { ok: false, reason: 'unknown_quest', message: 'Unknown quest.', kind: 'error' };
  }
  const prog = getQuestProgress(state, questId);
  if (!prog.ready) {
    return {
      ok: false,
      reason: 'incomplete_quest',
      message: `Progress: ${prog.current}/${prog.target}. Complete the requirement first!`,
      kind: 'warning'
    };
  }

  // Ensure reward items fit in backpack or cellar
  if (q.rewardItems) {
    for (const rItem of q.rewardItems) {
      let template: InventoryItem | null = null;
      if (rItem.itemId.startsWith('seed_')) {
        const vId = rItem.itemId.replace('seed_', '') as PotatoVarietyId;
        const vDef = POTATO_VARIETIES[vId];
        template = {
          itemId: rItem.itemId,
          name: `${vDef.name} Seed`,
          category: 'seed',
          varietyId: vId,
          quantity: rItem.quantity,
          unitValue: Math.floor(vDef.seedCost * 0.5),
          description: vDef.description
        };
      } else if (SUPPLIES[rItem.itemId]) {
        const sDef = SUPPLIES[rItem.itemId];
        template = {
          itemId: rItem.itemId,
          name: sDef.name,
          category: 'supply',
          quantity: rItem.quantity,
          unitValue: sDef.sellPrice,
          description: sDef.description
        };
      }
      if (template) {
        if (!addItemToList(state.inventory, state.player.backpackCapacity, template)) {
          addItemToList(state.cellar, 99, template);
        }
      }
    }
  }

  state.completedQuests.push(questId);
  state.player.gold += q.rewardGold;
  state.dayStats.goldEarned += q.rewardGold;
  state.dayStats.questsCompleted += 1;
  state.stats.totalQuestsCompleted += 1;
  state.stats.lifetimeGoldEarned += q.rewardGold;
  evaluateAchievements(state);

  return {
    ok: true,
    message: `Completed "${q.title}"! Earned ${q.rewardGold}g${q.rewardItems ? ' + bonus supplies' : ''}!`,
    kind: 'success',
    sfx: 'fanfare'
  };
}

export function fulfillDailyOrder(state: GameState, orderId: string): ActionFeedback {
  const order = state.dailyOrders.find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, reason: 'unknown_order', message: 'Daily order not found.', kind: 'error' };
  }
  if (order.completed) {
    return { ok: false, reason: 'already_completed', message: 'Order already fulfilled today!', kind: 'info' };
  }

  const rank: Record<QualityGrade, number> = { standard: 1, prime: 2, artisan: 3 };
  const minRank = rank[order.minQuality];

  // Find qualifying stack in inventory
  const match = state.inventory.find(
    (i) =>
      i.category === 'crop' &&
      i.varietyId === order.varietyId &&
      i.quality &&
      rank[i.quality] >= minRank &&
      i.quantity >= order.quantity
  );

  if (!match) {
    const vDef = POTATO_VARIETIES[order.varietyId];
    return {
      ok: false,
      reason: 'missing_crops',
      message: `Need ${order.quantity}× ${vDef.name} (${QUALITY_LABELS[order.minQuality]} or better) in your Backpack.`,
      kind: 'warning'
    };
  }

  removeItemFromList(state.inventory, match.itemId, order.quantity);
  order.completed = true;
  state.player.gold += order.rewardGold;
  state.dayStats.goldEarned += order.rewardGold;
  state.dayStats.questsCompleted += 1;
  state.stats.totalQuestsCompleted += 1;
  state.stats.lifetimeGoldEarned += order.rewardGold;
  evaluateAchievements(state);

  return {
    ok: true,
    message: `Fulfilled ${order.title}! Received ${order.rewardGold}g!`,
    kind: 'success',
    sfx: 'fanfare'
  };
}

export function transferBetweenBackpackAndCellar(
  state: GameState,
  from: 'backpack' | 'cellar',
  itemId: string,
  quantity: number
): ActionFeedback {
  const qty = Math.floor(quantity);
  if (qty <= 0) return { ok: false, message: 'Invalid quantity.', kind: 'warning' };

  const source = from === 'backpack' ? state.inventory : state.cellar;
  const dest = from === 'backpack' ? state.cellar : state.inventory;
  const destCap = from === 'backpack' ? 60 : state.player.backpackCapacity;

  const item = source.find((i) => i.itemId === itemId);
  if (!item || item.quantity < qty) {
    return { ok: false, message: 'Not enough items to transfer.', kind: 'warning' };
  }

  if (!canFitItemInList(dest, destCap, itemId)) {
    return {
      ok: false,
      reason: 'inventory_full',
      message: from === 'backpack' ? 'Root Cellar is full!' : 'Backpack is full!',
      kind: 'error'
    };
  }

  const copy: InventoryItem = { ...item, quantity: qty };
  removeItemFromList(source, itemId, qty);
  addItemToList(dest, destCap, copy);

  return {
    ok: true,
    message: `Transferred ${qty}× ${copy.name} to ${from === 'backpack' ? 'Root Cellar' : 'Backpack'}.`,
    kind: 'info',
    sfx: 'ui'
  };
}

/**
 * Anti-softlock guarantee: If the player runs low on gold/seeds/stamina,
 * Old Mossy provides a Community Sprout Care Package so a farm is never stuck.
 */
export function claimCommunityAid(state: GameState): ActionFeedback {
  const totalSeedsAndCrops = state.inventory
    .filter((i) => i.category === 'seed' || i.category === 'crop')
    .reduce((acc, i) => acc + i.quantity, 0);
  const activeFieldCrops = state.tiles.filter((t) => t.crop !== null).length;

  const needsEmergencyAid =
    state.player.gold < 25 && totalSeedsAndCrops === 0 && activeFieldCrops === 0;

  if (needsEmergencyAid || state.inventory.length < state.player.backpackCapacity) {
    addItemToList(state.inventory, state.player.backpackCapacity, {
      itemId: 'seed_sunburst',
      name: 'Yukon Sunburst Seed',
      category: 'seed',
      varietyId: 'sunburst',
      quantity: 3,
      unitValue: 10,
      description: POTATO_VARIETIES.sunburst.description
    });
    addItemToList(state.inventory, state.player.backpackCapacity, {
      itemId: 'supply_mulch',
      name: SUPPLIES.supply_mulch.name,
      category: 'supply',
      quantity: 2,
      unitValue: SUPPLIES.supply_mulch.sellPrice,
      description: SUPPLIES.supply_mulch.description
    });
    if (state.player.gold < 25) {
      state.player.gold += 25;
    }
    state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 35);
    return {
      ok: true,
      message:
        'Old Mossy shared 3× Yukon Sunburst Seeds, 2× Field Clippings, warm tea (+35 Stamina), and 25g!',
      kind: 'success',
      sfx: 'fanfare'
    };
  }

  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 25);
  return {
    ok: true,
    message: 'Shared a mug of herbal tea with Old Mossy (+25 Stamina)!',
    kind: 'success',
    sfx: 'ui'
  };
}

export function getFestivalPillars(state: GameState): FestivalPillarStatus[] {
  const varietiesCount = VARIETY_ORDER.filter(
    (v) => (state.stats.varietiesHarvested[v] || 0) > 0
  ).length;

  return [
    {
      id: 'pillar_varieties',
      label: 'Harvest All 6 Distinct Potato Varieties',
      current: varietiesCount,
      target: 6,
      done: varietiesCount >= 6
    },
    {
      id: 'pillar_artisan',
      label: 'Harvest 5 Artisan [Tier III] Reserve Tubers',
      current: Math.min(5, state.stats.artisanTubersHarvested),
      target: 5,
      done: state.stats.artisanTubersHarvested >= 5
    },
    {
      id: 'pillar_crafted',
      label: 'Complete 4 Processing Station Batches',
      current: Math.min(4, state.stats.totalCrafted),
      target: 4,
      done: state.stats.totalCrafted >= 4
    },
    {
      id: 'pillar_quests',
      label: 'Fulfill 6 Town Quests or Bistro Contracts',
      current: Math.min(6, state.stats.totalQuestsCompleted),
      target: 6,
      done: state.stats.totalQuestsCompleted >= 6
    },
    {
      id: 'pillar_upgrades',
      label: 'Acquire 5 Farm, Tool, or Land Upgrades',
      current: Math.min(5, state.upgrades.length),
      target: 5,
      done: state.upgrades.length >= 5
    }
  ];
}

export function hostGoldenSpudFestival(state: GameState): ActionFeedback {
  if (state.festival.won) {
    return {
      ok: false,
      reason: 'already_won',
      message: 'You are already the reigning Golden Spud Festival Champion! Enjoy sandbox play.',
      kind: 'info'
    };
  }

  const pillars = getFestivalPillars(state);
  const incomplete = pillars.filter((p) => !p.done);
  if (incomplete.length > 0) {
    return {
      ok: false,
      reason: 'pillars_incomplete',
      message: `Complete all 5 Festival Pillars first (${5 - incomplete.length}/5 complete)! Next: ${incomplete[0].label}.`,
      kind: 'warning'
    };
  }

  state.festival.won = true;
  state.festival.wonOnDay = state.calendar.totalDays;
  state.festival.trophyPlaced = true;
  state.player.gold += 1000;
  state.dayStats.goldEarned += 1000;
  state.stats.lifetimeGoldEarned += 1000;
  evaluateAchievements(state);

  return {
    ok: true,
    message:
      'CHAMPION OF THE GOLDEN SPUD FESTIVAL! The Golden Spud Trophy now gleams on your estate plinth (+1,000g Prize)!',
    kind: 'success',
    sfx: 'fanfare'
  };
}

export function evaluateAchievements(state: GameState): string[] {
  const newlyUnlocked: string[] = [];
  const unlock = (id: string) => {
    if (!state.achievements.includes(id)) {
      state.achievements.push(id);
      newlyUnlocked.push(id);
    }
  };

  if (state.stats.totalHarvested >= 1) unlock('ach_first_spud');
  if (state.stats.totalHilled >= 10) unlock('ach_ridge_master');
  const varietiesCount = VARIETY_ORDER.filter(
    (v) => (state.stats.varietiesHarvested[v] || 0) > 0
  ).length;
  if (varietiesCount >= 6) unlock('ach_six_varieties');
  if (state.stats.artisanTubersHarvested >= 5) unlock('ach_artisan_grower');
  if (state.stats.totalCrafted >= 5) unlock('ach_compost_alchemist');
  if (state.machines.filter((m) => m.type === 'sprinkler').length >= 2) unlock('ach_irrigated');
  if (state.unlockedPlots.length >= 2) unlock('ach_land_baron');
  if (state.stats.totalQuestsCompleted >= 6) unlock('ach_bistro_partner');
  if (state.stats.lifetimeGoldEarned >= 1500) unlock('ach_thousand_gold');
  if (
    state.stats.varietiesHarvested.frostbite >= 1 ||
    state.unlockedPlots.includes('plot_greenhouse')
  ) {
    unlock('ach_winter_hardy');
  }
  if (state.upgrades.length >= 6) unlock('ach_tool_smith');
  if (state.festival.won) unlock('ach_festival_champion');

  return newlyUnlocked;
}

export interface CropInspectionInfo {
  title: string;
  stageLabel: string;
  maturityText: string;
  needsText: string;
  improvementText: string;
  moisturePct: number;
  fertilityPct: number;
  hillLevel: number;
  projectedGrade: QualityGrade;
}

export function inspectTileCrop(state: GameState, tile: SoilTile): CropInspectionInfo | null {
  if (!tile.crop) return null;
  const crop = tile.crop;
  const vDef = POTATO_VARIETIES[crop.varietyId];

  const stageNames = [
    'Stage 1/5: Sprouting Seed Eye',
    'Stage 2/5: Emerging Green Chits',
    'Stage 3/5: Leafy Haulm Canopy',
    'Stage 4/5: Flowering Blossom Ridge',
    'Stage 5/5: Harvest-Ready Bulking Tubers!'
  ];

  const remainingHours = Math.max(
    0,
    ((100 - crop.growthPct) / 100) * vDef.growthHours
  );
  const maturityText =
    crop.stage === 4
      ? 'Ready to harvest now with Harvest Fork (Key 4)!'
      : `${Math.floor(crop.growthPct)}% grown (~${remainingHours.toFixed(1)} in-game hrs to harvest)`;

  const needs: string[] = [];
  if (crop.hasWeeds) needs.push('Clear weeds with Hilling Hoe (Key 2)');
  if (crop.hasPests) needs.push('Remove beetles with Hilling Hoe (Key 2)');
  if (tile.moisture < vDef.optimalMoisture[0]) {
    needs.push(`Needs Water (current ${Math.round(tile.moisture)}%, optimal ${vDef.optimalMoisture[0]}–${vDef.optimalMoisture[1]}%)`);
  } else if (tile.moisture > vDef.optimalMoisture[1] + 12) {
    needs.push('Soil is very wet — pause watering');
  }
  if (crop.hillLevel === 0 && crop.stage < 4) {
    needs.push('Needs Hilling with Hilling Hoe (Key 2) to prevent greening');
  }
  const needsText = needs.length > 0 ? needs.join(' • ') : 'Thriving! Optimal moisture and clean ridge.';

  const tips: string[] = [];
  if (crop.hillLevel < 2) tips.push(`Hill ridge (${crop.hillLevel}/2) for +1 tuber & higher grade`);
  if (tile.fertility < 75) tips.push('Apply Rich Compost or Potash Tonic for Artisan quality');
  const improvementText =
    tips.length > 0 ? tips.join(' • ') : 'Maximum ridge care achieved!';

  const forkBonus = hasUpgrade(state, 'tool_fork_1') ? 12 : 0;
  const score =
    crop.careScore -
    crop.stressScore * 0.7 +
    crop.hillLevel * 15 +
    tile.fertility * 0.25 +
    forkBonus;
  let projectedGrade: QualityGrade = 'standard';
  if (score >= 76 && crop.hillLevel >= 1) projectedGrade = 'artisan';
  else if (score >= 46) projectedGrade = 'prime';

  return {
    title: vDef.name,
    stageLabel: stageNames[crop.stage],
    maturityText,
    needsText,
    improvementText,
    moisturePct: Math.round(tile.moisture),
    fertilityPct: Math.round(tile.fertility),
    hillLevel: crop.hillLevel,
    projectedGrade
  };
}
