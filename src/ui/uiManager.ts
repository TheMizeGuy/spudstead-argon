import { AudioManager } from '../audio/audioManager';
import {
  ACHIEVEMENTS,
  MACHINE_BLUEPRINTS,
  MACHINE_RECIPES,
  NPCS,
  PLOT_INFO,
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
  PotatoVarietyId,
  SoilTile,
  ToolId,
  UpgradeId
} from '../data/types';
import {
  LoadResult,
  SaveManager,
  SaveStatusEvent
} from '../persistence/saveManager';
import { WorldRenderer } from '../render/renderer';
import {
  buyAndPlaceMachine,
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

export type ActiveModalType =
  | null
  | 'shop'
  | 'backpack'
  | 'quests'
  | 'almanac'
  | 'machine'
  | 'day_summary'
  | 'settings'
  | 'credits';

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
  private toastEl!: HTMLElement;
  private inspectorEl!: HTMLElement;
  private toolbeltEl!: HTMLElement;
  private modalBackdropEl!: HTMLElement;
  private speedBtns: Record<number, HTMLButtonElement> = {};

  private toastTimer: number | null = null;
  private lastHudSignature = '';
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
              <button class="speed-btn" data-speed="0" title="Pause (Space)">⏸</button>
              <button class="speed-btn active" data-speed="1" title="Normal Speed">1×</button>
              <button class="speed-btn" data-speed="2" title="Brisk Speed">2×</button>
              <button class="speed-btn" data-speed="4" title="Fast Speed">4×</button>
            </div>
          </div>
          <div class="hud-weather-row" id="hud-weather-text">
            <span>☀️ Sunny</span>
            <span>Tomorrow: 🌧️ Rainy</span>
          </div>
          <div class="hud-meters-row">
            <span class="gold-pill" id="hud-gold-text" data-testid="hud-gold">🪙 120g</span>
            <div class="meter-group">
              <div class="meter-bar" title="Stamina">
                <div class="meter-fill stamina" id="hud-stamina-fill" style="width: 100%"></div>
                <div class="meter-label" id="hud-stamina-label">⚡ 100/100</div>
              </div>
              <div class="meter-bar" title="Watering Can">
                <div class="meter-fill water" id="hud-water-fill" style="width: 100%"></div>
                <div class="meter-label" id="hud-water-label">💧 12/12</div>
              </div>
            </div>
          </div>
          <div class="save-status-line">
            <span id="hud-save-indicator" class="save-indicator" data-testid="save-indicator">Ready</span>
            <button class="btn btn-wood btn-sm" id="hud-btn-save-now" data-testid="hud-save-btn" style="padding:2px 8px;min-height:24px;font-size:11px;">💾 Save Now</button>
          </div>
        </div>

        <div class="hud-right-col">
          <div class="objective-banner" id="hud-objective" data-testid="hud-objective"></div>
          <div class="hud-nav-buttons">
            <button class="btn btn-primary btn-sm" id="nav-btn-shop" data-testid="nav-shop">🏪 Shop & Sell (M)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-pack" data-testid="nav-pack">🎒 Pack & Cellar (I)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-quests" data-testid="nav-quests">📜 Quests & Town (J)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-build" data-testid="nav-build">🔨 Build (B)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-almanac" data-testid="nav-almanac">🏆 Festival & Almanac (K)</button>
            <button class="btn btn-success btn-sm" id="nav-btn-sleep" data-testid="nav-sleep">🌙 Sleep (N)</button>
            <button class="btn btn-wood btn-sm" id="nav-btn-settings" data-testid="nav-settings">⚙️ Settings</button>
          </div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="toast-banner" id="hud-toast" data-testid="hud-toast" style="opacity:0"></div>
        <div class="crop-inspector-card" id="hud-inspector" data-testid="hud-inspector" style="display:none"></div>

        <div class="touch-controls-row" id="touch-controls">
          <div class="touch-dpad" aria-label="Movement D-Pad">
            <div></div>
            <button class="dpad-btn" data-dir="up" aria-label="Move Up">▲</button>
            <div></div>
            <button class="dpad-btn" data-dir="left" aria-label="Move Left">◀</button>
            <div style="display:flex;align-items:center;justify-content:center;font-size:10px;color:#ffe285;font-weight:800;">MOVE</div>
            <button class="dpad-btn" data-dir="right" aria-label="Move Right">▶</button>
            <div></div>
            <button class="dpad-btn" data-dir="down" aria-label="Move Down">▼</button>
            <div></div>
          </div>
          <div class="touch-action-pad">
            <button class="btn btn-primary touch-act-btn" id="touch-btn-use" data-testid="touch-use-tool">⚒️ Use Tool</button>
            <button class="btn btn-wood touch-act-btn" id="touch-btn-interact" data-testid="touch-interact">💬 Interact</button>
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
        <div class="title-badge">Original Specialty-Potato Simulator</div>
        <h1 class="title-logo">SPUDSTEAD</h1>
        <p class="title-subtitle">From Overgrown Patch to Golden Tuber Estate</p>

        ${
          loadResult.error
            ? `<div style="background:#5c1b16;color:#ffd8d6;border:2px solid #ff8a80;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px;font-weight:700;" data-testid="title-storage-notice">
                ⚠️ ${this.escapeHtml(loadResult.error)}
              </div>`
            : ''
        }

        ${
          meta
            ? `<div class="continue-banner" data-testid="continue-banner">
                <div class="continue-banner-header">
                  <span>🌱 ${this.escapeHtml(meta.farmName)}</span>
                  <span style="color:#8c5308;">🪙 ${meta.gold}g</span>
                </div>
                <div class="continue-banner-meta">
                  Year ${meta.year} • ${meta.season.toUpperCase()} Day ${meta.dayOfSeason} &nbsp;|&nbsp; Last Saved: ${savedTimeStr}
                </div>
                <button class="btn btn-success" id="title-btn-continue" data-testid="btn-continue" style="width:100%;font-size:16px;">
                  ▶ Continue Saved Farm
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
              ✨ New Game
            </button>
          </div>

          <div class="title-row-actions">
            <button class="btn btn-wood" id="title-btn-import" data-testid="btn-title-import">📂 Import Save</button>
            <button class="btn btn-wood" id="title-btn-settings" data-testid="btn-title-settings">⚙️ Settings</button>
            <button class="btn btn-wood" id="title-btn-credits" data-testid="btn-title-credits">🎨 Credits</button>
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

    const wholeHour = Math.floor(cal.hour);
    const mins = Math.floor((cal.hour - wholeHour) * 60);
    const ampm = wholeHour >= 12 ? 'PM' : 'AM';
    const dispHour = wholeHour > 12 ? wholeHour - 12 : wholeHour === 0 ? 12 : wholeHour;
    const clockStr = `${String(dispHour).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;

    const weatherIcons: Record<typeof cal.weather, string> = {
      sunny: '☀️ Sunny',
      breezy: '🍃 Breezy',
      rainy: '🌧️ Rainy (Auto-Waters!)',
      stormy: '⛈️ Heavy Rain',
      frosty: '❄️ Frosty'
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
      state.settings.timeSpeed,
      state.tutorialStep,
      nextQuest?.id || 'done',
      questProg?.current || 0,
      this.placementBuildType || ''
    ].join('|');

    if (sig !== this.lastHudSignature) {
      this.lastHudSignature = sig;
      this.calTextEl.textContent = `${cal.season.toUpperCase()} • DAY ${cal.dayOfSeason} (YR ${cal.year}) • ${clockStr}`;
      this.weatherTextEl.innerHTML = `
        <span>${weatherIcons[cal.weather]}</span>
        <span>Forecast: ${weatherIcons[cal.tomorrowWeather]}</span>
      `;
      this.goldTextEl.textContent = `🪙 ${p.gold}g`;

      const stamPct = Math.max(0, Math.min(100, (p.stamina / p.maxStamina) * 100));
      this.staminaFillEl.style.width = `${stamPct}%`;
      this.staminaLabelEl.textContent = `⚡ ${Math.round(p.stamina)}/${p.maxStamina}`;

      const waterPct = Math.max(0, Math.min(100, (p.water / p.maxWater) * 100));
      this.waterFillEl.style.width = `${waterPct}%`;
      this.waterLabelEl.textContent = `💧 ${p.water}/${p.maxWater}`;

      for (const spd of [0, 1, 2, 4]) {
        const btn = this.speedBtns[spd];
        if (btn) {
          btn.classList.toggle('active', state.settings.timeSpeed === spd);
        }
      }

      if (this.placementBuildType) {
        const bp = MACHINE_BLUEPRINTS[this.placementBuildType];
        this.objectiveEl.innerHTML = `
          <strong>🔨 Placement Mode (${bp.name} - ${bp.cost}g):</strong> Click any green-highlighted unlocked soil or courtyard tile to place, or <button class="btn btn-danger btn-sm" id="cancel-place-btn" style="padding:1px 7px;min-height:22px;">Cancel (Esc)</button>
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
          <strong>🎯 ${nextQuest.title} (${questProg.current}/${questProg.target}):</strong> ${nextQuest.description}
          ${questProg.ready ? `<button class="btn btn-success btn-sm" id="hud-claim-quest-btn" data-testid="hud-claim-quest" style="margin-left:6px;padding:2px 8px;min-height:24px;">🎁 Claim ${nextQuest.rewardGold}g</button>` : ''}
        `;
        const claimBtn = this.objectiveEl.querySelector('#hud-claim-quest-btn');
        if (claimBtn) {
          claimBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const fb = claimQuestReward(state, nextQuest.id);
            this.audio.playSfx(fb.sfx || 'fanfare');
            this.showToast(fb);
            this.lastHudSignature = '';
            this.updateHud();
            await this.cb.triggerSave('quest_reward');
          });
        }
      } else {
        this.objectiveEl.innerHTML = state.festival.won
          ? `<strong>🏆 Golden Spud Laureate:</strong> Sandbox Mode active — expand your estate & enjoy Spudstead!`
          : `<strong>🏆 Golden Spud Festival:</strong> Open Festival & Almanac (K) to check the 5 Festival Pillars!`;
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
            <span>🌱 ${info.title} — ${info.stageLabel}</span>
            <span>💧 ${info.moisturePct}% | 🌿 Fert ${info.fertilityPct}% | ⛰️ Hill ${info.hillLevel}/2 | Est: ${QUALITY_LABELS[info.projectedGrade]}</span>
          </div>
          <div style="color:#d7f5c6;margin-bottom:2px;">⏱️ <strong>When:</strong> ${info.maturityText}</div>
          <div style="color:#ffe0b2;">💡 <strong>Care & Next Step:</strong> ${info.needsText} • ${info.improvementText}</div>
        `;
      }
    }
  }

  private renderToolbelt(state: GameState): void {
    const p = state.player;
    const toolIcons: Record<ToolId, string> = {
      spade: '⛏️',
      hoe: '⛰️',
      watering_can: '🚿',
      fork: '🔱',
      pouch: '🌱'
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
            <span class="tool-icon">${toolIcons[tId]}</span>
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
          <div>${activePouchItem ? `${this.escapeHtml(activePouchItem.name)} (×${activePouchItem.quantity})` : 'Empty (Buy Seeds)'}</div>
        </div>
        <span style="font-size:15px;">🔄</span>
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

  public openModal(type: ActiveModalType, options?: { npcId?: NpcId; machineId?: string; shopTab?: 'seeds' | 'sell' | 'upgrades' }): void {
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
    }
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
                    ${inSeason ? `★ Best in ${state.calendar.season.toUpperCase()}` : `Prefers: ${v.preferredSeasons.join(', ')}`}
                  </span>
                </div>
              </div>
              <p class="item-card-desc" style="margin-top:6px;">
                ${v.description}<br/>
                <strong>Growth:</strong> ${(v.growthHours / 16).toFixed(1)}d &nbsp;|&nbsp;
                <strong>Yield:</strong> ${v.yieldMin}–${v.yieldMax} tubers &nbsp;|&nbsp;
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
                <h4 class="item-card-title">🌿 ${s.name}</h4>
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
        <h3 style="margin:0 0 10px;font-size:15px;">🌱 Specialty Seed Potatoes</h3>
        <div class="card-grid" style="margin-bottom:18px;">${seedCards}</div>
        <h3 style="margin:0 0 10px;font-size:15px;">🌿 Soil Compost & Fertilizers</h3>
        <div class="card-grid">${supplyCards}</div>
      `;
    } else if (this.shopTab === 'sell') {
      const sellable = state.inventory.filter(
        (i) => i.category === 'crop' || i.category === 'processed' || i.category === 'supply'
      );

      bodyHtml = `
        <div style="background:#efe0c2;border:2px solid #c69852;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <span>🔥 <strong>Today's Featured Variety (+25% Price):</strong> ${demandVar.name}</span>
          <span style="font-weight:800;">Your Gold: 🪙 ${state.player.gold}g</span>
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
                          <h4 class="item-card-title">${this.escapeHtml(item.name)} (×${item.quantity})</h4>
                          ${isHot ? `<span class="badge badge-hot">🔥 Daily Demand +25%</span>` : ''}
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
                <span style="font-weight:800;">${owned ? '✅ Owned' : `${u.cost}g`}</span>
              </div>
              <h4 class="item-card-title" style="margin-top:6px;">${u.name}</h4>
              <p class="item-card-desc">${u.description}</p>
              <p style="font-size:11.5px;color:#1b521e;font-weight:700;margin:6px 0 0;">Effect: ${u.benefitText}</p>
            </div>
            <div class="item-card-actions">
              ${
                owned
                  ? `<button class="btn btn-wood btn-sm" disabled>Equipped / Unlocked</button>`
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
          <h2 class="modal-title">🏪 Spudstead Emporium & Market Stall &nbsp;<small style="font-size:14px;color:#fff;">(🪙 ${state.player.gold}g)</small></h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close" aria-label="Close">✕</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.shopTab === 'seeds' ? 'active' : ''}" data-tab="seeds" data-testid="tab-shop-seeds">🌱 Buy Seeds & Compost</button>
          <button class="modal-tab ${this.shopTab === 'sell' ? 'active' : ''}" data-tab="sell" data-testid="tab-shop-sell">⚖️ Sell Harvest & Goods</button>
          <button class="modal-tab ${this.shopTab === 'upgrades' ? 'active' : ''}" data-tab="upgrades" data-testid="tab-shop-upgrades">⚒️ Upgrades & Land Deeds (${state.upgrades.length}/${UPGRADES.length})</button>
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
                    <h4 class="item-card-title">${this.escapeHtml(item.name)} (×${item.quantity})</h4>
                    <p class="item-card-desc">${this.escapeHtml(item.description)}</p>
                  </div>
                  <div class="item-card-actions">
                    <span style="font-size:12px;font-weight:700;">Val: ${item.unitValue}g</span>
                    <div style="display:flex;gap:4px;">
                      ${
                        from === 'backpack' && canEquip
                          ? `<button class="btn ${isEquipped ? 'btn-success' : 'btn-primary'} btn-sm" data-equip-id="${item.itemId}">
                              ${isEquipped ? '✓ In Pouch' : 'Equip to Pouch'}
                            </button>`
                          : ''
                      }
                      <button class="btn btn-wood btn-sm" data-xfer-from="${from}" data-xfer-id="${item.itemId}" data-xfer-qty="${item.quantity}">
                        ${from === 'backpack' ? '→ To Cellar' : '← To Pack'}
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
          <h2 class="modal-title">🎒 Field Backpack (${state.inventory.length}/${state.player.backpackCapacity}) & Root Cellar</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;">🎒 Field Backpack (${state.inventory.length}/${state.player.backpackCapacity} stacks)</h3>
          ${renderList(state.inventory, 'backpack')}
          <hr style="border:none;border-top:2px solid #c69852;margin:18px 0;" />
          <h3 style="margin:0 0 8px;">🏛️ Homestead Root Cellar (${state.cellar.length}/60 stacks)</h3>
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
              <span style="font-weight:800;font-size:12px;">${done ? '✅ Completed' : `${prog.current}/${prog.target}`}</span>
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
                    ${prog.ready ? '🎁 Claim Reward!' : 'In Progress'}
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
              <p class="item-card-desc">Deliver ${order.quantity}× ${vDef.name} (${QUALITY_LABELS[order.minQuality]} or better).</p>
            </div>
            <div class="item-card-actions">
              <span style="font-weight:800;">Reward: ${order.rewardGold}g</span>
              ${
                order.completed
                  ? `<button class="btn btn-wood btn-sm" disabled>✓ Fulfilled</button>`
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
          <h2 class="modal-title">📜 Spudstead Townfolk, Quests & Daily Contracts</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.activeNpcId === 'barnaby' ? 'active' : ''}" data-npc="barnaby">🌾 Barnaby Root</button>
          <button class="modal-tab ${this.activeNpcId === 'mireille' ? 'active' : ''}" data-npc="mireille">👩‍🍳 Chef Mireille</button>
          <button class="modal-tab ${this.activeNpcId === 'mossy' ? 'active' : ''}" data-npc="mossy">🔍 Old Mossy</button>
        </div>
        <div class="modal-body">
          <div class="npc-dialogue-box">
            <img class="npc-portrait" src="${npc.portrait}" alt="${npc.name}" />
            <div style="flex:1;">
              <div style="font-weight:800;font-size:16px;color:#3d220e;">${npc.name} — <span style="font-weight:600;color:#6e4726;">${npc.role}</span></div>
              <p style="margin:6px 0;font-size:13.5px;line-height:1.4;">"${line}"</p>
              <div style="font-size:12px;color:#1b521e;font-weight:700;">💡 Tip: ${tip}</div>
            </div>
            ${
              this.activeNpcId === 'mossy'
                ? `<button class="btn btn-success btn-sm" id="btn-claim-aid" data-testid="btn-claim-aid">🌱 Claim Sprout Aid / Tea</button>`
                : ''
            }
          </div>

          <h3 style="margin:0 0 10px;font-size:15px;">📋 Daily Market Contracts</h3>
          <div class="card-grid" style="margin-bottom:18px;">${orderCards}</div>

          <h3 style="margin:0 0 10px;font-size:15px;">📜 Authored Progression Quests (${state.completedQuests.length}/${QUESTS.length})</h3>
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
              <h4 class="item-card-title">🔨 ${bp.name}</h4>
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
          ? `✅ Output Ready: ${m.outputItem.quantity}× ${m.outputItem.name}`
          : m.activeRecipeId
            ? `⚙️ Processing (${m.progressHours.toFixed(1)}/${m.durationHours}h)`
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
          <h2 class="modal-title">🔨 Farm Infrastructure & Processing Stations (🪙 ${state.player.gold}g)</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;">📐 Place New Infrastructure</h3>
          <div class="card-grid" style="margin-bottom:18px;">${bpCards}</div>
          <h3 style="margin:0 0 8px;">⚙️ Active Processing Stations on Farm</h3>
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
          <h2 class="modal-title">⚙️ ${bp.name}</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-tabs">
          ${state.machines
            .filter((m) => m.type !== 'sprinkler')
            .map(
              (m) => `
              <button class="modal-tab ${m.id === machine.id ? 'active' : ''}" data-switch-mach="${m.id}" data-testid="tab-mach-${m.type}">
                ${MACHINE_BLUEPRINTS[m.type].name} ${m.outputItem ? '✓' : m.activeRecipeId ? '⏳' : ''}
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
                    <strong>✅ Batch Complete:</strong> ${machine.outputItem.quantity}× ${this.escapeHtml(machine.outputItem.name)}
                  </div>
                  <button class="btn btn-success" id="btn-collect-machine" data-testid="btn-collect-machine">
                    📥 Collect Output
                  </button>
                </div>`
              : machine.activeRecipeId
                ? `<div style="background:#fff1b8;border:2px solid #d48806;border-radius:12px;padding:14px;margin-bottom:14px;">
                    <strong>⚙️ Processing in progress:</strong> ${machine.progressHours.toFixed(1)} / ${machine.durationHours} in-game hours elapsed.
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
                      ⏱️ Time: ${r.durationHours}h &nbsp;|&nbsp; Output Value: ${r.outputBaseValue}g each
                    </p>
                  </div>
                  <div class="item-card-actions">
                    <button
                      class="btn btn-primary btn-sm"
                      data-start-recipe="${r.id}"
                      data-testid="start-recipe-${r.id}"
                      ${machine.activeRecipeId || machine.outputItem ? 'disabled' : ''}
                    >
                      ▶️ Start Batch
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
          <h3 style="margin:0 0 6px;font-size:18px;">🏆 The Golden Spud Festival</h3>
          <p style="margin:0 0 12px;font-size:13px;color:#f6ead2;line-height:1.4;">
            Complete all 5 Festival Pillars to host the Valley Judging, earn the gleaming Golden Spud Trophy on your estate plinth (+1,000g Grand Prize), and unlock Laureate Sandbox honors!
          </p>
          <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
            ${pillars
              .map(
                (p) => `
                <div style="background:rgba(255,255,255,0.08);border:1px solid #c69852;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
                  <span>${p.done ? '✅' : '⏳'} ${p.label}</span>
                  <strong>${p.current} / ${p.target}</strong>
                </div>
              `
              )
              .join('')}
          </div>
          ${
            state.festival.won
              ? `<div style="background:#2e7d32;color:#fff;padding:10px;border-radius:8px;font-weight:800;text-align:center;" data-testid="festival-won-banner">
                  🎉 Crowned Golden Spud Champion on Day ${state.festival.wonOnDay}! Your trophy shines in the courtyard.
                </div>`
              : `<button class="btn btn-primary" id="btn-host-festival" data-testid="btn-host-festival" style="width:100%;font-size:15px;" ${allPillarsDone ? '' : 'disabled'}>
                  ${allPillarsDone ? '🏆 Host the Golden Spud Festival Judging!' : 'Complete All 5 Pillars Above to Host Festival'}
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
                  <span style="font-size:26px;">${ach.icon}</span>
                  <div>
                    <h4 class="item-card-title">${ach.title} ${unlocked ? '✅' : '🔒'}</h4>
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
          <h2 class="modal-title">🏆 Golden Spud Festival & Potato Almanac</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab ${this.almanacTab === 'festival' ? 'active' : ''}" data-alm-tab="festival" data-testid="tab-alm-festival">🏆 Golden Spud Festival</button>
          <button class="modal-tab ${this.almanacTab === 'varieties' ? 'active' : ''}" data-alm-tab="varieties" data-testid="tab-alm-varieties">🥔 6 Potato Varieties</button>
          <button class="modal-tab ${this.almanacTab === 'achievements' ? 'active' : ''}" data-alm-tab="achievements" data-testid="tab-alm-achievements">🎖️ Achievements (${state.achievements.length}/${ACHIEVEMENTS.length})</button>
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
          <h2 class="modal-title">🌙 End of Day — ${ds.season.toUpperCase()} Day ${ds.day} (Year ${ds.year})</h2>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 12px;font-size:13.5px;">
            Rest at the Homestead Farmhouse to advance overnight crop growth, machine batches, and morning sprinklers.
          </p>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px 16px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13.5px;">
            <div>🥔 Tubers Harvested: <strong>${ds.harvestedCount}</strong></div>
            <div>🌱 Seeds Planted: <strong>${ds.cropsPlanted}</strong></div>
            <div>🪙 Gold Earned: <strong>+${ds.goldEarned}g</strong></div>
            <div>🛒 Gold Invested: <strong>${ds.goldSpent}g</strong></div>
            <div>📜 Contracts Fulfilled: <strong>${ds.questsCompleted}</strong></div>
            <div>🌦️ Tomorrow: <strong>${state.calendar.tomorrowWeather.toUpperCase()}</strong></div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button class="btn btn-wood" id="btn-cancel-sleep">Stay Awake</button>
            <button class="btn btn-success" id="btn-confirm-sleep" data-testid="btn-confirm-sleep">
              🌅 Sleep & Save to Next Morning
            </button>
          </div>
        </div>
      </div>
    `;

    this.modalBackdropEl.querySelector('#btn-cancel-sleep')!.addEventListener('click', () => {
      if (state.calendar.hour >= 22) {
        // At 22:00 bedtime, sleeping is required to start the new day
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
          <h2 class="modal-title">⚙️ Settings, Audio, Controls & Save Management</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-body">
          <h3 style="margin:0 0 8px;font-size:15px;">🔊 Audio & Accessibility</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;margin-bottom:14px;display:flex;flex-direction:column;gap:10px;">
            <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;">
              <span>🎵 Music Volume (${Math.round(s.musicVolume * 100)}%)</span>
              <input type="range" id="set-music" min="0" max="100" value="${Math.round(s.musicVolume * 100)}" style="width:180px;" />
            </label>
            <label style="display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;">
              <span>🔔 Sound Effects & Ambience (${Math.round(s.sfxVolume * 100)}%)</span>
              <input type="range" id="set-sfx" min="0" max="100" value="${Math.round(s.sfxVolume * 100)}" style="width:180px;" />
            </label>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:13px;font-weight:700;">
              <label><input type="checkbox" id="set-mute" ${s.muted ? 'checked' : ''} /> Mute All Audio</label>
              <label><input type="checkbox" id="set-shake" ${s.screenShake ? 'checked' : ''} /> Screen Shake</label>
              <label><input type="checkbox" id="set-motion" ${s.reducedMotion ? 'checked' : ''} /> Reduced Motion</label>
            </div>
          </div>

          <h3 style="margin:0 0 8px;font-size:15px;">💾 Browser-Local Save System & Backups</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;margin-bottom:14px;">
            <p style="margin:0 0 10px;font-size:12px;color:#4e3019;line-height:1.4;">
              <strong>Local Storage Notice:</strong> Saves are persisted locally in this browser profile using IndexedDB (with a last-known-good recovery backup). They are not synchronized to a cloud server and may be lost if you clear site data or play in a private/incognito window. Use Export Save below to keep a permanent file backup.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-success btn-sm" id="set-btn-save" data-testid="settings-save-btn">💾 Save Farm Now</button>
              <button class="btn btn-primary btn-sm" id="set-btn-export" data-testid="settings-export-btn">📤 Export Save JSON</button>
              <button class="btn btn-wood btn-sm" id="set-btn-import" data-testid="settings-import-btn">📥 Import Save JSON</button>
              <button class="btn btn-danger btn-sm" id="set-btn-reset" data-testid="settings-reset-btn">🗑️ Reset / Delete Save</button>
            </div>
          </div>

          <h3 style="margin:0 0 8px;font-size:15px;">🎮 Controls & Quick Help</h3>
          <div style="background:#efe0c2;border:2px solid #b58d53;border-radius:12px;padding:12px;font-size:12.5px;line-height:1.5;">
            <div>• <strong>Move:</strong> WASD / Arrow Keys, Touch D-Pad, or click adjacent tiles</div>
            <div>• <strong>Use Selected Tool:</strong> Click target tile, press <strong>E</strong>, or tap <strong>Use Tool</strong></div>
            <div>• <strong>Select Tools:</strong> Keys <strong>1–5</strong> (1: Spade, 2: Hilling Hoe, 3: Watering Can, 4: Harvest Fork, 5: Seed/Compost Pouch)</div>
            <div>• <strong>Cycle Seed / Compost in Pouch:</strong> Press <strong>Tab</strong> or click the Active Pouch card</div>
            <div>• <strong>Refill Watering Can:</strong> Use Watering Can on the Stone Well or Springfed Pond on the West side</div>
            <div>• <strong>Pause / Menus:</strong> <strong>M</strong> Shop, <strong>I</strong> Backpack, <strong>J</strong> Quests, <strong>B</strong> Build, <strong>K</strong> Festival Almanac, <strong>N</strong> Sleep</div>
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
          <h2 class="modal-title">📤 Export Validated Save Backup</h2>
          <button class="modal-close-btn" id="modal-close">✕</button>
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
            <button class="btn btn-wood btn-sm" id="btn-copy-export" data-testid="btn-copy-export">📋 Copy JSON</button>
            <button class="btn btn-primary btn-sm" id="btn-download-export" data-testid="btn-download-export">💾 Download .json File</button>
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
          <h2 class="modal-title">📥 Import Save File</h2>
          <button class="modal-close-btn" id="modal-close">✕</button>
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
            <button class="btn btn-success btn-sm" id="btn-confirm-import" data-testid="btn-confirm-import">✅ Validate & Import Farm</button>
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
          <h2 class="modal-title">⚠️ ${this.escapeHtml(title)}</h2>
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
          <h2 class="modal-title">🎨 SPUDSTEAD — Credits & Attribution</h2>
          <button class="modal-close-btn" id="modal-close" data-testid="modal-close">✕</button>
        </div>
        <div class="modal-body" style="font-size:13.5px;line-height:1.55;">
          <p><strong>SPUDSTEAD: Specialty-Potato Farming Simulator</strong></p>
          <p>• <strong>Game Design, Simulation & Engineering:</strong> Original TypeScript + HTML5 2D Canvas Engine</p>
          <p>• <strong>Visual Art & Illustrations:</strong> Original bespoke generated illustrations, NPC portraits, and custom sprite sheets stored locally in <code>public/assets/art/</code></p>
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
