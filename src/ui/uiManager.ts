import { AudioManager } from '../audio/audioManager';
import {
  ACHIEVEMENTS,
  MACHINE_BLUEPRINTS,
  MACHINE_RECIPES,
  NPCS,
  POTATO_VARIETIES,
  QUALITY_LABELS,
  QUESTS,
  SUPPLIES,
  TOOLS,
  UPGRADES,
  VARIETY_ORDER
} from '../data/content';
import {
  ActionFeedback,
  Direction,
  GameState,
  MachineType,
  NpcId,
  SoilTile,
  ToolId,
  UpgradeId
} from '../data/types';
import { LoadResult, SaveManager, SaveStatusEvent } from '../persistence/saveManager';
import { WorldRenderer } from '../render/renderer';
import {
  buyShopItem,
  buyUpgrade,
  claimCommunityAid,
  claimQuestReward,
  collectMachineOutput,
  fulfillDailyOrder,
  getEffectiveSellPrice,
  getFestivalPillars,
  getQuestProgress,
  hostGoldenSpudFestival,
  inspectTileCrop,
  sellInventoryItem,
  sleepToNextDay,
  startMachineRecipe,
  transferBetweenBackpackAndCellar
} from '../sim/simulation';
import { getTileAt } from '../sim/worldMap';
import { IconName, icon } from './icons';

export type ActiveModalType =
  | null
  | 'shop'
  | 'backpack'
  | 'quests'
  | 'almanac'
  | 'machine'
  | 'day_summary'
  | 'settings'
  | 'credits'
  | 'tutorial';

export interface TutorialStepDef {
  stepIndex: number;
  title: string;
  instruction: string;
  detail: string;
  keyHint: string;
}

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    stepIndex: 0,
    title: 'Step 1 of 6: Explore Your 3D Homestead',
    instruction:
      'Use WASD or Arrow Keys (or click any 3D tile) to walk down to the mature potato ridges in your Homestead Field.',
    detail:
      'Your character physically explores the 3D farmstead. Walk south from the Farmhouse courtyard into the fenced Homestead Field.',
    keyHint: 'WASD / Arrows / Click Tile'
  },
  {
    stepIndex: 1,
    title: 'Step 2 of 6: Harvest Mature Potato Ridges',
    instruction:
      'Equip the Harvest Fork (Key 4) and press E (or click a glowing golden ridge) to lift your starter Yukon Sunburst tubers.',
    detail:
      'Old Mossy left three Stage 5 mature ridges ready for lifting. Harvesting adds graded tubers to your Field Backpack.',
    keyHint: 'Key 4 (Fork) + Key E / Click'
  },
  {
    stepIndex: 2,
    title: 'Step 3 of 6: Clear Debris & Till Furrows',
    instruction:
      'Equip the Garden Spade (Key 1) and press E on untidy or empty farm soil to clear rocks/weeds and till a planting furrow.',
    detail:
      'Cleared weeds become Field Mulch for your Compost Tumbler. Tilled soil forms 3D furrows ready to receive seed potatoes.',
    keyHint: 'Key 1 (Spade) + Key E'
  },
  {
    stepIndex: 3,
    title: 'Step 4 of 6: Plant Chitted Seed Potatoes',
    instruction:
      'Equip the Seed Pouch (Key 5 — press Tab to cycle seeds/compost) and press E on a tilled furrow to plant a seed tuber.',
    detail:
      'Each of the 6 potato varieties has distinct growth speed, seasonal preference, moisture window, and yield.',
    keyHint: 'Key 5 (Pouch) + Tab + Key E'
  },
  {
    stepIndex: 4,
    title: 'Step 5 of 6: Water & Earth Up (Hill) Ridges',
    instruction:
      'Use the Watering Can (Key 3) to moisten planted furrows, and use the Hilling Hoe (Key 2) on growing sprouts to mound 3D soil ridges.',
    detail:
      'Hilling growing potato plants up to Hill 2/2 protects tubers from sunlight, increases yield, and boosts care toward Artisan [Tier III] quality!',
    keyHint: 'Key 3 (Water) & Key 2 (Hoe)'
  },
  {
    stepIndex: 5,
    title: 'Step 6 of 6: Sell Harvest, Upgrade & Automate',
    instruction:
      'Open Shop & Sell (M) to sell harvested potatoes and buy tool upgrades, or open Build (B) to place 3D Rotary Sprinklers!',
    detail:
      'Reinvest profits into upgraded tools, land deeds, processing stations, and automated sprinklers on your journey to the Golden Spud Festival.',
    keyHint: 'Key M (Shop) / Key B (Build)'
  }
];

export interface GameControllerCallbacks {
  getState: () => GameState;
  setState: (newState: GameState) => void;
  startNewGame: (farmName: string) => Promise<void>;
  continueSavedGame: () => Promise<void>;
  triggerSave: (reason: string, forceOverwrite?: boolean) => Promise<boolean>;
  performActionAt: (tx: number, ty: number) => void;
  movePlayerStep: (dir: Direction) => void;
  interactNearest: () => void;
}

export class UiManager {
  private root: HTMLElement;
  private renderer: WorldRenderer;
  private saveManager: SaveManager;
  private audio: AudioManager;
  private cb: GameControllerCallbacks;

  private inTitleScreen = true;
  private activeModal: ActiveModalType = null;
  private shopTab: 'seeds' | 'sell' | 'upgrades' = 'seeds';
  private almanacTab: 'festival' | 'varieties' | 'achievements' = 'festival';
  private activeNpcId: NpcId = 'barnaby';
  private activeMachineId: string | null = null;
  private placementBuildType: MachineType | null = null;

  // Cached DOM references for fast non-rebuilding HUD updates
  private titleContainer!: HTMLElement;
  private hudLayer!: HTMLElement;
  private calTextEl!: HTMLElement;
  private weatherTextEl!: HTMLElement;
  private goldTextEl!: HTMLElement;
  private staminaFillEl!: HTMLElement;
  private staminaLabelEl!: HTMLElement;
  private waterFillEl!: HTMLElement;
  private waterLabelEl!: HTMLElement;
  private saveStatusEl!: HTMLElement;
  private objectiveEl!: HTMLElement;
  private tutorialBannerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private inspectorEl!: HTMLElement;
  private toolbeltEl!: HTMLElement;
  private modalBackdropEl!: HTMLElement;
  private speedBtns: Record<number, HTMLButtonElement> = {};

  private toastTimer: number | null = null;
  private lastHudSignature = '';
  private lastObjectiveSignature = '';
  private lastTutorialStep = -1;
  private lastToolSignature = '';
  private lastInspectorSignature = '';

  constructor(
    root: HTMLElement,
    renderer: WorldRenderer,
    saveManager: SaveManager,
    audio: AudioManager,
    callbacks: GameControllerCallbacks
  ) {
    this.root = root;
    this.renderer = renderer;
    this.saveManager = saveManager;
    this.audio = audio;
    this.cb = callbacks;

    this.buildDomStructure();
    this.saveManager.onStatusChange((ev) => this.updateSaveIndicator(ev));
  }

  public isTitleScreenOpen(): boolean {
    return this.inTitleScreen;
  }

  public isModalOpen(): boolean {
    return this.activeModal !== null;
  }

  public getPlacementBuildType(): MachineType | null {
    return this.placementBuildType;
  }

  public clearPlacementBuildMode(): void {
    this.placementBuildType = null;
    this.renderer.setPlacementMode(null);
    this.lastHudSignature = '';
  }

  private buildDomStructure(): void {
    // Title Screen Container
    this.titleContainer = document.createElement('div');
    this.titleContainer.className = 'title-screen';
    this.titleContainer.id = 'title-screen';
    this.root.appendChild(this.titleContainer);

    // HUD Layer
    this.hudLayer = document.createElement('div');
    this.hudLayer.className = 'hud-layer';
    this.hudLayer.style.display = 'none';
    this.hudLayer.innerHTML = `
      <div class="hud-top">
        <div class="hud-plaque hud-status-card" id="hud-status-card">
          <div class="hud-calendar-row">
            <span id="hud-cal-text">SPRING • DAY 1 (YR 1) • 07:30 AM</span>
            <div class="speed-controls" role="group" aria-label="Time Speed">
              <button class="speed-btn" data-speed="0" title="Pause (Space)">${icon('pause', 11)}</button>
              <button class="speed-btn active" data-speed="1" title="Normal Speed">1x</button>
              <button class="speed-btn" data-speed="2" title="Brisk Speed">2x</button>
              <button class="speed-btn" data-speed="4" title="Fast Speed">4x</button>
            </div>
          </div>
          <div class="hud-weather-row" id="hud-weather-text">
            <span>${icon('sun', 14)} Sunny</span>
            <span>Tomorrow: ${icon('rain', 14)} Rainy</span>
          </div>
          <div class="hud-meters-row">
            <span class="gold-pill" id="hud-gold-text" data-testid="hud-gold">${icon('coin', 14)} 120g</span>
            <div class="meter-group">
              <div class="meter-bar" title="Stamina">
                <div class="meter-fill stamina" id="hud-stamina-fill" style="width: 100%"></div>
                <div class="meter-label" id="hud-stamina-label">${icon('stamina', 12)} 100/100</div>
              </div>
              <div class="meter-bar" title="Watering Can">
                <div class="meter-fill water" id="hud-water-fill" style="width: 100%"></div>
                <div class="meter-label" id="hud-water-label">${icon('water', 12)} 12/12</div>
              </div>
            </div>
          </div>
          <div class="save-status-line">
            <span id="hud-save-indicator" class="save-indicator" data-testid="save-indicator">Ready</span>
            <button class="btn btn-wood btn-sm" id="hud-btn-save-now" data-testid="hud-save-btn" style="padding:2px 8px;min-height:24px;font-size:11px;">${icon('save', 12)} Save Now</button>
          </div>
        </div>

        <div class="hud-right-col">
          <div class="objective-banner" id="hud-objective" data-testid="hud-objective"></div>
          <div class="objective-banner" id="hud-tutorial-banner" data-testid="tutorial-banner" style="background:rgba(24, 52, 28, 0.94);border-color:#74c67a;"></div>
          <div class="hud-nav-buttons">
            <button class="btn btn-primary btn-sm" id="nav-btn-shop" data-testid="nav-shop">${icon('shop', 13)} Shop & Sell (M)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-pack" data-testid="nav-pack">${icon('pack', 13)} Pack & Cellar (I)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-quests" data-testid="nav-quests">${icon('quests', 13)} Quests & Town (J)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-build" data-testid="nav-build">${icon('build', 13)} Build (B)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-almanac" data-testid="nav-almanac">${icon('trophy', 13)} Festival & Almanac (K)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-tutorial" data-testid="nav-tutorial">${icon('book', 13)} Tutorial (H)</button>
            <button class="btn btn-success btn-sm" id="nav-btn-sleep" data-testid="nav-sleep">${icon('sleep', 13)} Sleep (N)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-settings" data-testid="nav-settings">${icon('settings', 13)} Settings</button>
          </div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="toast-banner" id="hud-toast" data-testid="hud-toast" style="opacity:0"></div>
        <div class="crop-inspector-card" id="hud-inspector" data-testid="hud-inspector" style="display:none"></div>

        <div class="touch-controls-row" id="touch-controls">
          <div class="touch-dpad" aria-label="Movement D-Pad">
            <div></div>
            <button class="dpad-btn" data-dir="up" aria-label="Move Up">${icon('arrow-up', 14)}</button>
            <div></div>
            <button class="dpad-btn" data-dir="left" aria-label="Move Left">${icon('arrow-left', 14)}</button>
            <div style="display:flex;align-items:center;justify-content:center;font-size:10px;color:#ffe285;font-weight:800;">MOVE</div>
            <button class="dpad-btn" data-dir="right" aria-label="Move Right">${icon('arrow-right', 14)}</button>
            <div></div>
            <button class="dpad-btn" data-dir="down" aria-label="Move Down">${icon('arrow-down', 14)}</button>
            <div></div>
          </div>
          <div class="touch-action-pad">
            <button class="btn btn-primary touch-act-btn" id="touch-btn-use" data-testid="touch-use-tool">${icon('spade', 14)} Use Tool</button>
            <button class="btn btn-wood touch-act-btn" id="touch-btn-interact" data-testid="touch-interact">${icon('quests', 14)} Interact</button>
          </div>
        </div>

        <div class="toolbelt-bar" id="hud-toolbelt" data-testid="hud-toolbelt"></div>
      </div>
    `;
    this.root.appendChild(this.hudLayer);

    // Modal Backdrop
    this.modalBackdropEl = document.createElement('div');
    this.modalBackdropEl.className = 'modal-backdrop';
    this.modalBackdropEl.style.display = 'none';
    this.modalBackdropEl.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (ev.target === this.modalBackdropEl && this.activeModal !== 'day_summary') {
        this.closeModal();
      }
    });
    this.root.appendChild(this.modalBackdropEl);

    // Query cached HUD elements
    this.calTextEl = this.hudLayer.querySelector('#hud-cal-text')!;
    this.weatherTextEl = this.hudLayer.querySelector('#hud-weather-text')!;
    this.goldTextEl = this.hudLayer.querySelector('#hud-gold-text')!;
    this.staminaFillEl = this.hudLayer.querySelector('#hud-stamina-fill')!;
    this.staminaLabelEl = this.hudLayer.querySelector('#hud-stamina-label')!;
    this.waterFillEl = this.hudLayer.querySelector('#hud-water-fill')!;
    this.waterLabelEl = this.hudLayer.querySelector('#hud-water-label')!;
    this.saveStatusEl = this.hudLayer.querySelector('#hud-save-indicator')!;
    this.objectiveEl = this.hudLayer.querySelector('#hud-objective')!;
    this.tutorialBannerEl = this.hudLayer.querySelector('#hud-tutorial-banner')!;
    this.toastEl = this.hudLayer.querySelector('#hud-toast')!;
    this.inspectorEl = this.hudLayer.querySelector('#hud-inspector')!;
    this.toolbeltEl = this.hudLayer.querySelector('#hud-toolbelt')!;

    this.hudLayer.querySelectorAll<HTMLButtonElement>('.speed-btn').forEach((btn) => {
      const spd = Number(btn.dataset.speed) as 0 | 1 | 2 | 4;
      this.speedBtns[spd] = btn;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const st = this.cb.getState();
        st.settings.timeSpeed = spd;
        this.audio.playSfx('ui');
        this.updateHud();
      });
    });

    this.hudLayer.querySelector('#hud-btn-save-now')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.audio.playSfx('ui');
      const ok = await this.cb.triggerSave('manual_hud_button', true);
      if (ok) {
        this.showToast({ ok: true, message: 'Farm progress saved to browser storage!', kind: 'success' });
      }
    });

    this.hudLayer.querySelector('#nav-btn-shop')!.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = this.cb.getState();
      if (st.tutorialStep === 5) st.tutorialStep = 6;
      this.openModal('shop');
    });
    this.hudLayer.querySelector('#nav-btn-pack')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('backpack');
    });
    this.hudLayer.querySelector('#nav-btn-quests')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('quests');
    });
    this.hudLayer.querySelector('#nav-btn-build')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openBuildMenuModal();
    });
    this.hudLayer.querySelector('#nav-btn-almanac')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('almanac');
    });
    this.hudLayer.querySelector('#nav-btn-tutorial')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('tutorial');
    });
    this.hudLayer.querySelector('#nav-btn-sleep')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('day_summary');
    });
    this.hudLayer.querySelector('#nav-btn-settings')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openModal('settings');
    });

    // Touch D-Pad & Action Buttons
    this.hudLayer.querySelectorAll<HTMLButtonElement>('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir as Direction;
      btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.cb.movePlayerStep(dir);
      });
    });

    this.hudLayer.querySelector('#touch-btn-use')!.addEventListener('click', (e) => {
      e.stopPropagation();
      const st = this.cb.getState();
      const dx = st.player.facing === 'left' ? -1 : st.player.facing === 'right' ? 1 : 0;
      const dy = st.player.facing === 'up' ? -1 : st.player.facing === 'down' ? 1 : 0;
      this.cb.performActionAt(Math.round(st.player.x) + dx, Math.round(st.player.y) + dy);
    });

    this.hudLayer.querySelector('#touch-btn-interact')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.cb.interactNearest();
    });
  }

  public renderTitleScreen(loadResult: LoadResult): void {
    this.inTitleScreen = true;
    this.titleContainer.style.display = 'flex';
    this.titleContainer.style.backgroundImage = `linear-gradient(180deg, rgba(22, 12, 6, 0.38) 0%, rgba(22, 12, 6, 0.82) 100%), url('./assets/art/title-banner.jpg')`;
    this.hudLayer.style.display = 'none';

    const meta = loadResult.meta;
    const savedTimeStr = meta
      ? new Date(meta.lastSavedAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      : '';

    this.titleContainer.innerHTML = `
      <div class="title-card" role="dialog" aria-label="SPUDSTEAD Title Screen">
        <div class="title-badge">3D Specialty-Potato Farming Simulator</div>
        <h1 class="title-logo">SPUDSTEAD</h1>
        <p class="title-subtitle">From Overgrown Patch to Golden Tuber Estate</p>

        ${
          loadResult.error
            ? `<div style="background:#5c1b16;color:#ffd8d6;border:2px solid #ff8a80;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px;font-weight:700;" data-testid="title-storage-notice">
                ${icon('warning', 14)} ${this.escapeHtml(loadResult.error)}
              </div>`
            : ''
        }

        ${
          meta
            ? `<div class="continue-banner" data-testid="continue-banner">
                <div class="continue-banner-header">
                  <span>${icon('sprout', 15)} ${this.escapeHtml(meta.farmName)}</span>
                  <span style="color:#8c5308;">${icon('coin', 14)} ${meta.gold}g</span>
                </div>
                <div class="continue-banner-meta">
                  Year ${meta.year} • ${meta.season.toUpperCase()} Day ${meta.dayOfSeason} &nbsp;|&nbsp; Last Saved: ${savedTimeStr}
                </div>
                <button class="btn btn-success" id="title-btn-continue" data-testid="btn-continue" style="width:100%;font-size:16px;">
                  ${icon('play', 14)} Continue Saved Farm
                </button>
              </div>`
            : ''
        }

        <div class="title-actions">
          <div style="display:flex;gap:8px;align-items:center;">
            <input
              id="title-farm-name"
              data-testid="input-farm-name"
              type="text"
              maxlength="32"
              value="Spudstead Acres"
              aria-label="Farm Name"
              style="flex:1;padding:10px 12px;border-radius:10px;border:2px solid #c69852;background:#f8eed9;color:#26160a;font-weight:700;font-size:14px;"
            />
            <button class="btn btn-primary" id="title-btn-new" data-testid="btn-new-game" style="min-width:155px;">
              ${icon('sprout', 14)} New Game
            </button>
          </div>

          <div class="title-row-actions">
            <button class="btn btn-wood" id="title-btn-tutorial" data-testid="btn-title-tutorial">${icon('book', 14)} Tutorial</button>
            <button class="btn btn-wood" id="title-btn-import" data-testid="btn-title-import">${icon('import', 14)} Import Save</button>
            <button class="btn btn-wood" id="title-btn-settings" data-testid="btn-title-settings">${icon('settings', 14)} Settings</button>
            <button class="btn btn-wood" id="title-btn-credits" data-testid="btn-title-credits">${icon('star', 14)} Credits</button>
          </div>
        </div>

        <p style="font-size:11.5px;color:#d8c29d;margin:14px 0 0;line-height:1.35;">
          Saves are stored automatically in this browser profile (IndexedDB + backup slot). Use Export Save in Settings to back up or transfer your farm.
        </p>
      </div>
    `;

    const continueBtn = this.titleContainer.querySelector('#title-btn-continue');
    if (continueBtn) {
      continueBtn.addEventListener('click', async () => {
        this.audio.unlock();
        this.audio.playSfx('fanfare');
        await this.cb.continueSavedGame();
      });
    }

    this.titleContainer.querySelector('#title-btn-new')!.addEventListener('click', async () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
      const nameInput = this.titleContainer.querySelector('#title-farm-name') as HTMLInputElement;
      const farmName = nameInput?.value.trim() || 'Spudstead Acres';

      if (meta) {
        this.openConfirmModal(
          'Replace Existing Saved Farm?',
          `Starting a New Game will replace your saved progress on "${meta.farmName}" (Year ${meta.year}, ${meta.season.toUpperCase()} Day ${meta.dayOfSeason}, ${meta.gold}g). Are you sure?`,
          'Start New Farm',
          async () => {
            await this.cb.startNewGame(farmName);
          }
        );
      } else {
        await this.cb.startNewGame(farmName);
      }
    });

    this.titleContainer.querySelector('#title-btn-tutorial')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
      this.openModal('tutorial');
    });

    this.titleContainer.querySelector('#title-btn-import')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
      this.openImportModal();
    });

    this.titleContainer.querySelector('#title-btn-settings')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
      this.openModal('settings');
    });

    this.titleContainer.querySelector('#title-btn-credits')!.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playSfx('ui');
      this.openModal('credits');
    });
  }

  public enterGameplayHud(): void {
    this.inTitleScreen = false;
    this.titleContainer.style.display = 'none';
    this.hudLayer.style.display = 'flex';
    this.lastHudSignature = '';
    this.lastObjectiveSignature = '';
    this.lastTutorialStep = -1;
    this.lastToolSignature = '';
    this.updateHud();
  }

  public updateSaveIndicator(ev: SaveStatusEvent): void {
    if (!this.saveStatusEl) return;
    this.saveStatusEl.className = `save-indicator ${ev.status}`;
    this.saveStatusEl.textContent = ev.message;
    this.saveStatusEl.dataset.status = ev.status;
  }

  public showToast(feedback: ActionFeedback): void {
    if (!this.toastEl) return;
    this.toastEl.textContent = feedback.message;
    this.toastEl.className = `toast-banner ${feedback.kind}`;
    this.toastEl.style.opacity = '1';
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.style.opacity = '0';
    }, 3200);
  }

  public updateHud(inspectedTile?: SoilTile | null): void {
    if (this.inTitleScreen) return;
    const state = this.cb.getState();
    const cal = state.calendar;
    const p = state.player;

    // Auto-advance contextual tutorial step based on player actions
    if (state.tutorialStep === 0 && p.y >= 7 && p.x >= 9 && p.x <= 17) {
      state.tutorialStep = 1;
    }
    if (state.tutorialStep === 1 && state.stats.totalHarvested >= 1) {
      state.tutorialStep = 2;
    }
    if (state.tutorialStep === 4 && state.stats.totalHilled >= 1) {
      state.tutorialStep = 5;
    }

    const wholeHour = Math.floor(cal.hour);
    const mins = Math.floor((cal.hour - wholeHour) * 60);
    const ampm = wholeHour >= 12 ? 'PM' : 'AM';
    const dispHour = wholeHour > 12 ? wholeHour - 12 : wholeHour === 0 ? 12 : wholeHour;
    const clockStr = `${String(dispHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;

    const weatherIcons: Record<typeof cal.weather, string> = {
      sunny: `${icon('sun', 13)} Sunny`,
      breezy: `${icon('breeze', 13)} Breezy`,
      rainy: `${icon('rain', 13)} Rainy (Auto-Waters!)`,
      stormy: `${icon('storm', 13)} Heavy Rain`,
      frosty: `${icon('frost', 13)} Frosty`
    };

    const nextQuest = QUESTS.find((q) => !state.completedQuests.includes(q.id));
    const questProg = nextQuest ? getQuestProgress(state, nextQuest.id) : null;

    const sig = [
      cal.season,
      cal.dayOfSeason,
      cal.year,
      clockStr,
      cal.weather,
      cal.tomorrowWeather,
      p.gold,
      Math.round(p.stamina),
      p.maxStamina,
      p.water,
      p.maxWater,
      state.settings.timeSpeed
    ].join('|');

    if (sig !== this.lastHudSignature) {
      this.lastHudSignature = sig;
      this.calTextEl.textContent = `${cal.season.toUpperCase()} • DAY ${cal.dayOfSeason} (YR ${cal.year}) • ${clockStr}`;
      this.weatherTextEl.innerHTML = `
        <span>${weatherIcons[cal.weather]}</span>
        <span>Forecast: ${weatherIcons[cal.tomorrowWeather]}</span>
      `;
      this.goldTextEl.innerHTML = `${icon('coin', 14)} ${p.gold}g`;

      const stamPct = Math.max(0, Math.min(100, (p.stamina / p.maxStamina) * 100));
      this.staminaFillEl.style.width = `${stamPct}%`;
      this.staminaLabelEl.innerHTML = `${icon('stamina', 11)} ${Math.round(p.stamina)}/${p.maxStamina}`;

      const waterPct = Math.max(0, Math.min(100, (p.water / p.maxWater) * 100));
      this.waterFillEl.style.width = `${waterPct}%`;
      this.waterLabelEl.innerHTML = `${icon('water', 11)} ${p.water}/${p.maxWater}`;

      for (const spd of [0, 1, 2, 4]) {
        const btn = this.speedBtns[spd];
        if (btn) {
          btn.classList.toggle('active', state.settings.timeSpeed === spd);
        }
      }
    }

    const objSig = [
      this.placementBuildType || '',
      nextQuest?.id || 'done',
      questProg?.current || 0,
      questProg?.ready ? '1' : '0',
      state.festival.won ? '1' : '0'
    ].join('|');

    if (objSig !== this.lastObjectiveSignature) {
      this.lastObjectiveSignature = objSig;
      if (this.placementBuildType) {
        const bp = MACHINE_BLUEPRINTS[this.placementBuildType];
        this.objectiveEl.innerHTML = `
          <strong>${icon('build', 13)} Placement Mode (${bp.name} - ${bp.cost}g):</strong> Click any green-highlighted unlocked soil or courtyard tile to place, or <button class="btn btn-danger btn-sm" id="cancel-place-btn" style="padding:1px 7px;min-height:22px;">Cancel (Esc)</button>
        `;
        const cancelBtn = this.objectiveEl.querySelector('#cancel-place-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.clearPlacementBuildMode();
          });
        }
      } else if (nextQuest && questProg) {
        this.objectiveEl.innerHTML = `
          <strong>${icon('quests', 13)} ${nextQuest.title} (${questProg.current}/${questProg.target}):</strong> ${nextQuest.description}
          ${questProg.ready ? `<button class="btn btn-success btn-sm" id="hud-claim-quest-btn" data-testid="hud-claim-quest" style="margin-left:6px;padding:2px 8px;min-height:24px;">${icon('coin', 12)} Claim ${nextQuest.rewardGold}g</button>` : ''}
        `;
        const claimBtn = this.objectiveEl.querySelector('#hud-claim-quest-btn');
        if (claimBtn) {
          claimBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const fb = claimQuestReward(state, nextQuest.id);
            this.audio.playSfx(fb.sfx || 'fanfare');
            this.showToast(fb);
            this.lastObjectiveSignature = '';
            this.lastHudSignature = '';
            this.updateHud();
            await this.cb.triggerSave('quest_reward');
          });
        }
      } else {
        this.objectiveEl.innerHTML = state.festival.won
          ? `<strong>${icon('trophy', 13)} Golden Spud Laureate:</strong> Sandbox Mode active — expand your estate & enjoy Spudstead!`
          : `<strong>${icon('trophy', 13)} Golden Spud Festival:</strong> Open Festival & Almanac (K) to check the 5 Festival Pillars!`;
      }
    }

    // Interactive Step-by-Step Tutorial Banner (only rebuilt when tutorialStep changes)
    if (state.tutorialStep !== this.lastTutorialStep) {
      this.lastTutorialStep = state.tutorialStep;
      const tutStep = TUTORIAL_STEPS[state.tutorialStep];
      if (!tutStep) {
        this.tutorialBannerEl.style.display = 'none';
      } else {
        this.tutorialBannerEl.style.display = 'block';
        this.tutorialBannerEl.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px;">
            <strong style="color:#a7f3d0;">${icon('book', 13)} ${tutStep.title}</strong>
            <span style="font-size:10.5px;background:rgba(255,255,255,0.14);padding:1px 6px;border-radius:4px;color:#fef08a;">${tutStep.keyHint}</span>
          </div>
          <div style="font-size:11.5px;color:#f0fdf4;margin-bottom:5px;">${tutStep.instruction}</div>
          <div style="display:flex;gap:6px;justify-content:flex-end;">
            <button class="btn btn-wood btn-sm" id="tut-guide-btn" data-testid="tutorial-guide-btn" style="padding:1px 7px;min-height:20px;font-size:10.5px;">Full Guide</button>
            <button class="btn btn-primary btn-sm" id="tut-next-btn" data-testid="tutorial-next-btn" style="padding:1px 7px;min-height:20px;font-size:10.5px;">Next Step</button>
            <button class="btn btn-wood btn-sm" id="tut-skip-btn" data-testid="tutorial-skip-btn" style="padding:1px 7px;min-height:20px;font-size:10.5px;">Dismiss</button>
          </div>
        `;
        this.tutorialBannerEl.querySelector('#tut-guide-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openModal('tutorial');
        });
        this.tutorialBannerEl.querySelector('#tut-next-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          state.tutorialStep = Math.min(TUTORIAL_STEPS.length, state.tutorialStep + 1);
          this.audio.playSfx('ui');
          this.lastTutorialStep = -1;
          this.updateHud();
        });
        this.tutorialBannerEl.querySelector('#tut-skip-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          state.tutorialStep = TUTORIAL_STEPS.length;
          this.audio.playSfx('ui');
          this.lastTutorialStep = -1;
          this.updateHud();
        });
      }
    }

    // Update Toolbelt if tool or selected pouch item changed
    const selectedItem = state.inventory.find((i) => i.itemId === p.selectedItemId);
    const toolSig = `${p.selectedTool}|${p.selectedItemId}|${selectedItem?.quantity || 0}|${state.upgrades.join(',')}`;
    if (toolSig !== this.lastToolSignature) {
      this.lastToolSignature = toolSig;
      this.renderToolbelt(state);
    }

    // Update Crop Inspector Card
    const targetTile =
      inspectedTile ||
      getTileAt(
        state.tiles,
        Math.round(p.x) + (p.facing === 'left' ? -1 : p.facing === 'right' ? 1 : 0),
        Math.round(p.y) + (p.facing === 'up' ? -1 : p.facing === 'down' ? 1 : 0)
      );
    const info = targetTile ? inspectTileCrop(state, targetTile) : null;
    const inspSig = info
      ? `${info.title}|${info.stageLabel}|${info.maturityText}|${info.moisturePct}|${info.fertilityPct}|${info.hillLevel}|${info.projectedGrade}`
      : 'none';

    if (inspSig !== this.lastInspectorSignature) {
      this.lastInspectorSignature = inspSig;
      if (!info) {
        this.inspectorEl.style.display = 'none';
      } else {
        this.inspectorEl.style.display = 'block';
        this.inspectorEl.innerHTML = `
          <div class="crop-inspector-header">
            <span>${icon('sprout', 13)} ${info.title} — ${info.stageLabel}</span>
            <span>${icon('water', 12)} ${info.moisturePct}% | Fert ${info.fertilityPct}% | Hill ${info.hillLevel}/2 | Est: ${QUALITY_LABELS[info.projectedGrade]}</span>
          </div>
          <div style="color:#d7f5c6;margin-bottom:2px;">${icon('clock', 12)} <strong>When:</strong> ${info.maturityText}</div>
          <div style="color:#ffe0b2;">${icon('tip', 12)} <strong>Care & Next Step:</strong> ${info.needsText} • ${info.improvementText}</div>
        `;
      }
    }
  }

  private renderToolbelt(state: GameState): void {
    const p = state.player;
    const toolIconNames: Record<ToolId, IconName> = {
      spade: 'spade',
      hoe: 'hoe',
      watering_can: 'watering_can',
      fork: 'fork',
      pouch: 'pouch'
    };

    const toolButtonsHtml = (['spade', 'hoe', 'watering_can', 'fork', 'pouch'] as ToolId[])
      .map((tId) => {
        const tDef = TOOLS[tId];
        const active = p.selectedTool === tId;
        return `
          <button
            class="tool-slot ${active ? 'active' : ''}"
            data-tool="${tId}"
            data-testid="tool-${tId}"
            title="${tDef.name}: ${tDef.description}"
          >
            <span class="tool-hotkey">${tDef.hotkey}</span>
            <span class="tool-icon">${icon(toolIconNames[tId], 18)}</span>
            <span>${tId === 'watering_can' ? 'Water' : tId === 'pouch' ? 'Pouch' : tDef.name.split(' ').pop()}</span>
          </button>
        `;
      })
      .join('');

    const pouchItems = state.inventory.filter(
      (i) => (i.category === 'seed' || i.category === 'supply') && i.quantity > 0
    );
    const activePouchItem =
      pouchItems.find((i) => i.itemId === p.selectedItemId) || pouchItems[0];

    this.toolbeltEl.innerHTML = `
      ${toolButtonsHtml}
      <div class="pouch-selector" id="pouch-cycle-btn" data-testid="pouch-selector" title="Click to cycle Seed / Compost in Pouch">
        <div>
          <div style="font-size:10px;color:#6e4726;text-transform:uppercase;">Active Pouch Item (Tab)</div>
          <div>${activePouchItem ? `${this.escapeHtml(activePouchItem.name)} (x${activePouchItem.quantity})` : 'Empty (Buy Seeds)'}</div>
        </div>
        <span>${icon('cycle', 15)}</span>
      </div>
    `;

    this.toolbeltEl.querySelectorAll<HTMLButtonElement>('.tool-slot').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tId = btn.dataset.tool as ToolId;
        state.player.selectedTool = tId;
        this.clearPlacementBuildMode();
        this.audio.playSfx('ui');
        this.updateHud();
      });
    });

    const cycleBtn = this.toolbeltEl.querySelector('#pouch-cycle-btn');
    if (cycleBtn) {
      cycleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cyclePouchItem();
      });
    }
  }

  public cyclePouchItem(): void {
    const state = this.cb.getState();
    const pouchItems = state.inventory.filter(
      (i) => (i.category === 'seed' || i.category === 'supply') && i.quantity > 0
    );
    if (pouchItems.length === 0) {
      this.showToast({
        ok: false,
        message: "No seeds or compost in your backpack! Visit Barnaby's Shop.",
        kind: 'warning'
      });
      return;
    }
    const idx = pouchItems.findIndex((i) => i.itemId === state.player.selectedItemId);
    const next = pouchItems[(idx + 1) % pouchItems.length];
    state.player.selectedItemId = next.itemId;
    state.player.selectedTool = 'pouch';
    this.audio.playSfx('ui');
    this.lastToolSignature = '';
    this.updateHud();
  }

  public openModal(
    type: ActiveModalType,
    options?: { npcId?: NpcId; machineId?: string; shopTab?: 'seeds' | 'sell' | 'upgrades' }
  ): void {
    this.clearPlacementBuildMode();
    this.activeModal = type;
    if (options?.npcId) this.activeNpcId = options.npcId;
    if (options?.machineId) this.activeMachineId = options.machineId;
    if (options?.shopTab) this.shopTab = options.shopTab;

    if (!type) {
      this.modalBackdropEl.style.display = 'none';
      this.modalBackdropEl.innerHTML = '';
      return;
    }

    this.audio.playSfx('ui');
    this.modalBackdropEl.style.display = 'flex';
    this.renderActiveModalContent();
  }

  public closeModal(): void {
    this.activeModal = null;
    this.modalBackdropEl.style.display = 'none';
    this.modalBackdropEl.innerHTML = '';
    this.lastHudSignature = '';
    this.updateHud();
  }

  private renderActiveModalContent(): void {
    if (!this.activeModal) return;
    const state = this.cb.getState();

    if (this.activeModal === 'shop') {
      this.renderShopModal(state);
    } else if (this.activeModal === 'backpack') {
      this.renderBackpackModal(state);
    } else if (this.activeModal === 'quests') {
      this.renderQuestsModal(state);
    } else if (this.activeModal === 'almanac') {
      this.renderAlmanacModal(state);
    } else if (this.activeModal === 'machine') {
      this.renderMachineModal(state);
    } else if (this.activeModal === 'day_summary') {
      this.renderDaySummaryModal(state);
    } else if (this.activeModal === 'settings') {
      this.renderSettingsModal(state);
    } else if (this.activeModal === 'credits') {
      this.renderCreditsModal();
    } else if (this.activeModal === 'tutorial') {
      this.renderTutorialModal(state);
    }
  }

  private renderTutorialModal(state: GameState): void {
    const stepsHtml = TUTORIAL_STEPS.map((step) => {
      const isDone = state.tutorialStep > step.stepIndex;
      const isCurrent = state.tutorialStep === step.stepIndex;
      return `
        <div class="item-card" style="${isCurrent ? 'border-color:#2e7d32;background:#eef9ec;' : isDone ? 'opacity:0.8;' : ''}">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span class="badge ${isDone || isCurrent ? 'badge-season' : ''}">
                ${isDone ? 'Completed' : isCurrent ? 'Current Step' : `Step ${step.stepIndex + 1}`}
              </span>
              <span style="font-size:11px;font-weight:700;color:#6e4726;">${step.keyHint}</span>
            </div>
            <h4 class="item-card-title">${step.title}</h4>
            <p class="item-card-desc" style="margin-top:4px;font-weight:700;color:#2c180a;">${step.instruction}</p>
            <p class="item-card-desc" style="margin-top:4px;">${step.detail}</p>
          </div>
        </div>
      `;
    }).join('');

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Interactive Tutorial and Farming Guide" data-testid="modal-tutorial">
        <div class="modal-header">
          <h2 class="modal-title">${icon('book', 18)} SPUDSTEAD — Interactive Farming Tutorial & 3D Field Guide</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close" aria-label="Close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <strong style="font-size:14px;">The Specialty-Potato Loop:</strong>
              <div style="font-size:12.5px;color:#4e3019;margin-top:2px;">
                Clear Land (Key 1) -> Till Furrow (Key 1) -> Plant Seed (Key 5) -> Water (Key 3) -> Hill Ridge 2x (Key 2) -> Harvest (Key 4) -> Sell / Process / Upgrade!
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-primary btn-sm" id="btn-restart-tutorial" data-testid="btn-restart-tutorial">Restart Step-by-Step Banner</button>
              <button class="btn btn-wood btn-sm" id="btn-complete-tutorial" data-testid="btn-complete-tutorial">Mark All Read</button>
            </div>
          </div>

          <h3 style="margin:0 0 10px;font-size:15px;">Step-by-Step Walkthrough</h3>
          <div class="card-grid" style="margin-bottom:16px;">${stepsHtml}</div>

          <h3 style="margin:0 0 8px;font-size:15px;">Quality Grades & Care Formula</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;font-size:12.5px;line-height:1.5;">
            <div>• <strong>Standard (1.0x Value):</strong> Basic harvest from un-hilled or moisture-stressed soil.</div>
            <div>• <strong>Prime [Tier II] (1.35x Value):</strong> Achieved by keeping moisture in the variety's sweet spot and hilling at least once (Hill 1/2).</div>
            <div>• <strong>Artisan [Tier III] (1.85x Value):</strong> Achieved by combining Rich Compost (Fertility 65%+), double-hilling (Hill 2/2), and steady moisture without weed/pest neglect.</div>
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelector('#btn-restart-tutorial')!.addEventListener('click', () => {
      state.tutorialStep = 0;
      this.audio.playSfx('ui');
      this.renderTutorialModal(state);
      this.lastHudSignature = '';
      this.updateHud();
    });

    this.modalBackdropEl.querySelector('#btn-complete-tutorial')!.addEventListener('click', () => {
      state.tutorialStep = TUTORIAL_STEPS.length;
      this.audio.playSfx('ui');
      this.closeModal();
    });
  }

  private renderShopModal(state: GameState): void {
    const demandVar = POTATO_VARIETIES[state.calendar.dailyDemandVariety];

    let bodyHtml = '';
    if (this.shopTab === 'seeds') {
      const seedCards = VARIETY_ORDER.map((vId) => {
        const v = POTATO_VARIETIES[vId];
        const inSeason = v.preferredSeasons.includes(state.calendar.season);
        const ownedSeeds =
          state.inventory.find((i) => i.itemId === `seed_${vId}`)?.quantity || 0;
        return `
          <div class="item-card" data-testid="shop-seed-${vId}">
            <div>
              <div class="item-card-top">
                <img class="item-card-img" src="./assets/art/icon-${vId}.png" alt="${v.name}" />
                <div>
                  <h4 class="item-card-title">${v.name} Seed</h4>
                  <p class="item-card-sub">${v.subtitle}</p>
                  <span class="badge ${inSeason ? 'badge-season' : ''}">
                    ${inSeason ? `Best in ${state.calendar.season.toUpperCase()}` : `Prefers: ${v.preferredSeasons.join(', ')}`}
                  </span>
                </div>
              </div>
              <p class="item-card-desc" style="margin-top:6px;">
                ${v.description}<br/>
                <strong>Growth:</strong> ${(v.growthHours / 16).toFixed(1)}d &nbsp;|&nbsp;
                <strong>Yield:</strong> ${v.yieldMin}-${v.yieldMax} tubers &nbsp;|&nbsp;
                <strong>Water:</strong> ${v.waterNeedLabel}
              </p>
            </div>
            <div class="item-card-actions">
              <span style="font-weight:800;font-size:13px;">Cost: ${v.seedCost}g <small>(Owned: ${ownedSeeds})</small></span>
              <div style="display:flex;gap:4px;">
                <button class="btn btn-primary btn-sm" data-buy-id="seed_${vId}" data-buy-qty="1" data-testid="buy-seed-${vId}-1">Buy 1 (${v.seedCost}g)</button>
                <button class="btn btn-wood btn-sm" data-buy-id="seed_${vId}" data-buy-qty="3" data-testid="buy-seed-${vId}-3">Buy 3 (${v.seedCost * 3}g)</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      const supplyCards = Object.values(SUPPLIES)
        .map((s) => {
          const owned = state.inventory.find((i) => i.itemId === s.itemId)?.quantity || 0;
          return `
            <div class="item-card" data-testid="shop-supply-${s.itemId}">
              <div>
                <h4 class="item-card-title">${icon('sprout', 14)} ${s.name}</h4>
                <p class="item-card-desc">${s.description}</p>
              </div>
              <div class="item-card-actions">
                <span style="font-weight:800;font-size:13px;">Cost: ${s.buyPrice}g <small>(Owned: ${owned})</small></span>
                <button class="btn btn-primary btn-sm" data-buy-id="${s.itemId}" data-buy-qty="1">Buy 1 (${s.buyPrice}g)</button>
              </div>
            </div>
          `;
        })
        .join('');

      bodyHtml = `
        <h3 style="margin:0 0 10px;font-size:15px;">${icon('sprout', 15)} Specialty Seed Potatoes</h3>
        <div class="card-grid" style="margin-bottom:18px;">${seedCards}</div>
        <h3 style="margin:0 0 10px;font-size:15px;">${icon('compost', 15)} Soil Compost & Fertilizers</h3>
        <div class="card-grid">${supplyCards}</div>
      `;
    } else if (this.shopTab === 'sell') {
      const sellable = state.inventory.filter(
        (i) => i.category === 'crop' || i.category === 'processed' || i.category === 'supply'
      );

      bodyHtml = `
        <div style="background:#efe0c2;border:2px solid #c69852;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span>${icon('star', 14)} <strong>Today's Featured Variety (+25% Price):</strong> ${demandVar.name}</span>
          <span style="font-weight:800;">Your Gold: ${icon('coin', 14)} ${state.player.gold}g</span>
        </div>
        ${
          sellable.length === 0
            ? `<p style="padding:24px;text-align:center;color:#5c3f26;font-weight:700;">No harvested potatoes or artisan goods in your Backpack to sell right now. Harvest mature Stage 5 ridges with the Harvest Fork (Key 4)!</p>`
            : `<div class="card-grid">
                ${sellable
                  .map((item) => {
                    const unitPrice = getEffectiveSellPrice(state, item);
                    const isHot =
                      item.category === 'crop' &&
                      item.varietyId === state.calendar.dailyDemandVariety;
                    return `
                      <div class="item-card" data-testid="sell-card-${item.itemId}">
                        <div>
                          <h4 class="item-card-title">${this.escapeHtml(item.name)} (x${item.quantity})</h4>
                          ${isHot ? `<span class="badge badge-hot">Daily Demand +25%</span>` : ''}
                          <p class="item-card-desc" style="margin-top:4px;">Unit Price: <strong>${unitPrice}g</strong> each</p>
                        </div>
                        <div class="item-card-actions">
                          <button class="btn btn-primary btn-sm" data-sell-id="${item.itemId}" data-sell-qty="1" data-testid="sell-one-${item.itemId}">Sell 1 (+${unitPrice}g)</button>
                          <button class="btn btn-success btn-sm" data-sell-id="${item.itemId}" data-sell-qty="${item.quantity}" data-testid="sell-all-${item.itemId}">Sell All (+${unitPrice * item.quantity}g)</button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>`
        }
      `;
    } else if (this.shopTab === 'upgrades') {
      const upgradeCards = UPGRADES.map((u) => {
        const owned = state.upgrades.includes(u.id);
        const lockedPre = u.prerequisite && !state.upgrades.includes(u.prerequisite);
        return `
          <div class="item-card" data-testid="upgrade-card-${u.id}">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="badge badge-season" style="text-transform:uppercase;">${u.category}</span>
                <span style="font-weight:800;">${owned ? 'Owned' : `${u.cost}g`}</span>
              </div>
              <h4 class="item-card-title" style="margin-top:6px;">${u.name}</h4>
              <p class="item-card-desc">${u.description}</p>
              <p style="font-size:11.5px;color:#1b521e;font-weight:700;margin:6px 0 0;">Effect: ${u.benefitText}</p>
            </div>
            <div class="item-card-actions">
              ${
                owned
                  ? `<button class="btn btn-wood btn-sm" data-testid="buy-upgrade-${u.id}" disabled>Owned / Equipped</button>`
                  : `<button class="btn btn-primary btn-sm" data-upgrade-id="${u.id}" data-testid="buy-upgrade-${u.id}" ${lockedPre ? 'disabled' : ''}>
                      ${lockedPre ? 'Requires Previous Tier' : `Purchase (${u.cost}g)`}
                    </button>`
              }
            </div>
          </div>
        `;
      }).join('');

      bodyHtml = `<div class="card-grid">${upgradeCards}</div>`;
    }

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Shop and Market Stall" data-testid="modal-shop">
        <div class="modal-header">
          <h2 class="modal-title">${icon('shop', 18)} Spudstead Emporium & Market Stall &nbsp;<small style="font-size:14px;color:#fff;">(${icon('coin', 14)} ${state.player.gold}g)</small></h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close" aria-label="Close">${icon('close', 16)}</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.shopTab === 'seeds' ? 'active' : ''}" data-tab="seeds" data-testid="tab-shop-seeds">${icon('sprout', 14)} Buy Seeds & Compost</button>
          <button class="modal-tab ${this.shopTab === 'sell' ? 'active' : ''}" data-tab="sell" data-testid="tab-shop-sell">${icon('coin', 14)} Sell Harvest & Goods</button>
          <button class="modal-tab ${this.shopTab === 'upgrades' ? 'active' : ''}" data-tab="upgrades" data-testid="tab-shop-upgrades">${icon('build', 14)} Upgrades & Land Deeds (${state.upgrades.length}/${UPGRADES.length})</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('.modal-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        this.shopTab = tabBtn.dataset.tab as 'seeds' | 'sell' | 'upgrades';
        this.audio.playSfx('ui');
        this.renderShopModal(state);
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-buy-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.buyId!;
        const qty = Number(btn.dataset.buyQty || 1);
        const fb = buyShopItem(state, itemId, qty);
        this.audio.playSfx(fb.sfx || 'ui');
        this.showToast(fb);
        this.renderShopModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('shop_purchase');
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-sell-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const itemId = btn.dataset.sellId!;
        const qty = Number(btn.dataset.sellQty || 1);
        const fb = sellInventoryItem(state, itemId, qty);
        this.audio.playSfx(fb.sfx || 'coin');
        this.showToast(fb);
        this.renderShopModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('market_sale');
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-upgrade-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uId = btn.dataset.upgradeId as UpgradeId;
        const fb = buyUpgrade(state, uId);
        this.audio.playSfx(fb.sfx || 'fanfare');
        this.showToast(fb);
        this.renderShopModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('upgrade_purchase');
      });
    });
  }

  private renderBackpackModal(state: GameState): void {
    const renderList = (items: GameState['inventory'], from: 'backpack' | 'cellar') => {
      if (items.length === 0) {
        return `<p style="color:#5c3f26;font-style:italic;">Empty.</p>`;
      }
      return `
        <div class="card-grid">
          ${items
            .map((item) => {
              const canEquip = item.category === 'seed' || item.category === 'supply';
              const isEquipped = state.player.selectedItemId === item.itemId;
              return `
                <div class="item-card" data-testid="${from}-item-${item.itemId}">
                  <div>
                    <h4 class="item-card-title">${this.escapeHtml(item.name)} (x${item.quantity})</h4>
                    <p class="item-card-desc">${this.escapeHtml(item.description)}</p>
                  </div>
                  <div class="item-card-actions">
                    <span style="font-size:12px;font-weight:700;">Val: ${item.unitValue}g</span>
                    <div style="display:flex;gap:4px;">
                      ${
                        from === 'backpack' && canEquip
                          ? `<button class="btn ${isEquipped ? 'btn-success' : 'btn-primary'} btn-sm" data-equip-id="${item.itemId}">
                              ${isEquipped ? 'In Pouch' : 'Equip to Pouch'}
                            </button>`
                          : ''
                      }
                      <button class="btn btn-wood btn-sm" data-xfer-from="${from}" data-xfer-id="${item.itemId}" data-xfer-qty="${item.quantity}">
                        ${from === 'backpack' ? 'To Cellar' : 'To Pack'}
                      </button>
                    </div>
                  </div>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    };

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Backpack and Root Cellar" data-testid="modal-backpack">
        <div class="modal-header">
          <h2 class="modal-title">${icon('pack', 18)} Field Backpack (${state.inventory.length}/${state.player.backpackCapacity}) & Root Cellar</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;">${icon('pack', 15)} Field Backpack (${state.inventory.length}/${state.player.backpackCapacity} stacks)</h3>
          ${renderList(state.inventory, 'backpack')}
          <hr style="border:none;border-top:2px solid #c69852;margin:18px 0;" />
          <h3 style="margin:0 0 8px;">Homestead Root Cellar (${state.cellar.length}/60 stacks)</h3>
          ${renderList(state.cellar, 'cellar')}
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-equip-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.player.selectedItemId = btn.dataset.equipId!;
        state.player.selectedTool = 'pouch';
        this.audio.playSfx('ui');
        this.renderBackpackModal(state);
        this.lastToolSignature = '';
        this.updateHud();
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-xfer-id]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const from = btn.dataset.xferFrom as 'backpack' | 'cellar';
        const itemId = btn.dataset.xferId!;
        const qty = Number(btn.dataset.xferQty || 1);
        const fb = transferBetweenBackpackAndCellar(state, from, itemId, qty);
        this.audio.playSfx('ui');
        this.showToast(fb);
        this.renderBackpackModal(state);
        this.lastToolSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('storage_transfer');
      });
    });
  }

  private renderQuestsModal(state: GameState): void {
    const npc = NPCS[this.activeNpcId];
    const greetings = npc.greetings[state.calendar.season];
    const line = greetings[state.calendar.dayOfSeason % greetings.length];
    const tip = npc.tips[state.calendar.totalDays % npc.tips.length];

    const questCards = QUESTS.map((q) => {
      const done = state.completedQuests.includes(q.id);
      const prog = getQuestProgress(state, q.id);
      const giverDef = NPCS[q.giver];
      return `
        <div class="item-card" data-testid="quest-card-${q.id}" style="${done ? 'opacity:0.68;' : ''}">
          <div>
            <div style="display:flex;justify-content:space-between;">
              <span class="badge badge-season">${giverDef.name}</span>
              <span style="font-weight:800;font-size:12px;">${done ? 'Completed' : `${prog.current}/${prog.target}`}</span>
            </div>
            <h4 class="item-card-title" style="margin-top:6px;">${q.title}</h4>
            <p class="item-card-desc">${q.description}</p>
            <p style="font-size:11px;color:#5c3f26;font-style:italic;margin:4px 0 0;">"${q.flavorText}"</p>
          </div>
          <div class="item-card-actions">
            <span style="font-weight:800;font-size:12.5px;">Reward: ${q.rewardGold}g${q.rewardItems ? ' + Supplies' : ''}</span>
            ${
              done
                ? `<button class="btn btn-wood btn-sm" disabled>Claimed</button>`
                : `<button class="btn ${prog.ready ? 'btn-success' : 'btn-wood'} btn-sm" data-claim-quest="${q.id}" data-testid="claim-quest-${q.id}" ${prog.ready ? '' : 'disabled'}>
                    ${prog.ready ? 'Claim Reward!' : 'In Progress'}
                  </button>`
            }
          </div>
        </div>
      `;
    }).join('');

    const orderCards = state.dailyOrders
      .map((order) => {
        const vDef = POTATO_VARIETIES[order.varietyId];
        return `
          <div class="item-card" data-testid="daily-order-${order.id}">
            <div>
              <span class="badge badge-hot">Repeatable Daily Order</span>
              <h4 class="item-card-title" style="margin-top:6px;">${order.title}</h4>
              <p class="item-card-desc">Deliver ${order.quantity}x ${vDef.name} (${QUALITY_LABELS[order.minQuality]} or better).</p>
            </div>
            <div class="item-card-actions">
              <span style="font-weight:800;">Reward: ${order.rewardGold}g</span>
              ${
                order.completed
                  ? `<button class="btn btn-wood btn-sm" disabled>Fulfilled</button>`
                  : `<button class="btn btn-primary btn-sm" data-fulfill-order="${order.id}" data-testid="fulfill-order-${order.id}">Deliver Order</button>`
              }
            </div>
          </div>
        `;
      })
      .join('');

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Town Characters and Quests" data-testid="modal-quests">
        <div class="modal-header">
          <h2 class="modal-title">${icon('quests', 18)} Spudstead Townfolk, Quests & Daily Contracts</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.activeNpcId === 'barnaby' ? 'active' : ''}" data-npc="barnaby">${icon('shop', 13)} Barnaby Root</button>
          <button class="modal-tab ${this.activeNpcId === 'mireille' ? 'active' : ''}" data-npc="mireille">${icon('kitchen', 13)} Chef Mireille</button>
          <button class="modal-tab ${this.activeNpcId === 'mossy' ? 'active' : ''}" data-npc="mossy">${icon('sprout', 13)} Old Mossy</button>
        </div>
        <div class="modal-body">
          <div class="npc-dialogue-box">
            <img class="npc-portrait" src="${npc.portrait}" alt="${npc.name}" />
            <div style="flex:1;">
              <div style="font-weight:800;font-size:16px;color:#3d220e;">${npc.name} — <span style="font-weight:600;color:#6e4726;">${npc.role}</span></div>
              <p style="margin:6px 0;font-size:13.5px;line-height:1.4;">"${line}"</p>
              <div style="font-size:12px;color:#1b521e;font-weight:700;">${icon('tip', 13)} Tip: ${tip}</div>
            </div>
            ${
              this.activeNpcId === 'mossy'
                ? `<button class="btn btn-success btn-sm" id="btn-claim-aid" data-testid="btn-claim-aid">${icon('sprout', 13)} Claim Sprout Aid / Tea</button>`
                : ''
            }
          </div>

          <h3 style="margin:0 0 10px;font-size:15px;">Daily Market Contracts</h3>
          <div class="card-grid" style="margin-bottom:18px;">${orderCards}</div>

          <h3 style="margin:0 0 10px;font-size:15px;">Authored Progression Quests (${state.completedQuests.length}/${QUESTS.length})</h3>
          <div class="card-grid">${questCards}</div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-npc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeNpcId = btn.dataset.npc as NpcId;
        this.audio.playSfx('ui');
        this.renderQuestsModal(state);
      });
    });

    const aidBtn = this.modalBackdropEl.querySelector('#btn-claim-aid');
    if (aidBtn) {
      aidBtn.addEventListener('click', async () => {
        const fb = claimCommunityAid(state);
        this.audio.playSfx(fb.sfx || 'fanfare');
        this.showToast(fb);
        this.renderQuestsModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        await this.cb.triggerSave('community_aid');
      });
    }

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-claim-quest]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const qId = btn.dataset.claimQuest!;
        const fb = claimQuestReward(state, qId);
        this.audio.playSfx(fb.sfx || 'fanfare');
        this.showToast(fb);
        this.renderQuestsModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('quest_reward');
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-fulfill-order]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const oId = btn.dataset.fulfillOrder!;
        const fb = fulfillDailyOrder(state, oId);
        this.audio.playSfx(fb.sfx || 'fanfare');
        this.showToast(fb);
        this.renderQuestsModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('daily_order');
      });
    });
  }

  public openBuildMenuModal(): void {
    const state = this.cb.getState();
    this.activeModal = 'machine';
    this.activeMachineId = null;
    this.modalBackdropEl.style.display = 'flex';

    const bpCards = (['sprinkler', 'composter', 'seed_cutter', 'kitchen'] as MachineType[])
      .map((mType) => {
        const bp = MACHINE_BLUEPRINTS[mType];
        const count = state.machines.filter((m) => m.type === mType).length;
        return `
          <div class="item-card" data-testid="build-card-${mType}">
            <div>
              <h4 class="item-card-title">${icon('build', 14)} ${bp.name}</h4>
              <p class="item-card-desc">${bp.description}</p>
              <p style="font-size:11.5px;color:#5c3f26;margin:6px 0 0;"><strong>Rule:</strong> ${bp.operatingRule}</p>
            </div>
            <div class="item-card-actions">
              <span style="font-weight:800;">Cost: ${bp.cost}g <small>(On Farm: ${count})</small></span>
              <button class="btn btn-primary btn-sm" data-start-place="${mType}" data-testid="place-btn-${mType}">
                Place on Map (${bp.cost}g)
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    const existingList = state.machines
      .filter((m) => m.type !== 'sprinkler')
      .map((m) => {
        const bp = MACHINE_BLUEPRINTS[m.type];
        const status = m.outputItem
          ? `Output Ready: ${m.outputItem.quantity}x ${m.outputItem.name}`
          : m.activeRecipeId
            ? `Processing (${m.progressHours.toFixed(1)}/${m.durationHours}h)`
            : 'Idle — Ready for input';
        return `
          <div class="item-card">
            <div>
              <h4 class="item-card-title">${bp.name} at (${m.x}, ${m.y})</h4>
              <p class="item-card-desc">${status}</p>
            </div>
            <div class="item-card-actions">
              <button class="btn btn-wood btn-sm" data-open-machine="${m.id}" data-testid="open-machine-${m.id}">Open Station</button>
            </div>
          </div>
        `;
      })
      .join('');

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Build and Processing Stations" data-testid="modal-build">
        <div class="modal-header">
          <h2 class="modal-title">${icon('build', 18)} Farm Infrastructure & Processing Stations (${icon('coin', 14)} ${state.player.gold}g)</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;">Place New Infrastructure</h3>
          <div class="card-grid" style="margin-bottom:18px;">${bpCards}</div>
          <h3 style="margin:0 0 8px;">Active Processing Stations on Farm</h3>
          <div class="card-grid">${existingList}</div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-start-place]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mType = btn.dataset.startPlace as MachineType;
        this.closeModal();
        this.placementBuildType = mType;
        this.renderer.setPlacementMode(mType);
        this.lastHudSignature = '';
        this.updateHud();
      });
    });

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-open-machine]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.openModal('machine', { machineId: btn.dataset.openMachine! });
      });
    });
  }

  private renderMachineModal(state: GameState): void {
    const machine =
      state.machines.find((m) => m.id === this.activeMachineId) ||
      state.machines.find((m) => m.type !== 'sprinkler');
    if (!machine) {
      this.openBuildMenuModal();
      return;
    }

    const bp = MACHINE_BLUEPRINTS[machine.type];
    const recipes = MACHINE_RECIPES.filter((r) => r.machineType === machine.type);

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="${bp.name}" data-testid="modal-machine">
        <div class="modal-header">
          <h2 class="modal-title">${icon('settings', 18)} ${bp.name}</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-tabs">
          ${state.machines
            .filter((m) => m.type !== 'sprinkler')
            .map(
              (m) => `
              <button class="modal-tab ${m.id === machine.id ? 'active' : ''}" data-switch-mach="${m.id}" data-testid="tab-mach-${m.type}">
                ${MACHINE_BLUEPRINTS[m.type].name} ${m.outputItem ? '[Ready]' : m.activeRecipeId ? '[Busy]' : ''}
              </button>
            `
            )
            .join('')}
        </div>
        <div class="modal-body">
          <p style="margin:0 0 12px;font-size:13px;">${bp.operatingRule}</p>

          ${
            machine.outputItem
              ? `<div style="background:#d9f7be;border:2px solid #389e0d;border-radius:12px;padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
                  <div>
                    <strong>Batch Complete:</strong> ${machine.outputItem.quantity}x ${this.escapeHtml(machine.outputItem.name)}
                  </div>
                  <button class="btn btn-success" id="btn-collect-machine" data-testid="btn-collect-machine">
                    ${icon('check', 14)} Collect Output
                  </button>
                </div>`
              : machine.activeRecipeId
                ? `<div style="background:#fff1b8;border:2px solid #d48806;border-radius:12px;padding:14px;margin-bottom:14px;">
                    <strong>Processing in progress:</strong> ${machine.progressHours.toFixed(1)} / ${machine.durationHours} in-game hours elapsed.
                  </div>`
                : ''
          }

          <h3 style="margin:0 0 10px;font-size:15px;">Available Recipes</h3>
          <div class="card-grid">
            ${recipes
              .map(
                (r) => `
                <div class="item-card" data-testid="recipe-card-${r.id}">
                  <div>
                    <h4 class="item-card-title">${r.name}</h4>
                    <p class="item-card-desc">${r.description}</p>
                    <p style="font-size:11.5px;color:#5c3f26;margin:4px 0 0;">
                      ${icon('clock', 12)} Time: ${r.durationHours}h &nbsp;|&nbsp; Output Value: ${r.outputBaseValue}g each
                    </p>
                  </div>
                  <div class="item-card-actions">
                    <button
                      class="btn btn-primary btn-sm"
                      data-start-recipe="${r.id}"
                      data-testid="start-recipe-${r.id}"
                      ${machine.activeRecipeId || machine.outputItem ? 'disabled' : ''}
                    >
                      ${icon('play', 12)} Start Batch
                    </button>
                  </div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-switch-mach]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeMachineId = btn.dataset.switchMach!;
        this.audio.playSfx('ui');
        this.renderMachineModal(state);
      });
    });

    const collectBtn = this.modalBackdropEl.querySelector('#btn-collect-machine');
    if (collectBtn) {
      collectBtn.addEventListener('click', async () => {
        const fb = collectMachineOutput(state, machine.id);
        this.audio.playSfx(fb.sfx || 'harvest');
        this.showToast(fb);
        this.renderMachineModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('machine_collect');
      });
    }

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-start-recipe]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const rId = btn.dataset.startRecipe!;
        const fb = startMachineRecipe(state, machine.id, rId);
        this.audio.playSfx(fb.sfx || 'ui');
        this.showToast(fb);
        this.renderMachineModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('machine_start');
      });
    });
  }

  private renderAlmanacModal(state: GameState): void {
    const pillars = getFestivalPillars(state);
    const allPillarsDone = pillars.every((p) => p.done);

    let bodyHtml = '';
    if (this.almanacTab === 'festival') {
      bodyHtml = `
        <div style="background:linear-gradient(180deg,#3a2212,#26150a);color:#ffe285;border:3px solid #c69852;border-radius:14px;padding:16px;margin-bottom:14px;">
          <h3 style="margin:0 0 6px;font-size:18px;">${icon('trophy', 18)} The Golden Spud Festival</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#f6ead2;line-height:1.4;">
            Complete all 5 Festival Pillars to host the Valley Judging, earn the gleaming 3D Golden Spud Trophy on your estate plinth (+1,000g Grand Prize), and unlock Laureate Sandbox honors!
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            ${pillars
              .map(
                (p) => `
                <div style="background:rgba(255,255,255,0.08);border:1px solid #c69852;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
                  <span>${p.done ? icon('check', 14) : icon('clock', 14)} ${p.label}</span>
                  <strong>${p.current} / ${p.target}</strong>
                </div>
              `
              )
              .join('')}
          </div>
          ${
            state.festival.won
              ? `<div style="background:#2e7d32;color:#fff;padding:10px;border-radius:8px;font-weight:800;text-align:center;" data-testid="festival-won-banner">
                  ${icon('trophy', 15)} Crowned Golden Spud Champion on Day ${state.festival.wonOnDay}! Your 3D trophy shines in the courtyard.
                </div>`
              : `<button class="btn btn-primary" id="btn-host-festival" data-testid="btn-host-festival" style="width:100%;font-size:15px;" ${allPillarsDone ? '' : 'disabled'}>
                  ${allPillarsDone ? 'Host the Golden Spud Festival Judging!' : 'Complete All 5 Pillars Above to Host Festival'}
                </button>`
          }
        </div>
      `;
    } else if (this.almanacTab === 'varieties') {
      bodyHtml = `
        <div class="card-grid">
          ${VARIETY_ORDER.map((vId) => {
            const v = POTATO_VARIETIES[vId];
            const count = state.stats.varietiesHarvested[vId] || 0;
            const best = state.stats.bestQualityByVariety[vId];
            return `
              <div class="item-card">
                <div class="item-card-top">
                  <img class="item-card-img" src="./assets/art/icon-${vId}.png" alt="${v.name}" />
                  <div>
                    <h4 class="item-card-title">${v.name}</h4>
                    <p class="item-card-sub">${v.subtitle}</p>
                  </div>
                </div>
                <p class="item-card-desc">${v.description}</p>
                <div style="font-size:12px;font-weight:700;color:#3d220e;">
                  Harvested: ${count} &nbsp;|&nbsp; Best Grade: ${best ? QUALITY_LABELS[best] : 'Not harvested yet'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="card-grid">
          ${ACHIEVEMENTS.map((ach) => {
            const unlocked = state.achievements.includes(ach.id);
            return `
              <div class="item-card" style="${unlocked ? 'border-color:#2e7d32;background:#f4fbf2;' : 'opacity:0.65;'}">
                <div style="display:flex;gap:10px;align-items:center;">
                  <span>${icon((ach.icon as IconName) || 'trophy', 22)}</span>
                  <div>
                    <h4 class="item-card-title">${ach.title} ${unlocked ? '[Unlocked]' : '[Locked]'}</h4>
                    <p class="item-card-desc">${ach.description}</p>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" role="dialog" aria-label="Festival and Almanac" data-testid="modal-almanac">
        <div class="modal-header">
          <h2 class="modal-title">${icon('trophy', 18)} Golden Spud Festival & Potato Almanac</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.almanacTab === 'festival' ? 'active' : ''}" data-alm-tab="festival" data-testid="tab-alm-festival">${icon('trophy', 14)} Golden Spud Festival</button>
          <button class="modal-tab ${this.almanacTab === 'varieties' ? 'active' : ''}" data-alm-tab="varieties" data-testid="tab-alm-varieties">${icon('sprout', 14)} 6 Potato Varieties</button>
          <button class="modal-tab ${this.almanacTab === 'achievements' ? 'active' : ''}" data-alm-tab="achievements" data-testid="tab-alm-achievements">${icon('star', 14)} Achievements (${state.achievements.length}/${ACHIEVEMENTS.length})</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    this.modalBackdropEl.querySelectorAll<HTMLButtonElement>('[data-alm-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.almanacTab = btn.dataset.almTab as 'festival' | 'varieties' | 'achievements';
        this.audio.playSfx('ui');
        this.renderAlmanacModal(state);
      });
    });

    const hostBtn = this.modalBackdropEl.querySelector('#btn-host-festival');
    if (hostBtn) {
      hostBtn.addEventListener('click', async () => {
        const fb = hostGoldenSpudFestival(state);
        this.audio.playSfx('fanfare');
        this.showToast(fb);
        this.renderAlmanacModal(state);
        this.lastHudSignature = '';
        this.updateHud();
        if (fb.ok) await this.cb.triggerSave('festival_won');
      });
    }
  }

  private renderDaySummaryModal(state: GameState): void {
    const ds = state.dayStats;
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:520px;" role="dialog" aria-label="End of Day Summary" data-testid="modal-day-summary">
        <div class="modal-header">
          <h2 class="modal-title">${icon('sleep', 18)} End of Day — ${ds.season.toUpperCase()} Day ${ds.day} (Year ${ds.year})</h2>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 12px;font-size:13.5px;">
            Rest at the Homestead Farmhouse to advance overnight crop growth, machine batches, and morning sprinklers.
          </p>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13.5px;">
            <div>${icon('sprout', 14)} Tubers Harvested: <strong>${ds.harvestedCount}</strong></div>
            <div>${icon('pouch', 14)} Seeds Planted: <strong>${ds.cropsPlanted}</strong></div>
            <div>${icon('coin', 14)} Gold Earned: <strong>+${ds.goldEarned}g</strong></div>
            <div>${icon('shop', 14)} Gold Invested: <strong>${ds.goldSpent}g</strong></div>
            <div>${icon('quests', 14)} Contracts Fulfilled: <strong>${ds.questsCompleted}</strong></div>
            <div>${icon('sun', 14)} Tomorrow: <strong>${state.calendar.tomorrowWeather.toUpperCase()}</strong></div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-wood" id="btn-cancel-sleep">Stay Awake</button>
            <button class="btn btn-success" id="btn-confirm-sleep" data-testid="btn-confirm-sleep">
              ${icon('sleep', 14)} Sleep & Save to Next Morning
            </button>
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#btn-cancel-sleep')!.addEventListener('click', () => {
      if (state.calendar.hour >= 22) {
        this.confirmSleepAndSave(state);
      } else {
        this.closeModal();
      }
    });

    this.modalBackdropEl.querySelector('#btn-confirm-sleep')!.addEventListener('click', () => {
      this.confirmSleepAndSave(state);
    });
  }

  private async confirmSleepAndSave(state: GameState): Promise<void> {
    sleepToNextDay(state);
    this.audio.applySettings(state.settings, state.calendar.weather);
    this.audio.playSfx('fanfare');
    this.closeModal();
    this.lastHudSignature = '';
    this.updateHud();
    await this.cb.triggerSave('day_transition');
    this.showToast({
      ok: true,
      message: `Good morning! ${state.calendar.season.toUpperCase()} Day ${state.calendar.dayOfSeason} • Weather: ${state.calendar.weather.toUpperCase()}`,
      kind: 'info'
    });
  }

  private renderSettingsModal(state: GameState): void {
    const s = state.settings;
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:640px;" role="dialog" aria-label="Settings and Save Management" data-testid="modal-settings">
        <div class="modal-header">
          <h2 class="modal-title">${icon('settings', 18)} Settings, Audio, Controls & Save Management</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;font-size:15px;">${icon('sound', 15)} Audio & Accessibility</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px;">
            <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;">
              <span>Music Volume (${Math.round(s.musicVolume * 100)}%)</span>
              <input type="range" id="set-music" min="0" max="100" value="${Math.round(s.musicVolume * 100)}" style="width:180px;" />
            </label>
            <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;">
              <span>Sound Effects & Ambience (${Math.round(s.sfxVolume * 100)}%)</span>
              <input type="range" id="set-sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" style="width:180px;" />
            </label>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;font-weight:700;">
              <label><input type="checkbox" id="set-mute" ${s.muted ? 'checked' : ''} /> Mute All Audio</label>
              <label><input type="checkbox" id="set-shake" ${s.screenShake ? 'checked' : ''} /> Screen Shake</label>
              <label><input type="checkbox" id="set-motion" ${s.reducedMotion ? 'checked' : ''} /> Reduced Motion</label>
            </div>
          </div>

          <h3 style="margin:0 0 8px;font-size:15px;">${icon('save', 15)} Browser-Local Save System & Backups</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;margin-bottom:14px;">
            <p style="margin:0 0 10px;font-size:12px;color:#4e3019;line-height:1.4;">
              <strong>Local Storage Notice:</strong> Saves are persisted locally in this browser profile using IndexedDB (with a last-known-good recovery backup). They are not synchronized to a cloud server and may be lost if you clear site data or play in a private/incognito window. Use Export Save below to keep a permanent file backup.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-success btn-sm" id="set-btn-save" data-testid="settings-save-btn">${icon('save', 13)} Save Farm Now</button>
              <button class="btn btn-primary btn-sm" id="set-btn-export" data-testid="settings-export-btn">${icon('export', 13)} Export Save JSON</button>
              <button class="btn btn-wood btn-sm" id="set-btn-import" data-testid="settings-import-btn">${icon('import', 13)} Import Save JSON</button>
              <button class="btn btn-danger btn-sm" id="set-btn-reset" data-testid="settings-reset-btn">${icon('trash', 13)} Reset / Delete Save</button>
            </div>
          </div>

          <h3 style="margin:0 0 8px;font-size:15px;">${icon('book', 15)} Controls & Quick Help</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;font-size:12.5px;line-height:1.5;">
            <div>• <strong>Move:</strong> WASD / Arrow Keys, Touch D-Pad, or click adjacent 3D tiles</div>
            <div>• <strong>Use Selected Tool:</strong> Click target tile, press <strong>E</strong>, or tap <strong>Use Tool</strong></div>
            <div>• <strong>Select Tools:</strong> Keys <strong>1–5</strong> (1: Spade, 2: Hilling Hoe, 3: Watering Can, 4: Harvest Fork, 5: Seed/Compost Pouch)</div>
            <div>• <strong>Cycle Seed / Compost in Pouch:</strong> Press <strong>Tab</strong> or click the Active Pouch card</div>
            <div>• <strong>Refill Watering Can:</strong> Use Watering Can on the Stone Well or Springfed Pond on the West side</div>
            <div>• <strong>Menus:</strong> <strong>M</strong> Shop, <strong>I</strong> Backpack, <strong>J</strong> Quests, <strong>B</strong> Build, <strong>K</strong> Festival Almanac, <strong>H</strong> Tutorial, <strong>N</strong> Sleep</div>
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());

    const bindSetting = () => {
      const musicEl = this.modalBackdropEl.querySelector('#set-music') as HTMLInputElement;
      const sfxEl = this.modalBackdropEl.querySelector('#set-sfx') as HTMLInputElement;
      const muteEl = this.modalBackdropEl.querySelector('#set-mute') as HTMLInputElement;
      const shakeEl = this.modalBackdropEl.querySelector('#set-shake') as HTMLInputElement;
      const motionEl = this.modalBackdropEl.querySelector('#set-motion') as HTMLInputElement;

      state.settings.musicVolume = Number(musicEl.value) / 100;
      state.settings.sfxVolume = Number(sfxEl.value) / 100;
      state.settings.muted = muteEl.checked;
      state.settings.screenShake = shakeEl.checked;
      state.settings.reducedMotion = motionEl.checked;
      this.audio.applySettings(state.settings, state.calendar.weather);
      this.cb.triggerSave('settings_change');
    };

    ['#set-music', '#set-sfx', '#set-mute', '#set-shake', '#set-motion'].forEach((sel) => {
      this.modalBackdropEl.querySelector(sel)?.addEventListener('change', () => {
        bindSetting();
        this.renderSettingsModal(state);
      });
    });

    this.modalBackdropEl.querySelector('#set-btn-save')!.addEventListener('click', async () => {
      const ok = await this.cb.triggerSave('manual_settings_save', true);
      if (ok) {
        this.showToast({ ok: true, message: 'Farm saved successfully!', kind: 'success' });
      }
    });

    this.modalBackdropEl.querySelector('#set-btn-export')!.addEventListener('click', () => {
      this.openExportModal(state);
    });

    this.modalBackdropEl.querySelector('#set-btn-import')!.addEventListener('click', () => {
      this.openImportModal();
    });

    this.modalBackdropEl.querySelector('#set-btn-reset')!.addEventListener('click', () => {
      this.openConfirmModal(
        'Delete Saved Farm & Reset?',
        'This will permanently delete your browser-local save and backup for this farm. Make sure you have exported a backup if you wish to keep it!',
        'Delete Save & Reset',
        async () => {
          await this.saveManager.deleteAllSaves();
          const loadRes = await this.saveManager.loadGame();
          this.renderTitleScreen(loadRes);
        }
      );
    });
  }

  private openExportModal(state: GameState): void {
    const json = this.saveManager.exportSaveToJson(state);
    this.modalBackdropEl.style.display = 'flex';
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:580px;" role="dialog" aria-label="Export Save Data" data-testid="modal-export">
        <div class="modal-header">
          <h2 class="modal-title">${icon('export', 18)} Export Validated Save Backup</h2>
          <button class="modal-close-btn" id="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 8px;font-size:13px;">Copy the JSON below or download it as a file to back up or transfer your farm:</p>
          <textarea
            id="export-json-textarea"
            data-testid="export-json-textarea"
            readonly
            style="width:100%;height:200px;font-family:monospace;font-size:11px;padding:8px;border-radius:8px;border:2px solid #8c6239;background:#fffdf8;"
          ></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
            <button class="btn btn-wood btn-sm" id="btn-copy-export" data-testid="btn-copy-export">${icon('quests', 13)} Copy JSON</button>
            <button class="btn btn-primary btn-sm" id="btn-download-export" data-testid="btn-download-export">${icon('save', 13)} Download .json File</button>
          </div>
        </div>
      </div>
    `;

    const ta = this.modalBackdropEl.querySelector('#export-json-textarea') as HTMLTextAreaElement;
    ta.value = json;

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => {
      this.openModal('settings');
    });

    this.modalBackdropEl.querySelector('#btn-copy-export')!.addEventListener('click', () => {
      navigator.clipboard?.writeText(json).catch(() => {});
      this.showToast({ ok: true, message: 'Save JSON copied to clipboard!', kind: 'success' });
    });

    this.modalBackdropEl.querySelector('#btn-download-export')!.addEventListener('click', () => {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spudstead-save-day${state.calendar.totalDays}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  private openImportModal(): void {
    this.activeModal = 'settings';
    this.modalBackdropEl.style.display = 'flex';
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:580px;" role="dialog" aria-label="Import Save Data" data-testid="modal-import">
        <div class="modal-header">
          <h2 class="modal-title">${icon('import', 18)} Import Save File</h2>
          <button class="modal-close-btn" id="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 8px;font-size:13px;">
            Paste a previously exported SPUDSTEAD JSON save below or upload a <code>.json</code> save file. Importing will replace your current active farm after validation.
          </p>
          <input type="file" id="import-file-input" accept=".json,application/json" style="margin-bottom:8px;font-size:12px;" />
          <textarea
            id="import-json-textarea"
            data-testid="import-json-textarea"
            placeholder='Paste exported {"app": "SPUDSTEAD_ARGON", ...} JSON here'
            style="width:100%;height:180px;font-family:monospace;font-size:11px;padding:8px;border-radius:8px;border:2px solid #8c6239;background:#fffdf8;"
          ></textarea>
          <div id="import-error-msg" data-testid="import-error-msg" style="color:#c62828;font-size:12.5px;font-weight:700;margin-top:6px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
            <button class="btn btn-wood btn-sm" id="btn-cancel-import">Cancel</button>
            <button class="btn btn-success btn-sm" id="btn-confirm-import" data-testid="btn-confirm-import">${icon('check', 13)} Validate & Import Farm</button>
          </div>
        </div>
      </div>
    `;

    const closeBack = () => {
      if (this.inTitleScreen) {
        this.closeModal();
      } else {
        this.openModal('settings');
      }
    };

    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', closeBack);
    this.modalBackdropEl.querySelector('#btn-cancel-import')!.addEventListener('click', closeBack);

    const fileInput = this.modalBackdropEl.querySelector('#import-file-input') as HTMLInputElement;
    const textArea = this.modalBackdropEl.querySelector('#import-json-textarea') as HTMLTextAreaElement;
    const errEl = this.modalBackdropEl.querySelector('#import-error-msg') as HTMLElement;

    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (f) {
        textArea.value = await f.text();
      }
    });

    this.modalBackdropEl.querySelector('#btn-confirm-import')!.addEventListener('click', async () => {
      const res = await this.saveManager.importSaveFromJson(textArea.value);
      if (!res.ok || !res.state) {
        errEl.textContent = res.message;
        this.audio.playSfx('ui');
        return;
      }
      this.cb.setState(res.state);
      this.closeModal();
      this.enterGameplayHud();
      this.audio.playSfx('fanfare');
      this.showToast({ ok: true, message: res.message, kind: 'success' });
    });
  }

  private openConfirmModal(
    title: string,
    description: string,
    confirmLabel: string,
    onConfirm: () => Promise<void> | void
  ): void {
    this.activeModal = 'settings';
    this.modalBackdropEl.style.display = 'flex';
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:460px;" role="dialog" aria-label="${this.escapeHtml(title)}" data-testid="modal-confirm">
        <div class="modal-header">
          <h2 class="modal-title">${icon('warning', 18)} ${this.escapeHtml(title)}</h2>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;font-size:14px;line-height:1.45;">${this.escapeHtml(description)}</p>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-wood" id="confirm-cancel-btn" data-testid="confirm-cancel-btn">Cancel</button>
            <button class="btn btn-danger" id="confirm-ok-btn" data-testid="confirm-ok-btn">${this.escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#confirm-cancel-btn')!.addEventListener('click', () => {
      this.closeModal();
    });
    this.modalBackdropEl.querySelector('#confirm-ok-btn')!.addEventListener('click', async () => {
      this.closeModal();
      await onConfirm();
    });
  }

  private renderCreditsModal(): void {
    this.modalBackdropEl.innerHTML = `
      <div class="modal-window" style="max-width:520px;" role="dialog" aria-label="Credits" data-testid="modal-credits">
        <div class="modal-header">
          <h2 class="modal-title">${icon('star', 18)} SPUDSTEAD — Credits & Attribution</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">${icon('close', 16)}</button>
        </div>
        <div class="modal-body" style="font-size:13.5px;line-height:1.55;">
          <p><strong>SPUDSTEAD: 3D Specialty-Potato Farming Simulator</strong></p>
          <p>• <strong>Game Design, Simulation & 3D Engineering:</strong> Original TypeScript + Three.js WebGL 3D Engine</p>
          <p>• <strong>Visual Art & Illustrations:</strong> Original bespoke generated illustrations, NPC portraits, custom SVG iconography, and 3D procedural meshes</p>
          <p>• <strong>Music & Sound Design:</strong> Original synthesized pastoral marimba soundtrack & farming sound effects generated via <code>scripts/generate_assets.py</code> and Web Audio API</p>
          <p>• <strong>License:</strong> MIT License — 100% self-contained static web application</p>
        </div>
      </div>
    `;
    this.modalBackdropEl.querySelector('#modal-close')!.addEventListener('click', () => this.closeModal());
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
