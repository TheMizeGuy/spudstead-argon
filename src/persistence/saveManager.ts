import { POTATO_VARIETIES, SEASONS, VARIETY_ORDER } from '../data/content';
import {
  GameState,
  InventoryItem,
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
import { CURRENT_SCHEMA_VERSION, createNewGameState } from '../sim/simulation';
import { MAP_HEIGHT, MAP_WIDTH } from '../sim/worldMap';

export const IDB_NAME = 'spudstead_argon_idb_v1';
export const IDB_STORE = 'saves';
export const LS_PRIMARY_KEY = 'spudstead_argon_save_v1';
export const LS_BACKUP_KEY = 'spudstead_argon_backup_v1';
export const TAB_CHANNEL_NAME = 'spudstead_argon_tab_sync_v1';

export type SaveIndicatorState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface SaveSummaryMeta {
  farmName: string;
  season: Season;
  dayOfSeason: number;
  year: number;
  totalDays: number;
  gold: number;
  lastSavedAt: number;
  saveRevision: number;
}

export interface LoadResult {
  state: GameState | null;
  meta: SaveSummaryMeta | null;
  recoveredFromBackup: boolean;
  error?: string;
}

export interface SaveStatusEvent {
  status: SaveIndicatorState;
  lastSavedAt: number | null;
  message: string;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Deeply validates and sanitizes a raw parsed JSON object into a valid `GameState`.
 * Returns `null` if required structures are missing or invalid.
 * Never executes arbitrary content or trusts malformed fields.
 */
export function validateAndMigrateSave(raw: unknown): GameState | null {
  if (!isPlainObject(raw)) return null;

  // Support wrapped export format { app: 'SPUDSTEAD_ARGON', payload: GameState } or direct GameState
  const data = isPlainObject(raw.payload) ? raw.payload : raw;

  const schemaVersion = Number(data.schemaVersion ?? 1);
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > CURRENT_SCHEMA_VERSION + 2) {
    return null;
  }

  if (typeof data.farmName !== 'string' || data.farmName.trim().length === 0) {
    return null;
  }

  if (!isPlainObject(data.calendar) || !isPlainObject(data.player) || !Array.isArray(data.tiles)) {
    return null;
  }

  const isCurrentSize = data.tiles.length === MAP_WIDTH * MAP_HEIGHT;
  const isLegacy28x20 = data.tiles.length === 28 * 20;
  if (!isCurrentSize && !isLegacy28x20) {
    return null;
  }

  const cal = data.calendar;
  const season = String(cal.season) as Season;
  if (!SEASONS.includes(season)) return null;

  const dayOfSeason = Math.floor(Number(cal.dayOfSeason));
  const year = Math.floor(Number(cal.year));
  const totalDays = Math.floor(Number(cal.totalDays));
  const hour = Number(cal.hour);
  if (
    !Number.isFinite(dayOfSeason) ||
    dayOfSeason < 1 ||
    dayOfSeason > 7 ||
    !Number.isFinite(year) ||
    year < 1 ||
    !Number.isFinite(totalDays) ||
    totalDays < 1 ||
    !Number.isFinite(hour)
  ) {
    return null;
  }

  const pl = data.player;
  const gold = Math.floor(Number(pl.gold));
  const stamina = Number(pl.stamina);
  const maxStamina = Number(pl.maxStamina);
  const water = Number(pl.water);
  const maxWater = Number(pl.maxWater);
  const px = Number(pl.x);
  const py = Number(pl.y);

  if (
    !Number.isFinite(gold) ||
    gold < 0 ||
    !Number.isFinite(stamina) ||
    !Number.isFinite(maxStamina) ||
    maxStamina <= 0 ||
    !Number.isFinite(water) ||
    !Number.isFinite(maxWater) ||
    !Number.isFinite(px) ||
    !Number.isFinite(py)
  ) {
    return null;
  }

  // Start from a clean baseline state and overlay validated properties
  const base = createNewGameState(data.farmName.slice(0, 40));

  base.schemaVersion = CURRENT_SCHEMA_VERSION;
  base.saveRevision = Math.max(1, Math.floor(Number(data.saveRevision) || 1));
  base.createdAt = Number(data.createdAt) || Date.now();
  base.lastSavedAt = Number(data.lastSavedAt) || Date.now();
  base.rngState = (Number(data.rngState) >>> 0) || 20261013;

  const validWeathers: WeatherType[] = ['sunny', 'breezy', 'rainy', 'stormy', 'frosty'];
  base.calendar = {
    year,
    season,
    dayOfSeason,
    totalDays,
    hour: Math.max(6, Math.min(22, hour)),
    weather: validWeathers.includes(cal.weather as WeatherType)
      ? (cal.weather as WeatherType)
      : 'sunny',
    tomorrowWeather: validWeathers.includes(cal.tomorrowWeather as WeatherType)
      ? (cal.tomorrowWeather as WeatherType)
      : 'sunny',
    dailyDemandVariety: VARIETY_ORDER.includes(cal.dailyDemandVariety as PotatoVarietyId)
      ? (cal.dailyDemandVariety as PotatoVarietyId)
      : 'sunburst',
    dailyProcessedBonusId:
      typeof cal.dailyProcessedBonusId === 'string'
        ? cal.dailyProcessedBonusId
        : 'proc_kettle_chips'
  };

  const validTools: ToolId[] = ['spade', 'hoe', 'watering_can', 'fork', 'pouch'];
  base.player = {
    x: Math.max(1, Math.min(MAP_WIDTH - 2, px)),
    y: Math.max(1, Math.min(MAP_HEIGHT - 2, py)),
    facing: ['down', 'up', 'left', 'right'].includes(String(pl.facing))
      ? (pl.facing as GameState['player']['facing'])
      : 'down',
    action: 'idle',
    actionTimer: 0,
    stamina: Math.max(0, Math.min(maxStamina, stamina)),
    maxStamina,
    water: Math.max(0, Math.min(maxWater, water)),
    maxWater,
    selectedTool: validTools.includes(pl.selectedTool as ToolId)
      ? (pl.selectedTool as ToolId)
      : 'fork',
    selectedItemId: typeof pl.selectedItemId === 'string' ? pl.selectedItemId : 'seed_sunburst',
    gold,
    backpackCapacity: Math.max(12, Math.min(48, Math.floor(Number(pl.backpackCapacity) || 12)))
  };

  // Validate tiles (supports both current 38x28 and legacy 28x20 saves)
  const rawTileByCoord = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < data.tiles.length; i++) {
    const rt = data.tiles[i];
    if (!isPlainObject(rt)) return null;
    if (isCurrentSize) {
      const fb = base.tiles[i];
      rawTileByCoord.set(`${fb.x},${fb.y}`, rt);
    } else {
      const rx = typeof rt.x === 'number' ? rt.x : i % 28;
      const ry = typeof rt.y === 'number' ? rt.y : Math.floor(i / 28);
      rawTileByCoord.set(`${rx},${ry}`, rt);
    }
  }

  const validatedTiles: SoilTile[] = [];
  for (let i = 0; i < base.tiles.length; i++) {
    const fallbackTile = base.tiles[i];
    const rawTile = rawTileByCoord.get(`${fallbackTile.x},${fallbackTile.y}`);
    if (!rawTile) {
      validatedTiles.push(fallbackTile);
      continue;
    }

    let crop: SoilTile['crop'] = null;
    if (isPlainObject(rawTile.crop)) {
      const rc = rawTile.crop;
      const vId = String(rc.varietyId) as PotatoVarietyId;
      if (!VARIETY_ORDER.includes(vId)) return null;
      const growthPct = Math.max(0, Math.min(100, Number(rc.growthPct) || 0));
      const stageRaw = Math.floor(Number(rc.stage) || 0);
      const stage = Math.max(0, Math.min(4, stageRaw)) as 0 | 1 | 2 | 3 | 4;
      crop = {
        varietyId: vId,
        growthPct,
        stage,
        hillLevel: Math.max(0, Math.min(2, Math.floor(Number(rc.hillLevel) || 0))),
        careScore: Math.max(0, Number(rc.careScore) || 0),
        stressScore: Math.max(0, Number(rc.stressScore) || 0),
        hasWeeds: Boolean(rc.hasWeeds),
        hasPests: Boolean(rc.hasPests),
        hoursGrown: Math.max(0, Number(rc.hoursGrown) || 0),
        wateredToday: Boolean(rc.wateredToday)
      };
    }

    validatedTiles.push({
      x: fallbackTile.x,
      y: fallbackTile.y,
      terrain: fallbackTile.terrain,
      plotId: fallbackTile.plotId,
      tilled: fallbackTile.terrain === 'farm_soil' ? Boolean(rawTile.tilled) : false,
      moisture: Math.max(0, Math.min(100, Number(rawTile.moisture ?? fallbackTile.moisture))),
      fertility: Math.max(0, Math.min(100, Number(rawTile.fertility ?? fallbackTile.fertility))),
      debris: ['none', 'weeds', 'rock', 'wild_sprout'].includes(String(rawTile.debris))
        ? (rawTile.debris as SoilTile['debris'])
        : 'none',
      crop: fallbackTile.terrain === 'farm_soil' ? crop : null,
      machineId: typeof rawTile.machineId === 'string' ? rawTile.machineId : undefined
    });
  }
  base.tiles = validatedTiles;

  // Unlocked plots
  if (Array.isArray(data.unlockedPlots)) {
    const validPlots: PlotId[] = ['plot_homestead', 'plot_south', 'plot_east', 'plot_greenhouse'];
    base.unlockedPlots = data.unlockedPlots.filter((p): p is PlotId =>
      validPlots.includes(p as PlotId)
    );
    if (!base.unlockedPlots.includes('plot_homestead')) {
      base.unlockedPlots.unshift('plot_homestead');
    }
  }

  // Validate inventory & cellar
  const sanitizeItemList = (arr: unknown): InventoryItem[] => {
    if (!Array.isArray(arr)) return [];
    const out: InventoryItem[] = [];
    for (const rawItem of arr) {
      if (!isPlainObject(rawItem)) continue;
      const qty = Math.floor(Number(rawItem.quantity));
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const itemId = String(rawItem.itemId || '');
      const name = String(rawItem.name || '');
      const category = String(rawItem.category || '') as InventoryItem['category'];
      if (!itemId || !name || !['seed', 'crop', 'supply', 'processed'].includes(category)) continue;
      out.push({
        itemId,
        name,
        category,
        quantity: qty,
        varietyId: VARIETY_ORDER.includes(rawItem.varietyId as PotatoVarietyId)
          ? (rawItem.varietyId as PotatoVarietyId)
          : undefined,
        quality: ['standard', 'prime', 'artisan'].includes(String(rawItem.quality))
          ? (rawItem.quality as QualityGrade)
          : undefined,
        unitValue: Math.max(1, Math.floor(Number(rawItem.unitValue) || 10)),
        description: String(rawItem.description || '')
      });
    }
    return out;
  };

  base.inventory = sanitizeItemList(data.inventory);
  base.cellar = sanitizeItemList(data.cellar);

  // Validate machines
  if (Array.isArray(data.machines)) {
    const machines: PlacedMachine[] = [];
    for (const rm of data.machines) {
      if (!isPlainObject(rm)) continue;
      const type = String(rm.type) as PlacedMachine['type'];
      if (!['sprinkler', 'composter', 'seed_cutter', 'kitchen'].includes(type)) continue;
      const mx = Math.floor(Number(rm.x));
      const my = Math.floor(Number(rm.y));
      if (mx < 0 || mx >= MAP_WIDTH || my < 0 || my >= MAP_HEIGHT) continue;
      let outputItem: InventoryItem | null = null;
      if (isPlainObject(rm.outputItem)) {
        const parsed = sanitizeItemList([rm.outputItem]);
        if (parsed.length > 0) outputItem = parsed[0];
      }
      machines.push({
        id: String(rm.id || `mach_${mx}_${my}`),
        type,
        x: mx,
        y: my,
        activeRecipeId: typeof rm.activeRecipeId === 'string' ? rm.activeRecipeId : null,
        progressHours: Math.max(0, Number(rm.progressHours) || 0),
        durationHours: Math.max(0, Number(rm.durationHours) || 0),
        outputItem
      });
    }
    base.machines = machines;
  }

  if (Array.isArray(data.upgrades)) {
    base.upgrades = data.upgrades.filter((u): u is UpgradeId => typeof u === 'string');
  }
  if (Array.isArray(data.completedQuests)) {
    base.completedQuests = data.completedQuests.filter((q): q is string => typeof q === 'string');
  }
  if (Array.isArray(data.achievements)) {
    base.achievements = data.achievements.filter((a): a is string => typeof a === 'string');
  }
  if (Array.isArray(data.dailyOrders)) {
    base.dailyOrders = data.dailyOrders
      .filter((o): o is Record<string, unknown> => isPlainObject(o))
      .map((o) => ({
        id: String(o.id || 'order'),
        patron: (['barnaby', 'mireille', 'mossy'].includes(String(o.patron))
          ? o.patron
          : 'mireille') as GameState['dailyOrders'][0]['patron'],
        title: String(o.title || 'Daily Order'),
        varietyId: (VARIETY_ORDER.includes(o.varietyId as PotatoVarietyId)
          ? o.varietyId
          : 'sunburst') as PotatoVarietyId,
        minQuality: (['standard', 'prime', 'artisan'].includes(String(o.minQuality))
          ? o.minQuality
          : 'standard') as QualityGrade,
        quantity: Math.max(1, Math.floor(Number(o.quantity) || 2)),
        rewardGold: Math.max(10, Math.floor(Number(o.rewardGold) || 40)),
        completed: Boolean(o.completed)
      }));
  }

  if (isPlainObject(data.stats)) {
    const st = data.stats;
    if (isPlainObject(st.varietiesHarvested)) {
      for (const v of VARIETY_ORDER) {
        base.stats.varietiesHarvested[v] = Math.max(
          0,
          Math.floor(Number(st.varietiesHarvested[v]) || 0)
        );
      }
    }
    if (isPlainObject(st.bestQualityByVariety)) {
      for (const v of VARIETY_ORDER) {
        const q = st.bestQualityByVariety[v];
        base.stats.bestQualityByVariety[v] = ['standard', 'prime', 'artisan'].includes(String(q))
          ? (q as QualityGrade)
          : null;
      }
    }
    base.stats.totalHarvested = Math.max(0, Math.floor(Number(st.totalHarvested) || 0));
    base.stats.totalHilled = Math.max(0, Math.floor(Number(st.totalHilled) || 0));
    base.stats.totalComposted = Math.max(0, Math.floor(Number(st.totalComposted) || 0));
    base.stats.totalCrafted = Math.max(0, Math.floor(Number(st.totalCrafted) || 0));
    base.stats.totalQuestsCompleted = Math.max(0, Math.floor(Number(st.totalQuestsCompleted) || 0));
    base.stats.lifetimeGoldEarned = Math.max(0, Math.floor(Number(st.lifetimeGoldEarned) || 0));
    base.stats.artisanTubersHarvested = Math.max(
      0,
      Math.floor(Number(st.artisanTubersHarvested) || 0)
    );
  }

  if (isPlainObject(data.festival)) {
    base.festival = {
      won: Boolean(data.festival.won),
      wonOnDay: typeof data.festival.wonOnDay === 'number' ? data.festival.wonOnDay : null,
      trophyPlaced: Boolean(data.festival.trophyPlaced)
    };
  }

  if (isPlainObject(data.settings)) {
    const s = data.settings;
    base.settings = {
      musicVolume: Math.max(0, Math.min(1, Number(s.musicVolume ?? 0.55))),
      sfxVolume: Math.max(0, Math.min(1, Number(s.sfxVolume ?? 0.75))),
      muted: Boolean(s.muted),
      screenShake: s.screenShake !== undefined ? Boolean(s.screenShake) : true,
      reducedMotion: Boolean(s.reducedMotion),
      timeSpeed: [0, 1, 2, 4].includes(Number(s.timeSpeed))
        ? (Number(s.timeSpeed) as 0 | 1 | 2 | 4)
        : 1
    };
  }

  base.tutorialStep = Math.max(0, Math.floor(Number(data.tutorialStep) || 0));

  return base;
}

export function extractSaveMeta(state: GameState): SaveSummaryMeta {
  return {
    farmName: state.farmName,
    season: state.calendar.season,
    dayOfSeason: state.calendar.dayOfSeason,
    year: state.calendar.year,
    totalDays: state.calendar.totalDays,
    gold: state.player.gold,
    lastSavedAt: state.lastSavedAt,
    saveRevision: state.saveRevision
  };
}

export class SaveManager {
  private listeners: ((ev: SaveStatusEvent) => void)[] = [];
  private status: SaveIndicatorState = 'idle';
  private lastSavedAt: number | null = null;
  private statusMessage: string = 'Not saved yet';
  private knownRevision: number = 0;
  private tabConflictDetected: boolean = false;
  private simulateStorageUnavailable: boolean = false;
  private channel: BroadcastChannel | null = null;
  private tabId: string = `tab_${Math.random().toString(36).slice(2, 10)}`;

  constructor() {
    this.initTabSync();
    this.requestPersistentStorage();
  }

  private initTabSync(): void {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel(TAB_CHANNEL_NAME);
        this.channel.onmessage = (ev) => {
          const msg = ev.data;
          if (
            isPlainObject(msg) &&
            msg.type === 'SAVE_WRITTEN' &&
            msg.tabId !== this.tabId &&
            typeof msg.revision === 'number'
          ) {
            if (msg.revision > this.knownRevision && this.knownRevision > 0) {
              this.tabConflictDetected = true;
              this.emitStatus(
                'conflict',
                this.lastSavedAt,
                'Another tab saved newer farm progress! Reload to avoid overwriting.'
              );
            }
          }
        };
      }
    } catch {
      // BroadcastChannel optional
    }
  }

  private requestPersistentStorage(): void {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.storage &&
        typeof navigator.storage.persist === 'function'
      ) {
        navigator.storage.persist().catch(() => {});
      }
    } catch {
      // Best-effort only
    }
  }

  public onStatusChange(fn: (ev: SaveStatusEvent) => void): () => void {
    this.listeners.push(fn);
    fn({
      status: this.status,
      lastSavedAt: this.lastSavedAt,
      message: this.statusMessage
    });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emitStatus(
    status: SaveIndicatorState,
    lastSavedAt: number | null,
    message: string
  ): void {
    this.status = status;
    this.lastSavedAt = lastSavedAt;
    this.statusMessage = message;
    for (const fn of this.listeners) {
      fn({ status, lastSavedAt, message });
    }
  }

  public setSimulateStorageFailure(fail: boolean): void {
    this.simulateStorageUnavailable = fail;
  }

  public hasTabConflict(): boolean {
    return this.tabConflictDetected;
  }

  public clearTabConflict(newRevision: number): void {
    this.tabConflictDetected = false;
    this.knownRevision = newRevision;
  }

  private openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.simulateStorageUnavailable || typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB storage is unavailable in this browser context.'));
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
    });
  }

  private async idbGet(key: string): Promise<string | null> {
    const db = await this.openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(typeof req.result === 'string' ? req.result : null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error || new Error('IDB read error'));
      };
    });
  }

  private async idbPutAtomic(primaryJson: string, backupJson: string | null): Promise<void> {
    const db = await this.openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      if (backupJson) {
        store.put(backupJson, 'backup');
      }
      store.put(primaryJson, 'primary');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('IDB write transaction failed'));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error('IDB write transaction aborted'));
      };
    });
  }

  public async saveGame(state: GameState, forceOverwriteConflict = false): Promise<boolean> {
    if (this.tabConflictDetected && !forceOverwriteConflict) {
      this.emitStatus(
        'conflict',
        this.lastSavedAt,
        'Save paused: Another tab has newer progress. Reload or click Save Now to overwrite.'
      );
      return false;
    }

    this.emitStatus('saving', this.lastSavedAt, 'Saving…');

    if (this.simulateStorageUnavailable) {
      this.emitStatus(
        'error',
        this.lastSavedAt,
        'Storage Error: Local browser storage is unavailable or blocked!'
      );
      return false;
    }

    try {
      state.saveRevision = Math.max(this.knownRevision + 1, (state.saveRevision || 0) + 1);
      state.lastSavedAt = Date.now();
      const serialized = JSON.stringify(state);

      // Read current valid primary save to rotate into backup
      let previousValidPrimary: string | null = null;
      try {
        const currentRaw = await this.idbGet('primary');
        if (currentRaw) {
          const parsed = JSON.parse(currentRaw);
          if (validateAndMigrateSave(parsed)) {
            previousValidPrimary = currentRaw;
          }
        }
      } catch {
        // Ignore if primary wasn't present or was invalid
      }

      let wroteToIdb = false;
      try {
        await this.idbPutAtomic(serialized, previousValidPrimary ?? serialized);
        wroteToIdb = true;
      } catch {
        wroteToIdb = false;
      }

      let wroteToLs = false;
      try {
        if (typeof localStorage !== 'undefined') {
          if (previousValidPrimary) {
            localStorage.setItem(LS_BACKUP_KEY, previousValidPrimary);
          } else if (!localStorage.getItem(LS_BACKUP_KEY)) {
            localStorage.setItem(LS_BACKUP_KEY, serialized);
          }
          localStorage.setItem(LS_PRIMARY_KEY, serialized);
          wroteToLs = true;
        }
      } catch {
        wroteToLs = false;
      }

      if (!wroteToIdb && !wroteToLs) {
        throw new Error('Both IndexedDB and localStorage writes failed.');
      }

      this.knownRevision = state.saveRevision;
      this.tabConflictDetected = false;
      const timeStr = new Date(state.lastSavedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      this.emitStatus('saved', state.lastSavedAt, `Saved • ${timeStr}`);

      if (this.channel) {
        try {
          this.channel.postMessage({
            type: 'SAVE_WRITTEN',
            tabId: this.tabId,
            revision: state.saveRevision,
            timestamp: state.lastSavedAt
          });
        } catch {
          // Ignore broadcast errors
        }
      }

      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to write to local storage';
      this.emitStatus('error', this.lastSavedAt, `Save Failed: ${msg}`);
      return false;
    }
  }

  public async loadGame(): Promise<LoadResult> {
    if (this.simulateStorageUnavailable) {
      return {
        state: null,
        meta: null,
        recoveredFromBackup: false,
        error: 'Browser local storage is currently unavailable or disabled.'
      };
    }

    let primaryRaw: string | null = null;
    let backupRaw: string | null = null;

    try {
      primaryRaw = await this.idbGet('primary');
      backupRaw = await this.idbGet('backup');
    } catch {
      // Fallback to localStorage mirror if IndexedDB open failed
    }

    try {
      if (!primaryRaw && typeof localStorage !== 'undefined') {
        primaryRaw = localStorage.getItem(LS_PRIMARY_KEY);
      }
      if (!backupRaw && typeof localStorage !== 'undefined') {
        backupRaw = localStorage.getItem(LS_BACKUP_KEY);
      }
    } catch {
      // Ignore LS errors
    }

    if (!primaryRaw && !backupRaw) {
      return { state: null, meta: null, recoveredFromBackup: false };
    }

    // 1. Try Primary Save
    if (primaryRaw) {
      try {
        const parsed = JSON.parse(primaryRaw);
        const validated = validateAndMigrateSave(parsed);
        if (validated) {
          this.knownRevision = validated.saveRevision;
          this.lastSavedAt = validated.lastSavedAt;
          const timeStr = new Date(validated.lastSavedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          this.emitStatus('saved', validated.lastSavedAt, `Saved • ${timeStr}`);
          return {
            state: validated,
            meta: extractSaveMeta(validated),
            recoveredFromBackup: false
          };
        }
      } catch {
        // Primary is malformed JSON -> fall through to backup recovery!
      }
    }

    // 2. Primary was corrupted/invalid: Attempt Recovery from Last-Known-Good Backup!
    if (backupRaw) {
      try {
        const parsedBackup = JSON.parse(backupRaw);
        const validatedBackup = validateAndMigrateSave(parsedBackup);
        if (validatedBackup) {
          this.knownRevision = validatedBackup.saveRevision;
          await this.saveGame(validatedBackup, true);
          return {
            state: validatedBackup,
            meta: extractSaveMeta(validatedBackup),
            recoveredFromBackup: true,
            error:
              'Primary save data was corrupted; automatically restored your farm from the last-known-good backup!'
          };
        }
      } catch {
        // Backup also corrupted
      }
    }

    this.emitStatus('error', null, 'Corrupted save data detected');
    return {
      state: null,
      meta: null,
      recoveredFromBackup: false,
      error: 'Saved farm data was corrupted and could not be restored. You may start a New Game or import a save file.'
    };
  }

  public async deleteAllSaves(): Promise<boolean> {
    try {
      if (!this.simulateStorageUnavailable && typeof indexedDB !== 'undefined') {
        const db = await this.openIdb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, 'readwrite');
          const store = tx.objectStore(IDB_STORE);
          store.delete('primary');
          store.delete('backup');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        });
      }
    } catch {
      // Continue to clear localStorage mirror
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LS_PRIMARY_KEY);
        localStorage.removeItem(LS_BACKUP_KEY);
      }
    } catch {
      // Ignore
    }

    this.knownRevision = 0;
    this.tabConflictDetected = false;
    this.emitStatus('idle', null, 'Save data cleared');
    return true;
  }

  public exportSaveToJson(state: GameState): string {
    const wrapper = {
      app: 'SPUDSTEAD_ARGON',
      exportedAt: new Date().toISOString(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
      payload: state
    };
    return JSON.stringify(wrapper);
  }

  public async importSaveFromJson(
    jsonString: string
  ): Promise<{ ok: boolean; state?: GameState; message: string }> {
    if (!jsonString || typeof jsonString !== 'string' || jsonString.trim().length === 0) {
      return { ok: false, message: 'Import failed: Save file is empty.' };
    }
    try {
      const raw = JSON.parse(jsonString);
      const validated = validateAndMigrateSave(raw);
      if (!validated) {
        return {
          ok: false,
          message:
            'Import failed: Save file failed schema validation (missing or invalid farm fields).'
        };
      }
      const saved = await this.saveGame(validated, true);
      if (!saved) {
        return {
          ok: false,
          message: 'Save file was valid, but browser storage could not persist it.'
        };
      }
      return {
        ok: true,
        state: validated,
        message: `Successfully imported "${validated.farmName}" (Year ${validated.calendar.year}, ${validated.calendar.season.toUpperCase()} Day ${validated.calendar.dayOfSeason})!`
      };
    } catch {
      return {
        ok: false,
        message: 'Import failed: File is not valid JSON.'
      };
    }
  }

  /**
   * Test helper to corrupt only the primary save slot (for verifying backup recovery in E2E tests).
   */
  public async corruptPrimarySaveForTest(): Promise<void> {
    const broken = '{corrupted_json_payload:::false';
    try {
      const db = await this.openIdb();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(broken, 'primary');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    } catch {
      // Ignore
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LS_PRIMARY_KEY, broken);
      }
    } catch {
      // Ignore
    }
  }
}
