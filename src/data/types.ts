export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export type WeatherType = 'sunny' | 'breezy' | 'rainy' | 'stormy' | 'frosty';

export type PotatoVarietyId =
  | 'sunburst'
  | 'crimson'
  | 'russet'
  | 'violet'
  | 'frostbite'
  | 'truffle';

export type QualityGrade = 'standard' | 'prime' | 'artisan';

export type ToolId = 'spade' | 'hoe' | 'watering_can' | 'fork' | 'pouch';

export type Direction = 'down' | 'up' | 'left' | 'right';

export type PlayerActionType =
  | 'idle'
  | 'walk'
  | 'till'
  | 'plant'
  | 'water'
  | 'hill'
  | 'harvest'
  | 'clear';

export type PlotId = 'plot_homestead' | 'plot_south' | 'plot_east' | 'plot_greenhouse';

export type TileTerrain =
  | 'grass'
  | 'path'
  | 'water'
  | 'stone_floor'
  | 'farm_soil'
  | 'building'
  | 'forage_ground';

export type DebrisType = 'none' | 'weeds' | 'rock' | 'wild_sprout';

export interface CropInstance {
  varietyId: PotatoVarietyId;
  /** Growth progress from 0.0 to 100.0 */
  growthPct: number;
  /** 0: Planted Eye, 1: Emerging Chits, 2: Leafy Haulm, 3: Flowering Canopy, 4: Mature Bulking Ridge */
  stage: 0 | 1 | 2 | 3 | 4;
  /** Times hilled with the Hilling Hoe (0, 1, or 2) */
  hillLevel: number;
  /** Accumulated care points from optimal moisture, fertility, hilling, and season suitability */
  careScore: number;
  /** Accumulated stress points from drought, waterlogging, weeds, pests, or unseasonable cold */
  stressScore: number;
  /** Whether weeds have sprouted in this ridge */
  hasWeeds: boolean;
  /** Whether potato beetles are currently on this plant */
  hasPests: boolean;
  /** Total hours this crop has been growing */
  hoursGrown: number;
  /** Whether watered today */
  wateredToday: boolean;
}

export interface SoilTile {
  x: number;
  y: number;
  terrain: TileTerrain;
  plotId?: PlotId;
  tilled: boolean;
  /** 0 to 100 */
  moisture: number;
  /** 0 to 100 */
  fertility: number;
  debris: DebrisType;
  crop: CropInstance | null;
  machineId?: string;
}

export type ItemCategory = 'seed' | 'crop' | 'supply' | 'processed';

export interface InventoryItem {
  itemId: string;
  name: string;
  category: ItemCategory;
  quantity: number;
  varietyId?: PotatoVarietyId;
  quality?: QualityGrade;
  unitValue: number;
  description: string;
}

export type MachineType = 'sprinkler' | 'composter' | 'seed_cutter' | 'kitchen';

export interface PlacedMachine {
  id: string;
  type: MachineType;
  x: number;
  y: number;
  activeRecipeId: string | null;
  progressHours: number;
  durationHours: number;
  outputItem: InventoryItem | null;
}

export interface MachineRecipeDef {
  id: string;
  machineType: MachineType;
  name: string;
  description: string;
  inputCategory?: ItemCategory;
  inputItemId?: string;
  inputVarietyId?: PotatoVarietyId;
  inputQuantity: number;
  durationHours: number;
  outputItemId: string;
  outputName: string;
  outputCategory: ItemCategory;
  outputQuantity: number;
  outputBaseValue: number;
  requiresUpgrade?: UpgradeId;
}

export type UpgradeId =
  | 'tool_spade_1'
  | 'tool_hoe_1'
  | 'tool_fork_1'
  | 'water_can_1'
  | 'water_can_2'
  | 'pack_1'
  | 'pack_2'
  | 'boots_1'
  | 'land_south'
  | 'land_east'
  | 'land_greenhouse'
  | 'irrigation_1'
  | 'irrigation_2'
  | 'processing_mastery';

export type UpgradeCategory =
  | 'tools'
  | 'water'
  | 'inventory'
  | 'land'
  | 'irrigation'
  | 'processing';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: UpgradeCategory;
  cost: number;
  description: string;
  benefitText: string;
  prerequisite?: UpgradeId;
}

export interface PotatoVarietyDef {
  id: PotatoVarietyId;
  name: string;
  subtitle: string;
  description: string;
  preferredSeasons: Season[];
  growthHours: number;
  yieldMin: number;
  yieldMax: number;
  optimalMoisture: [number, number];
  waterNeedLabel: 'Low' | 'Moderate' | 'High' | 'Precise';
  frostTolerant: boolean;
  seedCost: number;
  baseSellPrice: number;
  qualityCeiling: number;
  unlockDay: number;
  colorHex: string;
  blossomHex: string;
}

export type NpcId = 'barnaby' | 'mireille' | 'mossy';

export interface NpcDef {
  id: NpcId;
  name: string;
  role: string;
  x: number;
  y: number;
  portrait: string;
  greetings: Record<Season, string[]>;
  tips: string[];
}

export interface QuestRequirement {
  type:
    | 'harvest_count'
    | 'harvest_variety'
    | 'harvest_quality'
    | 'hill_count'
    | 'deliver_item'
    | 'craft_count'
    | 'buy_upgradeCount'
    | 'place_sprinkler';
  varietyId?: PotatoVarietyId;
  quality?: QualityGrade;
  itemId?: string;
  target: number;
}

export interface QuestDef {
  id: string;
  title: string;
  giver: NpcId;
  description: string;
  flavorText: string;
  requirement: QuestRequirement;
  rewardGold: number;
  rewardItems?: { itemId: string; quantity: number }[];
  unlocksDay?: number;
}

export interface DailyOrder {
  id: string;
  patron: NpcId;
  title: string;
  varietyId: PotatoVarietyId;
  minQuality: QualityGrade;
  quantity: number;
  rewardGold: number;
  completed: boolean;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  timeSpeed: 0 | 1 | 2 | 4;
}

export interface DaySummaryStats {
  day: number;
  season: Season;
  year: number;
  harvestedCount: number;
  goldEarned: number;
  goldSpent: number;
  questsCompleted: number;
  cropsPlanted: number;
}

export interface CollectionStats {
  varietiesHarvested: Record<PotatoVarietyId, number>;
  bestQualityByVariety: Record<PotatoVarietyId, QualityGrade | null>;
  processedCrafted: Record<string, number>;
  totalHarvested: number;
  totalHilled: number;
  totalComposted: number;
  totalCrafted: number;
  totalQuestsCompleted: number;
  lifetimeGoldEarned: number;
  artisanTubersHarvested: number;
}

export interface PlayerState {
  x: number;
  y: number;
  facing: Direction;
  action: PlayerActionType;
  actionTimer: number;
  stamina: number;
  maxStamina: number;
  water: number;
  maxWater: number;
  selectedTool: ToolId;
  selectedItemId: string;
  gold: number;
  backpackCapacity: number;
}

export interface CalendarState {
  year: number;
  season: Season;
  /** 1 to 7 */
  dayOfSeason: number;
  /** Total days elapsed since start (1-based) */
  totalDays: number;
  /** Hour of day from 6.0 to 22.0 */
  hour: number;
  weather: WeatherType;
  tomorrowWeather: WeatherType;
  dailyDemandVariety: PotatoVarietyId;
  dailyProcessedBonusId: string;
}

export interface FestivalState {
  won: boolean;
  wonOnDay: number | null;
  trophyPlaced: boolean;
}

export interface GameState {
  schemaVersion: number;
  saveRevision: number;
  farmName: string;
  createdAt: number;
  lastSavedAt: number;
  rngState: number;
  calendar: CalendarState;
  player: PlayerState;
  tiles: SoilTile[];
  unlockedPlots: PlotId[];
  inventory: InventoryItem[];
  cellar: InventoryItem[];
  machines: PlacedMachine[];
  upgrades: UpgradeId[];
  completedQuests: string[];
  dailyOrders: DailyOrder[];
  achievements: string[];
  stats: CollectionStats;
  dayStats: DaySummaryStats;
  festival: FestivalState;
  settings: GameSettings;
  tutorialStep: number;
}

export interface ActionFeedback {
  ok: boolean;
  reason?: string;
  message: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  worldX?: number;
  worldY?: number;
  sfx?:
    | 'dig'
    | 'plant'
    | 'water'
    | 'hill'
    | 'harvest'
    | 'coin'
    | 'ui'
    | 'fanfare';
}
