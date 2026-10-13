import { NpcId, PlotId, SoilTile, TileTerrain } from '../data/types';
import { SeededRng } from './rng';

export const MAP_WIDTH = 28;
export const MAP_HEIGHT = 20;
export const TILE_SIZE = 48;

export interface LandmarkZone {
  id: string;
  label: string;
  actionLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  interactX: number;
  interactY: number;
  kind:
    | 'farmhouse'
    | 'cellar'
    | 'well'
    | 'shop'
    | 'market'
    | 'festival_plinth'
    | 'community_aid'
    | 'plot_sign';
  plotId?: PlotId;
  npcId?: NpcId;
}

export const LANDMARKS: LandmarkZone[] = [
  {
    id: 'lm_farmhouse',
    label: 'Homestead Farmhouse',
    actionLabel: 'Sleep & End Day',
    x: 2,
    y: 1,
    width: 5,
    height: 4,
    interactX: 4,
    interactY: 5,
    kind: 'farmhouse'
  },
  {
    id: 'lm_cellar',
    label: 'Root Cellar Storage',
    actionLabel: 'Open Root Cellar',
    x: 7,
    y: 3,
    width: 1,
    height: 2,
    interactX: 7,
    interactY: 5,
    kind: 'cellar'
  },
  {
    id: 'lm_well',
    label: 'Springfed Stone Well',
    actionLabel: 'Refill Watering Can',
    x: 5,
    y: 9,
    width: 1,
    height: 1,
    interactX: 6,
    interactY: 9,
    kind: 'well'
  },
  {
    id: 'lm_festival',
    label: 'Golden Spud Festival Plinth',
    actionLabel: 'Inspect Festival Progress',
    x: 17,
    y: 3,
    width: 1,
    height: 2,
    interactX: 17,
    interactY: 5,
    kind: 'festival_plinth'
  },
  {
    id: 'lm_shop',
    label: "Barnaby's Tuber & Tool Emporium",
    actionLabel: 'Open Seed & Upgrade Shop',
    x: 19,
    y: 1,
    width: 4,
    height: 4,
    interactX: 21,
    interactY: 5,
    kind: 'shop',
    npcId: 'barnaby'
  },
  {
    id: 'lm_market',
    label: 'Spudstead Market Stall & Bistro Board',
    actionLabel: 'Sell Harvest & View Orders',
    x: 23,
    y: 1,
    width: 4,
    height: 4,
    interactX: 24,
    interactY: 5,
    kind: 'market',
    npcId: 'mireille'
  },
  {
    id: 'lm_aid',
    label: "Old Mossy's Sprout & Compost Barrel",
    actionLabel: 'Talk to Old Mossy / Claim Aid',
    x: 3,
    y: 16,
    width: 2,
    height: 1,
    interactX: 4,
    interactY: 16,
    kind: 'community_aid',
    npcId: 'mossy'
  },
  {
    id: 'sign_south',
    label: 'South Sun-Terrace Deed Sign',
    actionLabel: 'Unlock South Terrace (180g)',
    x: 7,
    y: 13,
    width: 1,
    height: 1,
    interactX: 7,
    interactY: 13,
    kind: 'plot_sign',
    plotId: 'plot_south'
  },
  {
    id: 'sign_east',
    label: 'East Loam Hollow Deed Sign',
    actionLabel: 'Unlock East Hollow (280g)',
    x: 16,
    y: 8,
    width: 1,
    height: 1,
    interactX: 16,
    interactY: 8,
    kind: 'plot_sign',
    plotId: 'plot_east'
  },
  {
    id: 'sign_greenhouse',
    label: 'All-Season Coldframe Sign',
    actionLabel: 'Build Glass Coldframe (420g)',
    x: 16,
    y: 14,
    width: 1,
    height: 1,
    interactX: 16,
    interactY: 14,
    kind: 'plot_sign',
    plotId: 'plot_greenhouse'
  }
];

export function getPlotForCoord(x: number, y: number): PlotId | undefined {
  if (x >= 8 && x <= 15 && y >= 7 && y <= 11) return 'plot_homestead';
  if (x >= 8 && x <= 15 && y >= 13 && y <= 16) return 'plot_south';
  if (x >= 17 && x <= 23 && y >= 8 && y <= 12) return 'plot_east';
  if (x >= 17 && x <= 23 && y >= 14 && y <= 17) return 'plot_greenhouse';
  return undefined;
}

export function createInitialMapTiles(rng: SeededRng): SoilTile[] {
  const tiles: SoilTile[] = [];

  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      let terrain: TileTerrain = 'grass';
      const plotId = getPlotForCoord(x, y);

      // Buildings
      if (
        (x >= 2 && x <= 6 && y >= 1 && y <= 4) ||
        (x >= 19 && x <= 22 && y >= 1 && y <= 4) ||
        (x >= 23 && x <= 26 && y >= 1 && y <= 4)
      ) {
        terrain = 'building';
      } else if (x >= 1 && x <= 4 && y >= 9 && y <= 13) {
        // Springfed Lily Pond
        terrain = 'water';
      } else if (x >= 9 && x <= 15 && y >= 2 && y <= 4) {
        // Processing Courtyard
        terrain = 'stone_floor';
      } else if (x >= 1 && x <= 5 && y >= 15 && y <= 18) {
        // Resource Gathering Grove
        terrain = 'forage_ground';
      } else if (plotId) {
        terrain = 'farm_soil';
      } else if (
        // Coherent dirt paths connecting Farmhouse, Pond, Fields, Courtyard, and Market
        (y === 5 && x >= 3 && x <= 25) ||
        (y === 6 && x >= 4 && x <= 25) ||
        (x === 6 && y >= 5 && y <= 16) ||
        (x === 7 && y >= 5 && y <= 16) ||
        (x === 16 && y >= 5 && y <= 17) ||
        (y === 12 && x >= 6 && x <= 16)
      ) {
        terrain = 'path';
      }

      let tilled = false;
      let moisture = 40;
      let fertility = plotId === 'plot_east' ? 75 : 55;
      let debris: SoilTile['debris'] = 'none';
      let crop: SoilTile['crop'] = null;

      if (plotId === 'plot_homestead') {
        // Starter row at y = 8: near-mature & harvest-ready Yukon Sunburst starter patch!
        if (y === 8 && (x === 9 || x === 10)) {
          tilled = true;
          moisture = 72;
          fertility = 70;
          crop = {
            varietyId: 'sunburst',
            growthPct: 100,
            stage: 4,
            hillLevel: 1,
            careScore: 68,
            stressScore: 0,
            hasWeeds: false,
            hasPests: false,
            hoursGrown: 36,
            wateredToday: true
          };
        } else if (y === 8 && (x === 11 || x === 12)) {
          // Near-mature Stage 3 Flowering plants (92% grown -> matures within ~25 seconds of normal play!)
          tilled = true;
          moisture = 58;
          fertility = 68;
          crop = {
            varietyId: 'sunburst',
            growthPct: 92,
            stage: 3,
            hillLevel: 1,
            careScore: 62,
            stressScore: 0,
            hasWeeds: false,
            hasPests: false,
            hoursGrown: 33,
            wateredToday: false
          };
        } else if (y === 9 && x >= 9 && x <= 12) {
          // Pre-tilled furrows ready for immediate planting!
          tilled = true;
          moisture = 60;
          fertility = 65;
        } else if ((x + y) % 5 === 0) {
          debris = 'weeds';
        } else if ((x * 3 + y) % 11 === 0) {
          debris = 'rock';
        }
      } else if (plotId) {
        // Unlockable plots have natural overgrown weeds and stones to clear
        const roll = rng.next();
        if (roll < 0.25) debris = 'weeds';
        else if (roll < 0.36) debris = 'rock';
      } else if (terrain === 'forage_ground') {
        if ((x + y) % 2 === 0) {
          debris = x === 2 && y === 17 ? 'wild_sprout' : 'weeds';
        } else if (x === 1 && y === 16) {
          debris = 'rock';
        }
      }

      tiles.push({
        x,
        y,
        terrain,
        plotId,
        tilled,
        moisture,
        fertility,
        debris,
        crop
      });
    }
  }

  return tiles;
}

export function getTileAt(tiles: SoilTile[], x: number, y: number): SoilTile | undefined {
  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return undefined;
  return tiles[y * MAP_WIDTH + x];
}

export function isTileWalkable(
  tiles: SoilTile[],
  x: number,
  y: number,
  unlockedPlots: PlotId[]
): boolean {
  if (x < 1 || x >= MAP_WIDTH - 1 || y < 1 || y >= MAP_HEIGHT - 1) return false;
  const tile = getTileAt(tiles, x, y);
  if (!tile) return false;
  if (tile.terrain === 'building' || tile.terrain === 'water') return false;
  if (tile.machineId) return false;
  if (tile.debris === 'rock') return false;
  // Stone well at (5,9) and Festival plinth at (17,3..4)
  if (x === 5 && y === 9) return false;
  if (x === 17 && (y === 3 || y === 4)) return false;
  if (x === 7 && (y === 3 || y === 4)) return false;
  // Locked plots have a wooden fence border, though walking up to the signpost is allowed
  if (tile.plotId && !unlockedPlots.includes(tile.plotId)) {
    return false;
  }
  return true;
}

export function isWaterSourceAdjacent(x: number, y: number, tiles: SoilTile[]): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx === 5 && ty === 9) return true; // Stone well
      const t = getTileAt(tiles, tx, ty);
      if (t && t.terrain === 'water') return true;
    }
  }
  return false;
}
