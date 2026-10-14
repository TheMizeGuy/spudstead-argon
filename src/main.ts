import './styles.css';
import { AudioManager } from './audio/audioManager';
import { NPCS, PLOT_INFO } from './data/content';
import { Direction, GameState, NpcId, ToolId } from './data/types';
import { SaveManager } from './persistence/saveManager';
import { WorldRenderer } from './render/renderer';
import {
  advanceSimulationHours,
  buyAndPlaceMachine,
  buyUpgrade,
  createNewGameState,
  hasUpgrade,
  performTileAction,
  tickSimulation
} from './sim/simulation';
import {
  LANDMARKS,
  MAP_HEIGHT,
  MAP_WIDTH,
  getTileAt,
  isTileWalkable
} from './sim/worldMap';
import { UiManager } from './ui/uiManager';

class SpudsteadGameApp {
  private canvas: HTMLCanvasElement;
  private renderer: WorldRenderer;
  private saveManager: SaveManager;
  private audio: AudioManager;
  private ui: UiManager;
  private state: GameState;

  private keysPressed: Set<string> = new Set();
  private walkTarget: { x: number; y: number; actOnArrival: boolean } | null = null;
  private dirtySinceLastSave = false;
  private saveInFlight = false;
  private autosaveAccumSec = 0;
  private lastFrameTime = performance.now();
  private lastActionTimestamp = 0;

  constructor() {
    const appRoot = document.getElementById('app')!;
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    this.state = createNewGameState('Spudstead Acres');
    this.saveManager = new SaveManager();
    this.audio = new AudioManager();
    this.audio.init();
    this.renderer = new WorldRenderer(this.canvas);

    this.ui = new UiManager(appRoot, this.renderer, this.saveManager, this.audio, {
      getState: () => this.state,
      setState: (newState: GameState) => {
        this.state = newState;
        this.audio.applySettings(this.state.settings, this.state.calendar.weather);
      },
      startNewGame: async (farmName: string) => {
        this.state = createNewGameState(farmName);
        this.audio.applySettings(this.state.settings, this.state.calendar.weather);
        this.ui.enterGameplayHud();
        await this.triggerSave('new_game_init', true);
      },
      continueSavedGame: async () => {
        const res = await this.saveManager.loadGame();
        if (res.state) {
          this.state = res.state;
        }
        this.audio.applySettings(this.state.settings, this.state.calendar.weather);
        this.ui.enterGameplayHud();
        if (res.recoveredFromBackup && res.error) {
          this.ui.showToast({ ok: true, message: res.error, kind: 'warning' });
        }
      },
      triggerSave: (reason: string, forceOverwrite = false) =>
        this.triggerSave(reason, forceOverwrite),
      performActionAt: (tx: number, ty: number) => this.executeTileAction(tx, ty),
      movePlayerStep: (dir: Direction) => this.nudgePlayer(dir, 0.55),
      interactNearest: () => this.interactWithNearestLandmark()
    });

    this.bindInputEvents();
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    // Load existing save without ever overwriting it with default new-game state
    const loadResult = await this.saveManager.loadGame();
    if (loadResult.state) {
      this.state = loadResult.state;
      this.audio.applySettings(this.state.settings, this.state.calendar.weather);
    }
    this.ui.renderTitleScreen(loadResult);

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  public async triggerSave(_reason: string, forceOverwrite = false): Promise<boolean> {
    if (this.saveInFlight && !forceOverwrite) {
      this.dirtySinceLastSave = true;
      return false;
    }
    this.saveInFlight = true;
    this.dirtySinceLastSave = false;
    const ok = await this.saveManager.saveGame(this.state, forceOverwrite);
    this.saveInFlight = false;
    return ok;
  }

  private bindInputEvents(): void {
    window.addEventListener('resize', () => {
      this.renderer.resize();
    });

    // Visibility change checkpoint & auto-pause
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && !this.ui.isTitleScreenOpen()) {
        this.triggerSave('visibility_hidden');
      } else {
        this.lastFrameTime = performance.now();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.ui.isTitleScreenOpen()) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        this.keysPressed.add(key);
        this.walkTarget = null;
        return;
      }

      if (e.key === 'Escape') {
        if (this.ui.getPlacementBuildType()) {
          this.ui.clearPlacementBuildMode();
        } else if (this.ui.isModalOpen()) {
          this.ui.closeModal();
        } else {
          this.ui.openModal('settings');
        }
        return;
      }

      if (this.ui.isModalOpen()) return;

      const toolMap: Record<string, ToolId> = {
        '1': 'spade',
        '2': 'hoe',
        '3': 'watering_can',
        '4': 'fork',
        '5': 'pouch'
      };
      if (toolMap[e.key]) {
        this.state.player.selectedTool = toolMap[e.key];
        this.ui.clearPlacementBuildMode();
        this.audio.playSfx('ui');
        this.ui.updateHud();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        this.ui.cyclePouchItem();
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        this.state.settings.timeSpeed = this.state.settings.timeSpeed === 0 ? 1 : 0;
        this.audio.playSfx('ui');
        this.ui.updateHud();
        return;
      }

      if (key === 'e') {
        e.preventDefault();
        const p = this.state.player;
        const dx = p.facing === 'left' ? -1 : p.facing === 'right' ? 1 : 0;
        const dy = p.facing === 'up' ? -1 : p.facing === 'down' ? 1 : 0;
        this.executeTileAction(Math.round(p.x) + dx, Math.round(p.y) + dy);
        return;
      }

      if (key === 'f') {
        e.preventDefault();
        this.interactWithNearestLandmark();
        return;
      }

      if (key === 'm') this.ui.openModal('shop');
      else if (key === 'i') this.ui.openModal('backpack');
      else if (key === 'j') this.ui.openModal('quests');
      else if (key === 'b') this.ui.openBuildMenuModal();
      else if (key === 'k') this.ui.openModal('almanac');
      else if (key === 'h') this.ui.openModal('tutorial');
      else if (key === 'n') this.ui.openModal('day_summary');
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.key.toLowerCase());
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (this.ui.isTitleScreenOpen() || this.ui.isModalOpen()) return;
      const coord = this.renderer.screenToTile(e.clientX, e.clientY);
      this.renderer.setHoverTile(coord);
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.ui.isTitleScreenOpen() || this.ui.isModalOpen()) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const coord = this.renderer.screenToTile(e.clientX, e.clientY);
      this.renderer.setHoverTile(coord);
      this.handleCanvasTileClick(coord.x, coord.y);
    });
  }

  private handleCanvasTileClick(tx: number, ty: number): void {
    if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return;

    // 1. Check if in Build Placement Mode
    const buildType = this.ui.getPlacementBuildType();
    if (buildType) {
      const fb = buyAndPlaceMachine(this.state, buildType, tx, ty);
      this.audio.playSfx(fb.sfx || 'ui');
      this.ui.showToast(fb);
      if (fb.ok) {
        this.renderer.spawnActionParticles(tx, ty, 'dig', this.state.settings.reducedMotion);
        this.ui.clearPlacementBuildMode();
        this.ui.updateHud();
        this.triggerSave('place_machine');
      }
      return;
    }

    // 2. Check if clicking an NPC
    for (const npcId of ['barnaby', 'mireille', 'mossy'] as NpcId[]) {
      const npc = NPCS[npcId];
      if (Math.abs(tx - npc.x) <= 0 && Math.abs(ty - npc.y) <= 0) {
        this.ui.openModal('quests', { npcId });
        return;
      }
    }

    // 3. Check if clicking a placed processing machine
    const machine = this.state.machines.find(
      (m) => m.x === tx && m.y === ty && m.type !== 'sprinkler'
    );
    if (machine) {
      this.ui.openModal('machine', { machineId: machine.id });
      return;
    }

    // 4. Check if clicking a Landmark (Farmhouse, Cellar, Shop, Market, Well, Festival Plinth, Aid Barrel, Plot Sign)
    for (const lm of LANDMARKS) {
      if (tx >= lm.x && tx < lm.x + lm.width && ty >= lm.y && ty < lm.y + lm.height) {
        if (lm.kind === 'farmhouse') {
          this.ui.openModal('day_summary');
          return;
        }
        if (lm.kind === 'cellar') {
          this.ui.openModal('backpack');
          return;
        }
        if (lm.kind === 'shop') {
          this.ui.openModal('shop', { shopTab: 'seeds' });
          return;
        }
        if (lm.kind === 'market') {
          this.ui.openModal('shop', { shopTab: 'sell' });
          return;
        }
        if (lm.kind === 'festival_plinth') {
          this.ui.openModal('almanac');
          return;
        }
        if (lm.kind === 'community_aid') {
          this.ui.openModal('quests', { npcId: 'mossy' });
          return;
        }
        if (lm.kind === 'well') {
          this.state.player.water = this.state.player.maxWater;
          this.audio.playSfx('water');
          this.renderer.spawnActionParticles(tx, ty, 'water', this.state.settings.reducedMotion);
          this.ui.showToast({
            ok: true,
            message: `Refilled Watering Can (${this.state.player.water}/${this.state.player.maxWater})!`,
            kind: 'success'
          });
          this.ui.updateHud();
          return;
        }
        if (lm.kind === 'plot_sign' && lm.plotId) {
          const pInfo = PLOT_INFO[lm.plotId];
          if (pInfo.unlockUpgrade && !this.state.unlockedPlots.includes(lm.plotId)) {
            const fb = buyUpgrade(this.state, pInfo.unlockUpgrade);
            this.audio.playSfx(fb.sfx || 'ui');
            this.ui.showToast(fb);
            this.ui.updateHud();
            if (fb.ok) this.triggerSave('unlock_plot');
          } else {
            this.ui.openModal('shop', { shopTab: 'upgrades' });
          }
          return;
        }
      }
    }

    // 5. Otherwise, check distance to tile: if in range, perform tool action; if out of range, walk toward it!
    const dist = Math.hypot(tx - this.state.player.x, ty - this.state.player.y);
    const tile = getTileAt(this.state.tiles, tx, ty);

    if (tile && tile.terrain === 'water') {
      // Refill water if reasonably close, or walk to pond edge
      if (dist <= 3.5) {
        this.executeTileAction(tx, ty);
      } else {
        this.walkTarget = { x: 5, y: 10, actOnArrival: true };
      }
      return;
    }

    if (dist <= 2.45) {
      if (
        tile &&
        (tile.terrain === 'farm_soil' || tile.debris !== 'none')
      ) {
        this.executeTileAction(tx, ty);
      } else if (isTileWalkable(this.state.tiles, tx, ty, this.state.unlockedPlots)) {
        this.walkTarget = { x: tx, y: ty, actOnArrival: false };
      }
    } else {
      const shouldAct = Boolean(
        tile && (tile.terrain === 'farm_soil' || tile.debris !== 'none')
      );
      this.walkTarget = { x: tx, y: ty, actOnArrival: shouldAct };
    }
  }

  private resolveSmartActionTile(defaultTx: number, defaultTy: number): { x: number; y: number } {
    const p = this.state.player;
    const px = Math.round(p.x);
    const py = Math.round(p.y);

    const isGoodTarget = (x: number, y: number): boolean => {
      const tile = getTileAt(this.state.tiles, x, y);
      if (!tile) return false;
      if (tile.plotId && !this.state.unlockedPlots.includes(tile.plotId)) return false;

      if (p.selectedTool === 'fork') {
        return Boolean(tile.crop && tile.crop.stage === 4);
      }
      if (p.selectedTool === 'pouch') {
        if (p.selectedItemId.startsWith('seed_')) {
          return (
            tile.terrain === 'farm_soil' &&
            tile.tilled &&
            !tile.crop &&
            tile.debris === 'none' &&
            !tile.machineId
          );
        }
        if (p.selectedItemId === 'supply_compost') {
          return tile.terrain === 'farm_soil' && tile.fertility < 95;
        }
        if (p.selectedItemId === 'supply_tonic') {
          return Boolean(tile.crop && (tile.crop.hasPests || tile.crop.stressScore > 0));
        }
      }
      if (p.selectedTool === 'watering_can') {
        return (
          tile.terrain === 'water' ||
          (tile.terrain === 'farm_soil' && tile.tilled && tile.moisture < 92)
        );
      }
      if (p.selectedTool === 'hoe') {
        return (
          tile.debris === 'weeds' ||
          Boolean(
            tile.crop &&
              (tile.crop.hasWeeds ||
                (tile.crop.stage >= 1 && tile.crop.stage <= 3 && tile.crop.hillLevel < 2))
          )
        );
      }
      if (p.selectedTool === 'spade') {
        return (
          tile.debris !== 'none' ||
          (tile.terrain === 'farm_soil' && !tile.tilled && !tile.crop && !tile.machineId)
        );
      }
      return false;
    };

    if (isGoodTarget(defaultTx, defaultTy)) {
      return { x: defaultTx, y: defaultTy };
    }

    const candidates: { x: number; y: number }[] = [
      { x: px, y: py },
      { x: px, y: py + 1 },
      { x: px + 1, y: py },
      { x: px - 1, y: py },
      { x: px, y: py - 1 },
      { x: px + 1, y: py + 1 },
      { x: px - 1, y: py + 1 },
      { x: px + 1, y: py - 1 },
      { x: px - 1, y: py - 1 }
    ];

    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - defaultTx, a.y - defaultTy) -
        Math.hypot(b.x - defaultTx, b.y - defaultTy)
    );

    if (p.selectedTool === 'watering_can') {
      const cropCandidate = candidates.find((c) => {
        const t = getTileAt(this.state.tiles, c.x, c.y);
        return Boolean(t && t.crop && t.moisture < 92);
      });
      if (cropCandidate) return cropCandidate;
    }

    for (const c of candidates) {
      if (isGoodTarget(c.x, c.y)) {
        return c;
      }
    }

    return { x: defaultTx, y: defaultTy };
  }

  private executeTileAction(rawTx: number, rawTy: number): void {
    // Prevent duplicate rapid-fire triggers within 90ms
    const now = performance.now();
    if (now - this.lastActionTimestamp < 90) return;
    this.lastActionTimestamp = now;

    const { x: tx, y: ty } = this.resolveSmartActionTile(rawTx, rawTy);
    const fb = performTileAction(this.state, tx, ty);
    if (fb.sfx) {
      this.audio.playSfx(fb.sfx);
    } else {
      this.audio.playSfx('ui');
    }

    if (fb.ok) {
      const pKind =
        fb.sfx === 'water'
          ? 'water'
          : fb.sfx === 'harvest'
            ? 'harvest'
            : fb.sfx === 'plant'
              ? 'plant'
              : fb.sfx === 'hill'
                ? 'hill'
                : 'dig';
      this.renderer.spawnActionParticles(tx, ty, pKind, this.state.settings.reducedMotion);
      this.renderer.spawnFloatingText(
        tx,
        ty,
        fb.message.length > 36 ? fb.message.slice(0, 36) + '…' : fb.message,
        fb.sfx === 'harvest' ? '#ffe066' : '#ffffff'
      );
      if (fb.sfx === 'harvest' || fb.sfx === 'dig') {
        this.renderer.triggerShake(2.8, 0.12, this.state.settings.screenShake);
      }
      if (fb.sfx === 'dig' && this.state.tutorialStep === 2) {
        this.state.tutorialStep = 3;
      } else if (fb.sfx === 'plant' && (this.state.tutorialStep === 2 || this.state.tutorialStep === 3)) {
        this.state.tutorialStep = 4;
      } else if ((fb.sfx === 'water' || fb.sfx === 'hill') && this.state.tutorialStep === 4) {
        this.state.tutorialStep = 5;
      }
      this.dirtySinceLastSave = true;
      // Save immediately after important farming actions (planting, harvesting, clearing)
      if (fb.sfx === 'harvest' || fb.sfx === 'plant' || fb.sfx === 'hill') {
        this.triggerSave(`action_${fb.sfx}`);
      }
    }

    this.ui.showToast(fb);
    this.ui.updateHud(getTileAt(this.state.tiles, tx, ty));
  }

  private interactWithNearestLandmark(): void {
    const px = this.state.player.x;
    const py = this.state.player.y;

    // Check nearby machines first
    for (const m of this.state.machines) {
      if (m.type !== 'sprinkler' && Math.hypot(m.x - px, m.y - py) <= 2.5) {
        this.ui.openModal('machine', { machineId: m.id });
        return;
      }
    }

    // Check nearby NPCs
    for (const npcId of ['barnaby', 'mireille', 'mossy'] as NpcId[]) {
      const npc = NPCS[npcId];
      if (Math.hypot(npc.x - px, npc.y - py) <= 2.8) {
        this.ui.openModal('quests', { npcId });
        return;
      }
    }

    // Check nearby landmarks
    for (const lm of LANDMARKS) {
      if (Math.hypot(lm.interactX - px, lm.interactY - py) <= 2.8) {
        this.handleCanvasTileClick(lm.x, lm.y);
        return;
      }
    }

    // Default to Shop if nothing is right beside the player
    this.ui.openModal('shop');
  }

  private nudgePlayer(dir: Direction, stepDist: number): void {
    const p = this.state.player;
    p.facing = dir;
    p.action = 'walk';
    p.actionTimer = 0.2;

    const dx = dir === 'left' ? -stepDist : dir === 'right' ? stepDist : 0;
    const dy = dir === 'up' ? -stepDist : dir === 'down' ? stepDist : 0;

    const nx = p.x + dx;
    const ny = p.y + dy;
    if (isTileWalkable(this.state.tiles, Math.round(nx), Math.round(ny), this.state.unlockedPlots)) {
      p.x = nx;
      p.y = ny;
      this.dirtySinceLastSave = true;
    }
  }

  private updatePlayerMovement(dt: number): void {
    let moveX = 0;
    let moveY = 0;
    if (this.keysPressed.has('a') || this.keysPressed.has('arrowleft')) moveX -= 1;
    if (this.keysPressed.has('d') || this.keysPressed.has('arrowright')) moveX += 1;
    if (this.keysPressed.has('w') || this.keysPressed.has('arrowup')) moveY -= 1;
    if (this.keysPressed.has('s') || this.keysPressed.has('arrowdown')) moveY += 1;

    const speed = 5.2 * (hasUpgrade(this.state, 'boots_1') ? 1.2 : 1.0);
    const p = this.state.player;

    if (moveX !== 0 || moveY !== 0) {
      const len = Math.hypot(moveX, moveY);
      const vx = (moveX / len) * speed * dt;
      const vy = (moveY / len) * speed * dt;

      if (Math.abs(moveX) >= Math.abs(moveY)) {
        p.facing = moveX > 0 ? 'right' : 'left';
      } else {
        p.facing = moveY > 0 ? 'down' : 'up';
      }
      p.action = 'walk';
      p.actionTimer = 0.15;

      const nextX = p.x + vx;
      const nextY = p.y + vy;
      if (isTileWalkable(this.state.tiles, Math.round(nextX), Math.round(p.y), this.state.unlockedPlots)) {
        p.x = nextX;
        this.dirtySinceLastSave = true;
      }
      if (isTileWalkable(this.state.tiles, Math.round(p.x), Math.round(nextY), this.state.unlockedPlots)) {
        p.y = nextY;
        this.dirtySinceLastSave = true;
      }
      return;
    }

    if (this.walkTarget) {
      const dx = this.walkTarget.x - p.x;
      const dy = this.walkTarget.y - p.y;
      const dist = Math.hypot(dx, dy);

      const stopDist = this.walkTarget.actOnArrival ? 1.65 : 0.25;
      if (dist <= stopDist) {
        const target = this.walkTarget;
        this.walkTarget = null;
        p.action = 'idle';
        if (target.actOnArrival) {
          this.executeTileAction(target.x, target.y);
        }
      } else {
        const vx = (dx / dist) * speed * dt;
        const vy = (dy / dist) * speed * dt;
        if (Math.abs(dx) >= Math.abs(dy)) {
          p.facing = dx > 0 ? 'right' : 'left';
        } else {
          p.facing = dy > 0 ? 'down' : 'up';
        }
        p.action = 'walk';
        p.actionTimer = 0.15;

        const nextX = p.x + vx;
        const nextY = p.y + vy;
        let moved = false;
        if (isTileWalkable(this.state.tiles, Math.round(nextX), Math.round(p.y), this.state.unlockedPlots)) {
          p.x = nextX;
          moved = true;
        }
        if (isTileWalkable(this.state.tiles, Math.round(p.x), Math.round(nextY), this.state.unlockedPlots)) {
          p.y = nextY;
          moved = true;
        }
        if (!moved) {
          this.walkTarget = null;
          p.action = 'idle';
        } else {
          this.dirtySinceLastSave = true;
        }
      }
    }
  }

  private loop(now: number): void {
    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(0.1, Math.max(0, rawDt));

    if (!this.ui.isTitleScreenOpen() && !document.hidden) {
      if (!this.ui.isModalOpen()) {
        this.updatePlayerMovement(dt);
        const res = tickSimulation(this.state, dt);
        if (res.dayEnded) {
          this.ui.openModal('day_summary');
        }

        // Periodic 15-second autosave while progress is changing
        this.autosaveAccumSec += dt;
        if (this.autosaveAccumSec >= 15) {
          this.autosaveAccumSec = 0;
          if (this.dirtySinceLastSave || this.state.settings.timeSpeed > 0) {
            this.triggerSave('periodic_15s');
          }
        }
      }

      const hover = this.renderer.getHoverTile();
      const hoverTile = hover ? getTileAt(this.state.tiles, hover.x, hover.y) : null;
      this.ui.updateHud(hoverTile);
    }

    this.renderer.render(this.state, dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  public getTestApi() {
    return {
      getState: () => this.state,
      saveManager: this.saveManager,
      ui: this.ui,
      advanceHours: (hours: number) => {
        advanceSimulationHours(this.state, hours, false);
        this.ui.updateHud();
      },
      triggerSave: (reason = 'test') => this.triggerSave(reason, true),
      corruptPrimarySave: () => this.saveManager.corruptPrimarySaveForTest(),
      setSimulateStorageFailure: (fail: boolean) =>
        this.saveManager.setSimulateStorageFailure(fail)
    };
  }
}

declare global {
  interface Window {
    __SPUDSTEAD__?: ReturnType<SpudsteadGameApp['getTestApi']>;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new SpudsteadGameApp();
  window.__SPUDSTEAD__ = app.getTestApi();
});
