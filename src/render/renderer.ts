import {
  MACHINE_BLUEPRINTS,
  NPCS,
  PLOT_INFO,
  POTATO_VARIETIES,
  QUESTS,
  VARIETY_ORDER
} from '../data/content';
import {
  GameState,
  MachineType,
  NpcId,
  PlacedMachine,
  PlotId,
  SoilTile
} from '../data/types';
import { getQuestProgress, getTargetCoordsForTool, hasUpgrade } from '../sim/simulation';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_SIZE,
  getTileAt
} from '../sim/worldMap';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export class WorldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cameraX = 12 * TILE_SIZE;
  private cameraY = 8 * TILE_SIZE;
  private zoom = 1.12;
  private dpr = 1;
  private animTime = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;

  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private hoverTile: { x: number; y: number } | null = null;
  private placementMode: MachineType | null = null;

  private spriteSheet: HTMLImageElement | null = null;
  private spriteSheetLoaded = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.loadSprites();
    this.resize();
  }

  private loadSprites(): void {
    const img = new Image();
    img.onload = () => {
      this.spriteSheet = img;
      this.spriteSheetLoaded = true;
    };
    img.src = './assets/art/potato-varieties.png';

    // Preload UI icons and portraits so modals render instantaneously with zero image decode lag
    for (const vId of VARIETY_ORDER) {
      const icon = new Image();
      icon.src = `./assets/art/icon-${vId}.png`;
    }
    for (const pName of ['barnaby', 'mireille', 'mossy', 'farmer']) {
      const port = new Image();
      port.src = `./assets/art/portrait-${pName}.png`;
    }
  }

  public resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(240, Math.floor(rect.height));
    if (this.canvas.width !== w * this.dpr || this.canvas.height !== h * this.dpr) {
      this.canvas.width = w * this.dpr;
      this.canvas.height = h * this.dpr;
    }
    if (w < 600) {
      this.zoom = 0.85;
    } else if (w < 1024) {
      this.zoom = 1.0;
    } else {
      this.zoom = 1.12;
    }
  }

  public setHoverTile(coord: { x: number; y: number } | null): void {
    this.hoverTile = coord;
  }

  public getHoverTile(): { x: number; y: number } | null {
    return this.hoverTile;
  }

  public setPlacementMode(type: MachineType | null): void {
    this.placementMode = type;
  }

  public screenToTile(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const viewW = rect.width;
    const viewH = rect.height;

    const worldX = (sx - viewW / 2) / this.zoom + this.cameraX;
    const worldY = (sy - viewH / 2) / this.zoom + this.cameraY;

    return {
      x: Math.floor(worldX / TILE_SIZE),
      y: Math.floor(worldY / TILE_SIZE)
    };
  }

  public spawnActionParticles(
    tileX: number,
    tileY: number,
    kind: 'dig' | 'water' | 'hill' | 'harvest' | 'plant',
    reducedMotion: boolean
  ): void {
    const cx = (tileX + 0.5) * TILE_SIZE;
    const cy = (tileY + 0.5) * TILE_SIZE;
    const count = reducedMotion ? 4 : 14;

    for (let i = 0; i < count; i++) {
      if (this.particles.length > 160) this.particles.shift();
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = 25 + Math.random() * 55;
      let color = '#6b4423';
      let size = 3.5;
      if (kind === 'water') {
        color = i % 2 === 0 ? '#5ec8ff' : '#bceaff';
        size = 3;
      } else if (kind === 'harvest') {
        color = i % 3 === 0 ? '#ffd84d' : i % 2 === 0 ? '#e8bc4a' : '#76c442';
        size = 4.5;
      } else if (kind === 'plant') {
        color = i % 2 === 0 ? '#8fd158' : '#7b5230';
        size = 3;
      }

      this.particles.push({
        x: cx + (Math.random() - 0.5) * 14,
        y: cy + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 38,
        gravity: 130,
        color,
        size,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.25
      });
    }
  }

  public spawnFloatingText(
    tileX: number,
    tileY: number,
    text: string,
    color: string = '#fff6d6'
  ): void {
    if (this.floatingTexts.length > 20) this.floatingTexts.shift();
    this.floatingTexts.push({
      x: (tileX + 0.5) * TILE_SIZE,
      y: tileY * TILE_SIZE,
      text,
      color,
      life: 0,
      maxLife: 1.45
    });
  }

  public triggerShake(intensity = 3.5, duration = 0.16, enabled = true): void {
    if (!enabled) return;
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  public render(state: GameState, dt: number): void {
    this.animTime += state.settings.reducedMotion ? dt * 0.25 : dt;

    // Smooth camera follow around player, allowing headroom at top for HUD plaques
    const targetCamX = (state.player.x + 1.5) * TILE_SIZE;
    const targetCamY = (state.player.y + 0.8) * TILE_SIZE;
    this.cameraX += (targetCamX - this.cameraX) * Math.min(1, dt * 8);
    this.cameraY += (targetCamY - this.cameraY) * Math.min(1, dt * 8);

    const viewW = this.canvas.width / this.dpr;
    const viewH = this.canvas.height / this.dpr;

    const halfW = viewW / (2 * this.zoom);
    const halfH = viewH / (2 * this.zoom);
    const worldW = MAP_WIDTH * TILE_SIZE;
    const worldH = MAP_HEIGHT * TILE_SIZE;

    if (worldW > halfW * 2) {
      this.cameraX = Math.max(halfW - 24, Math.min(worldW - halfW + 24, this.cameraX));
    } else {
      this.cameraX = worldW / 2;
    }
    if (worldH > halfH * 2) {
      this.cameraY = Math.max(halfH - 56, Math.min(worldH - halfH + 48, this.cameraY));
    } else {
      this.cameraY = worldH / 2;
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      if (state.settings.screenShake && !state.settings.reducedMotion) {
        shakeX = (Math.random() - 0.5) * 2 * this.shakeIntensity;
        shakeY = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      }
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    ctx.fillStyle = '#2d4c2b';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.cameraX, -this.cameraY);

    // 1. Base terrain, continuous paths, pond bank, and plot soil
    this.drawTerrainLayer(ctx, state);

    // 2. Ground target preview
    this.drawTargetPreview(ctx, state);

    // 3. Y-sorted entities
    const drawables: { ySort: number; draw: () => void }[] = [];

    // Perimeter trees
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const isBorder = x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1;
        if (isBorder && (x + y) % 2 === 0) {
          const tx = x;
          const ty = y;
          drawables.push({
            ySort: (ty + 0.9) * TILE_SIZE,
            draw: () => this.drawTree(ctx, tx, ty, state.calendar.season)
          });
        }
      }
    }

    // Buildings & Landmarks
    drawables.push({
      ySort: 4.85 * TILE_SIZE,
      draw: () => this.drawFarmhouse(ctx, state)
    });
    drawables.push({
      ySort: 4.7 * TILE_SIZE,
      draw: () => this.drawRootCellar(ctx)
    });
    drawables.push({
      ySort: 4.85 * TILE_SIZE,
      draw: () => this.drawBarnabyPavilion(ctx)
    });
    drawables.push({
      ySort: 4.85 * TILE_SIZE,
      draw: () => this.drawMarketStall(ctx, state)
    });
    drawables.push({
      ySort: 9.8 * TILE_SIZE,
      draw: () => this.drawStoneWell(ctx)
    });
    drawables.push({
      ySort: 4.7 * TILE_SIZE,
      draw: () => this.drawFestivalPlinth(ctx, state)
    });
    drawables.push({
      ySort: 16.7 * TILE_SIZE,
      draw: () => this.drawCommunityAidBarrel(ctx)
    });

    for (const plotId of ['plot_south', 'plot_east', 'plot_greenhouse'] as PlotId[]) {
      const pInfo = PLOT_INFO[plotId];
      const unlocked = state.unlockedPlots.includes(plotId);
      drawables.push({
        ySort: (pInfo.signY + 0.85) * TILE_SIZE,
        draw: () =>
          this.drawPlotSign(ctx, pInfo.signX, pInfo.signY, pInfo.name, pInfo.badge, unlocked)
      });
    }

    for (const tile of state.tiles) {
      if (tile.debris !== 'none') {
        drawables.push({
          ySort: (tile.y + 0.65) * TILE_SIZE,
          draw: () => this.drawDebris(ctx, tile)
        });
      }
      if (tile.crop) {
        drawables.push({
          ySort: (tile.y + 0.72) * TILE_SIZE,
          draw: () => this.drawCrop(ctx, tile)
        });
      }
    }

    for (const m of state.machines) {
      drawables.push({
        ySort: (m.y + 0.8) * TILE_SIZE,
        draw: () => this.drawMachine(ctx, m, state)
      });
    }

    for (const npcId of ['barnaby', 'mireille', 'mossy'] as NpcId[]) {
      const npc = NPCS[npcId];
      drawables.push({
        ySort: (npc.y + 0.85) * TILE_SIZE,
        draw: () => this.drawNpc(ctx, npc.id, npc.x, npc.y, state)
      });
    }

    drawables.push({
      ySort: (state.player.y + 0.86) * TILE_SIZE,
      draw: () => this.drawPlayer(ctx, state)
    });

    drawables.sort((a, b) => a.ySort - b.ySort);
    for (const d of drawables) {
      d.draw();
    }

    if (state.unlockedPlots.includes('plot_greenhouse')) {
      this.drawGreenhouseFrame(ctx);
    }

    this.updateAndDrawParticles(ctx, dt);
    ctx.restore();

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    this.drawWeatherAndLightingOverlay(ctx, state, viewW, viewH);
    ctx.restore();
  }

  private drawTerrainLayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const season = state.calendar.season;
    const grassColors: Record<typeof season, [string, string]> = {
      spring: ['#619c44', '#58913c'],
      summer: ['#54903a', '#4b8333'],
      autumn: ['#8c7d3b', '#7f7032'],
      winter: ['#cfdbe6', '#c3d1de']
    };
    const [g1, g2] = grassColors[season];

    for (const tile of state.tiles) {
      const px = tile.x * TILE_SIZE;
      const py = tile.y * TILE_SIZE;

      ctx.fillStyle = (tile.x + tile.y) % 2 === 0 ? g1 : g2;
      ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);

      // Decorative wildflowers and clover tufts on open grass
      if (tile.terrain === 'grass' && (tile.x * 7 + tile.y * 13) % 5 === 0) {
        ctx.fillStyle = season === 'winter' ? '#e8f1f8' : '#73b352';
        ctx.beginPath();
        ctx.arc(px + 16, py + 20, 3, 0, Math.PI * 2);
        ctx.arc(px + 22, py + 24, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (season === 'spring' || season === 'summer') {
          ctx.fillStyle = (tile.x + tile.y) % 2 === 0 ? '#fff176' : '#f48fb1';
          ctx.beginPath();
          ctx.arc(px + 18, py + 18, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (tile.terrain === 'path') {
        // Continuous connected warm gravel/cobble path without grid gaps!
        ctx.fillStyle = season === 'winter' ? '#b8aea0' : '#c79f67';
        ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
        // Subtle cobblestones
        ctx.fillStyle = season === 'winter' ? '#a39889' : '#b38950';
        ctx.beginPath();
        ctx.ellipse(px + 14, py + 16, 7, 5, 0.2, 0, Math.PI * 2);
        ctx.ellipse(px + 34, py + 32, 8, 5, -0.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = season === 'winter' ? '#cfc6b8' : '#d6b27c';
        ctx.beginPath();
        ctx.ellipse(px + 32, py + 14, 5, 3.5, 0, 0, Math.PI * 2);
        ctx.ellipse(px + 16, py + 36, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (tile.terrain === 'stone_floor') {
        ctx.fillStyle = '#8b857c';
        ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
        ctx.strokeStyle = '#6e685f';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.fillStyle = '#9c968d';
        ctx.fillRect(px + 6, py + 6, 16, 14);
        ctx.fillRect(px + 26, py + 24, 16, 16);
      } else if (tile.terrain === 'forage_ground') {
        ctx.fillStyle = season === 'winter' ? '#9cb0b8' : '#467834';
        ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
      } else if (tile.terrain === 'water') {
        ctx.fillStyle = '#2474a6';
        ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);
        const wave = Math.sin(this.animTime * 2.5 + tile.x * 0.9 + tile.y * 0.7) * 4;
        ctx.fillStyle = 'rgba(175, 235, 255, 0.35)';
        ctx.beginPath();
        ctx.ellipse(px + 24 + wave, py + 24, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        if ((tile.x + tile.y) % 3 === 0) {
          ctx.fillStyle = '#4ca64c';
          ctx.beginPath();
          ctx.arc(px + 20, py + 22, 8, 0.2, Math.PI * 1.9);
          ctx.fill();
          ctx.fillStyle = '#ffb6c1';
          ctx.beginPath();
          ctx.arc(px + 18, py + 20, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (tile.terrain === 'farm_soil') {
        const unlocked = !tile.plotId || state.unlockedPlots.includes(tile.plotId);
        if (!unlocked) {
          ctx.fillStyle = season === 'winter' ? '#aebbc4' : '#527839';
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = 'rgba(92, 62, 34, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        } else {
          const mRatio = tile.moisture / 100;
          if (tile.tilled || tile.crop) {
            const r = Math.round(136 - mRatio * 64);
            const g = Math.round(94 - mRatio * 48);
            const b = Math.round(56 - mRatio * 32);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(px, py, TILE_SIZE + 0.5, TILE_SIZE + 0.5);

            ctx.fillStyle = `rgba(32, 18, 8, ${0.28 + mRatio * 0.25})`;
            for (let fy = 9; fy <= 37; fy += 13) {
              ctx.fillRect(px + 3, py + fy, TILE_SIZE - 6, 4.5);
            }

            if (tile.fertility >= 68) {
              ctx.fillStyle = 'rgba(240, 198, 75, 0.55)';
              ctx.fillRect(px + 9, py + 14, 3, 3);
              ctx.fillRect(px + 32, py + 26, 3, 3);
              ctx.fillRect(px + 18, py + 36, 3, 3);
            }
          } else {
            ctx.fillStyle = tile.plotId === 'plot_greenhouse' ? '#6d5438' : '#7c6240';
            ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          }
        }
      }
    }

    // Draw sandy stone shoreline border around Pond (x: 1..4, y: 9..13)
    ctx.strokeStyle = '#9e8c6c';
    ctx.lineWidth = 5;
    ctx.strokeRect(1 * TILE_SIZE, 9 * TILE_SIZE, 4 * TILE_SIZE, 5 * TILE_SIZE);

    // Draw timber borders around the 4 farm plots
    const plotBounds: { id: PlotId; x0: number; y0: number; w: number; h: number }[] = [
      { id: 'plot_homestead', x0: 8, y0: 7, w: 8, h: 5 },
      { id: 'plot_south', x0: 8, y0: 13, w: 8, h: 4 },
      { id: 'plot_east', x0: 17, y0: 8, w: 7, h: 5 },
      { id: 'plot_greenhouse', x0: 17, y0: 14, w: 7, h: 4 }
    ];

    for (const pb of plotBounds) {
      const unlocked = state.unlockedPlots.includes(pb.id);
      ctx.strokeStyle = unlocked ? '#5c3a1e' : '#8c3b2b';
      ctx.lineWidth = unlocked ? 4 : 3;
      ctx.strokeRect(
        pb.x0 * TILE_SIZE,
        pb.y0 * TILE_SIZE,
        pb.w * TILE_SIZE,
        pb.h * TILE_SIZE
      );
    }
  }

  private drawTargetPreview(ctx: CanvasRenderingContext2D, state: GameState): void {
    const hover = this.hoverTile;
    if (!hover) return;
    if (hover.x < 0 || hover.x >= MAP_WIDTH || hover.y < 0 || hover.y >= MAP_HEIGHT) return;

    if (this.placementMode) {
      const radius =
        this.placementMode === 'sprinkler'
          ? hasUpgrade(state, 'irrigation_2')
            ? 2
            : 1
          : 0;
      if (radius > 0) {
        ctx.fillStyle = 'rgba(90, 200, 255, 0.18)';
        ctx.strokeStyle = 'rgba(90, 200, 255, 0.75)';
        ctx.lineWidth = 2;
        ctx.fillRect(
          (hover.x - radius) * TILE_SIZE,
          (hover.y - radius) * TILE_SIZE,
          (radius * 2 + 1) * TILE_SIZE,
          (radius * 2 + 1) * TILE_SIZE
        );
        ctx.strokeRect(
          (hover.x - radius) * TILE_SIZE,
          (hover.y - radius) * TILE_SIZE,
          (radius * 2 + 1) * TILE_SIZE,
          (radius * 2 + 1) * TILE_SIZE
        );
      }

      const tile = getTileAt(state.tiles, hover.x, hover.y);
      const valid =
        tile &&
        !tile.machineId &&
        !tile.crop &&
        tile.debris === 'none' &&
        (tile.terrain === 'stone_floor' ||
          (tile.terrain === 'farm_soil' &&
            (!tile.plotId || state.unlockedPlots.includes(tile.plotId))));

      ctx.fillStyle = valid ? 'rgba(80, 225, 100, 0.35)' : 'rgba(235, 70, 70, 0.4)';
      ctx.strokeStyle = valid ? '#55f068' : '#ff5252';
      ctx.lineWidth = 2.5;
      ctx.fillRect(hover.x * TILE_SIZE + 2, hover.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeRect(hover.x * TILE_SIZE + 2, hover.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      return;
    }

    const coords = getTargetCoordsForTool(
      state,
      hover.x,
      hover.y,
      state.player.selectedTool
    );
    const dist = Math.hypot(hover.x - state.player.x, hover.y - state.player.y);
    const inRange = dist <= 2.65;

    for (const c of coords) {
      if (c.x < 0 || c.x >= MAP_WIDTH || c.y < 0 || c.y >= MAP_HEIGHT) continue;
      ctx.strokeStyle = inRange ? 'rgba(255, 232, 128, 0.9)' : 'rgba(255, 120, 90, 0.65)';
      ctx.fillStyle = inRange ? 'rgba(255, 232, 128, 0.14)' : 'rgba(255, 120, 90, 0.1)';
      ctx.lineWidth = 2;
      ctx.fillRect(c.x * TILE_SIZE + 2, c.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeRect(c.x * TILE_SIZE + 2, c.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    }
  }

  private drawTree(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    season: GameState['calendar']['season']
  ): void {
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.8) * TILE_SIZE;
    const sway = Math.sin(this.animTime * 1.8 + tx * 0.7 + ty * 0.5) * 2.2;

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#5c3c22';
    ctx.fillRect(cx - 5, cy - 18, 10, 20);

    const canopyCol =
      season === 'autumn'
        ? '#c86d28'
        : season === 'winter'
          ? '#d8e6f0'
          : season === 'spring'
            ? '#52a346'
            : '#3e8738';
    const hiCol =
      season === 'autumn'
        ? '#e5943c'
        : season === 'winter'
          ? '#f0f7fc'
          : '#72bf58';

    ctx.fillStyle = canopyCol;
    ctx.beginPath();
    ctx.arc(cx + sway, cy - 28, 20, 0, Math.PI * 2);
    ctx.arc(cx - 12 + sway * 0.8, cy - 20, 15, 0, Math.PI * 2);
    ctx.arc(cx + 12 + sway * 0.8, cy - 20, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hiCol;
    ctx.beginPath();
    ctx.arc(cx - 4 + sway, cy - 33, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFarmhouse(ctx: CanvasRenderingContext2D, state: GameState): void {
    const x = 2 * TILE_SIZE;
    const y = 1 * TILE_SIZE;
    const w = 5 * TILE_SIZE;
    const h = 4 * TILE_SIZE;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + 6, y + h - 8, w - 4, 16);

    ctx.fillStyle = '#f2e3c6';
    ctx.fillRect(x + 8, y + 54, w - 16, h - 58);
    ctx.strokeStyle = '#5c3a21';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 8, y + 54, w - 16, h - 58);

    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(x + 8, y + 100, w - 16, 6);
    ctx.fillRect(x + 70, y + 54, 6, h - 58);
    ctx.fillRect(x + w - 76, y + 54, 6, h - 58);

    ctx.fillStyle = '#9e4736';
    ctx.fillRect(x + 26, y - 4, 26, 52);
    for (let i = 0; i < 3; i++) {
      const puffT = (this.animTime * 0.7 + i * 0.33) % 1;
      ctx.fillStyle = `rgba(235, 235, 240, ${(1 - puffT) * 0.45})`;
      ctx.beginPath();
      ctx.arc(
        x + 39 + Math.sin(this.animTime * 2 + i) * 6,
        y - 8 - puffT * 34,
        7 + puffT * 9,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.fillStyle = '#b54b35';
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 62);
    ctx.lineTo(x + w / 2, y + 4);
    ctx.lineTo(x + w + 4, y + 62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6e281a';
    ctx.lineWidth = 3;
    ctx.stroke();

    const isEvening = state.calendar.hour >= 18;
    ctx.fillStyle = isEvening ? '#ffd86b' : '#8fd0e8';
    ctx.fillRect(x + 26, y + 114, 32, 30);
    ctx.fillRect(x + w - 58, y + 114, 32, 30);
    ctx.strokeStyle = '#4a2e18';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 26, y + 114, 32, 30);
    ctx.strokeRect(x + w - 58, y + 114, 32, 30);

    // Flower boxes below windows
    ctx.fillStyle = '#6e4423';
    ctx.fillRect(x + 22, y + 144, 40, 10);
    ctx.fillRect(x + w - 62, y + 144, 40, 10);
    for (const fx of [x + 28, x + 42, x + 54, x + w - 56, x + w - 42, x + w - 30]) {
      ctx.fillStyle = '#4caf50';
      ctx.beginPath();
      ctx.arc(fx, y + 143, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fx % 2 === 0 ? '#ffeb3b' : '#ff7043';
      ctx.beginPath();
      ctx.arc(fx, y + 141, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#754724';
    ctx.fillRect(x + w / 2 - 20, y + h - 56, 40, 52);
    ctx.strokeStyle = '#3d220e';
    ctx.strokeRect(x + w / 2 - 20, y + h - 56, 40, 52);

    this.drawWorldLabel(ctx, x + w / 2, y + h - 62, '🏠 Farmhouse (Sleep)', '#fff4d2');
  }

  private drawRootCellar(ctx: CanvasRenderingContext2D): void {
    const x = 7 * TILE_SIZE;
    const y = 3 * TILE_SIZE;
    ctx.fillStyle = '#5c422c';
    ctx.fillRect(x + 4, y + 20, TILE_SIZE - 8, TILE_SIZE + 18);
    ctx.strokeStyle = '#2e1d10';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + 4, y + 20, TILE_SIZE - 8, TILE_SIZE + 18);
    this.drawWorldLabel(ctx, x + 24, y + 14, 'Cellar', '#e8d8b8');
  }

  private drawBarnabyPavilion(ctx: CanvasRenderingContext2D): void {
    const x = 19 * TILE_SIZE;
    const y = 1 * TILE_SIZE;
    const w = 4 * TILE_SIZE;
    const h = 4 * TILE_SIZE;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 6, y + h - 8, w - 8, 14);

    ctx.fillStyle = '#784c28';
    ctx.fillRect(x + 8, y + 46, w - 16, h - 50);

    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#3f8a42' : '#f5ebd1';
      ctx.fillRect(x + 4 + i * ((w - 8) / 6), y + 24, (w - 8) / 6, 32);
    }
    ctx.strokeStyle = '#3d2410';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 24, w - 8, 32);

    const sackColors = ['#e8bc4a', '#cc4844', '#a47044', '#7e44a8'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = sackColors[i];
      ctx.beginPath();
      ctx.arc(x + 32 + i * 38, y + h - 24, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3d2410';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    this.drawWorldLabel(ctx, x + w / 2, y + h - 46, "🏪 Barnaby's Shop", '#fff4d2');
  }

  private drawMarketStall(ctx: CanvasRenderingContext2D, state: GameState): void {
    const x = 23 * TILE_SIZE;
    const y = 1 * TILE_SIZE;
    const w = 4 * TILE_SIZE;
    const h = 4 * TILE_SIZE;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 6, y + h - 8, w - 8, 14);

    ctx.fillStyle = '#82522b';
    ctx.fillRect(x + 8, y + 46, w - 16, h - 50);

    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#a83832' : '#f7e6c4';
      ctx.fillRect(x + 4 + i * ((w - 8) / 6), y + 24, (w - 8) / 6, 32);
    }
    ctx.strokeStyle = '#3d2410';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 24, w - 8, 32);

    const demandVar = POTATO_VARIETIES[state.calendar.dailyDemandVariety];
    this.drawWorldLabel(
      ctx,
      x + w / 2,
      y + h - 46,
      `⚖️ Market (${demandVar.name} +25%)`,
      '#ffe58f'
    );
  }

  private drawStoneWell(ctx: CanvasRenderingContext2D): void {
    const cx = 5.5 * TILE_SIZE;
    const cy = 9.5 * TILE_SIZE;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7e848c';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 20, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#45494f';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.fillStyle = '#287ab8';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#633e20';
    ctx.fillRect(cx - 17, cy - 26, 4, 28);
    ctx.fillRect(cx + 13, cy - 26, 4, 28);
    ctx.fillStyle = '#a34832';
    ctx.beginPath();
    ctx.moveTo(cx - 22, cy - 22);
    ctx.lineTo(cx, cy - 38);
    ctx.lineTo(cx + 22, cy - 22);
    ctx.closePath();
    ctx.fill();

    this.drawWorldLabel(ctx, cx, cy - 44, 'Well (Refill)', '#bfeaff');
  }

  private drawFestivalPlinth(ctx: CanvasRenderingContext2D, state: GameState): void {
    const cx = 17.5 * TILE_SIZE;
    const cy = 4.2 * TILE_SIZE;

    ctx.fillStyle = '#8d867e';
    ctx.fillRect(cx - 18, cy - 16, 36, 32);
    ctx.strokeStyle = '#4f4a44';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - 18, cy - 16, 36, 32);

    if (state.festival.won) {
      const glow = 0.6 + Math.sin(this.animTime * 4) * 0.25;
      ctx.fillStyle = `rgba(255, 215, 40, ${glow * 0.45})`;
      ctx.beginPath();
      ctx.arc(cx, cy - 22, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffd728';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 22, 12, 16, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#9c6b0c';
      ctx.lineWidth = 2;
      ctx.stroke();
      this.drawWorldLabel(ctx, cx, cy - 44, '🏆 GOLDEN SPUD', '#ffe659');
    } else {
      this.drawWorldLabel(ctx, cx, cy - 24, 'Festival Plinth', '#f5e2b8');
    }
  }

  private drawCommunityAidBarrel(ctx: CanvasRenderingContext2D): void {
    const cx = 3.5 * TILE_SIZE;
    const cy = 16.5 * TILE_SIZE;
    ctx.fillStyle = '#734827';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3b2210';
    ctx.lineWidth = 2;
    ctx.stroke();
    this.drawWorldLabel(ctx, cx, cy - 26, 'Grove & Aid', '#d9f7be');
  }

  private drawPlotSign(
    ctx: CanvasRenderingContext2D,
    tx: number,
    ty: number,
    title: string,
    badge: string,
    unlocked: boolean
  ): void {
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.7) * TILE_SIZE;
    ctx.fillStyle = '#5c3b1e';
    ctx.fillRect(cx - 3, cy - 16, 6, 18);
    ctx.fillStyle = unlocked ? '#4c7a34' : '#8c5328';
    ctx.fillRect(cx - 18, cy - 28, 36, 16);
    ctx.strokeStyle = '#2e1b0c';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 18, cy - 28, 36, 16);
    if (!unlocked) {
      this.drawWorldLabel(ctx, cx, cy - 34, `${title} (${badge})`, '#ffd591');
    }
  }

  private drawDebris(ctx: CanvasRenderingContext2D, tile: SoilTile): void {
    const cx = (tile.x + 0.5) * TILE_SIZE;
    const cy = (tile.y + 0.58) * TILE_SIZE;

    if (tile.debris === 'weeds') {
      const sway = Math.sin(this.animTime * 2.5 + tile.x) * 2;
      ctx.fillStyle = '#488a32';
      for (const ox of [-8, 0, 8]) {
        ctx.beginPath();
        ctx.moveTo(cx + ox - 4, cy + 8);
        ctx.lineTo(cx + ox + sway, cy - 12);
        ctx.lineTo(cx + ox + 4, cy + 8);
        ctx.closePath();
        ctx.fill();
      }
    } else if (tile.debris === 'rock') {
      ctx.fillStyle = '#7c8288';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, 14, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#494e52';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#9fa6ad';
      ctx.beginPath();
      ctx.ellipse(cx - 4, cy - 2, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (tile.debris === 'wild_sprout') {
      ctx.fillStyle = '#85d64b';
      ctx.beginPath();
      ctx.arc(cx, cy - 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff394';
      ctx.beginPath();
      ctx.arc(cx, cy - 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCrop(ctx: CanvasRenderingContext2D, tile: SoilTile): void {
    const crop = tile.crop;
    if (!crop) return;

    const px = tile.x * TILE_SIZE;
    const py = tile.y * TILE_SIZE;
    const cx = px + TILE_SIZE / 2;
    const cy = py + TILE_SIZE * 0.65;
    const vDef = POTATO_VARIETIES[crop.varietyId];

    if (crop.hillLevel > 0) {
      const moundH = crop.hillLevel === 2 ? 12 : 8;
      ctx.fillStyle = tile.moisture >= 45 ? '#4a2e16' : '#6e4929';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 20, moundH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2e1b0b';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const sway = Math.sin(this.animTime * 2.2 + tile.x * 0.8 + tile.y * 0.6) * 1.8;

    if (crop.stage === 0) {
      ctx.fillStyle = vDef.colorHex;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2d1c0e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#8ad84e';
      ctx.beginPath();
      ctx.arc(cx + sway * 0.3, cy - 6, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (crop.stage > 0 && this.spriteSheetLoaded && this.spriteSheet) {
      const row = VARIETY_ORDER.indexOf(crop.varietyId);
      const col = 3 + crop.stage;
      ctx.drawImage(
        this.spriteSheet,
        col * 64,
        row * 64,
        64,
        64,
        px - 4 + sway * 0.5,
        py - 10,
        56,
        56
      );
    } else {
      ctx.fillStyle = '#4c9e38';
      ctx.beginPath();
      ctx.arc(cx + sway, cy - crop.stage * 5, 6 + crop.stage * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (crop.hasWeeds) {
      ctx.strokeStyle = '#7bb835';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy + 6);
      ctx.lineTo(cx - 20, cy - 6);
      ctx.moveTo(cx + 16, cy + 6);
      ctx.lineTo(cx + 20, cy - 6);
      ctx.stroke();
    }
    if (crop.hasPests) {
      ctx.fillStyle = '#ff7b24';
      ctx.beginPath();
      ctx.arc(cx + 8, cy - 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c120c';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    if (crop.stage === 4) {
      const pulse = 0.55 + Math.sin(this.animTime * 4.5 + tile.x) * 0.35;
      ctx.strokeStyle = `rgba(255, 224, 75, ${pulse})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 21, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tile.moisture < 22) {
      ctx.fillStyle = '#5ec8ff';
      ctx.beginPath();
      ctx.arc(cx + 13, cy - 22, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawMachine(
    ctx: CanvasRenderingContext2D,
    m: PlacedMachine,
    state: GameState
  ): void {
    const cx = (m.x + 0.5) * TILE_SIZE;
    const cy = (m.y + 0.65) * TILE_SIZE;
    const isWorking = m.activeRecipeId !== null && !m.outputItem;
    const bounce = isWorking ? Math.sin(this.animTime * 9) * 2 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (m.type === 'sprinkler') {
      const upgraded = hasUpgrade(state, 'irrigation_2');
      ctx.fillStyle = upgraded ? '#ffd24c' : '#c98a38';
      ctx.fillRect(cx - 5, cy - 12, 10, 16);
      ctx.beginPath();
      ctx.arc(cx, cy - 14, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4a2e10';
      ctx.lineWidth = 2;
      ctx.stroke();

      const angle = this.animTime * 3.5;
      ctx.strokeStyle = '#bfeaff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(angle) * 12, cy - 14 - Math.sin(angle) * 6);
      ctx.lineTo(cx + Math.cos(angle) * 12, cy - 14 + Math.sin(angle) * 6);
      ctx.stroke();
      return;
    }

    if (m.type === 'composter') {
      // Wooden A-frame legs
      ctx.fillStyle = '#4e3019';
      ctx.fillRect(cx - 16, cy - 8, 5, 16);
      ctx.fillRect(cx + 11, cy - 8, 5, 16);
      // Oak barrel body with iron hoops
      ctx.fillStyle = '#784c28';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 10 + bounce, 17, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#331d0c';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = '#494e52';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy - 15 + bounce);
      ctx.lineTo(cx + 15, cy - 15 + bounce);
      ctx.moveTo(cx - 15, cy - 5 + bounce);
      ctx.lineTo(cx + 15, cy - 5 + bounce);
      ctx.stroke();
      this.drawWorldLabel(ctx, cx, cy - 32, 'Composter', '#d9f7be');
    } else if (m.type === 'seed_cutter') {
      ctx.fillStyle = '#875c36';
      ctx.fillRect(cx - 16, cy - 20 + bounce, 32, 22);
      ctx.strokeStyle = '#331d0c';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx - 16, cy - 20 + bounce, 32, 22);
      ctx.fillStyle = '#cfd8dc';
      ctx.fillRect(cx - 10, cy - 25 + bounce, 20, 5);
      // Little cut seed tuber on table
      ctx.fillStyle = '#e8bc4a';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 11 + bounce, 4, 0, Math.PI * 2);
      ctx.arc(cx + 6, cy - 10 + bounce, 4, 0, Math.PI * 2);
      ctx.fill();
      this.drawWorldLabel(ctx, cx, cy - 32, 'Seed Cutter', '#fff1b8');
    } else if (m.type === 'kitchen') {
      ctx.fillStyle = '#ff6b2b';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 3, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#373b40';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 10 + bounce, 18, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181a1c';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Golden bubbling broth inside kettle
      ctx.fillStyle = '#f2b728';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 15 + bounce, 13, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      this.drawWorldLabel(ctx, cx, cy - 32, 'Spud Kitchen', '#ffd6e7');
    }

    if (m.outputItem) {
      const floatY = Math.sin(this.animTime * 4) * 3;
      ctx.fillStyle = '#49d45d';
      ctx.beginPath();
      ctx.arc(cx, cy - 46 + floatY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#184d20';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓', cx, cy - 42 + floatY);
    } else if (isWorking && m.durationHours > 0) {
      const pct = Math.min(1, m.progressHours / m.durationHours);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(cx - 16, cy - 46, 32, 6);
      ctx.fillStyle = '#ffd644';
      ctx.fillRect(cx - 15, cy - 45, 30 * pct, 4);
    }
  }

  private drawNpc(
    ctx: CanvasRenderingContext2D,
    id: NpcId,
    tx: number,
    ty: number,
    state: GameState
  ): void {
    const cx = (tx + 0.5) * TILE_SIZE;
    const cy = (ty + 0.72) * TILE_SIZE;
    const bob = Math.sin(this.animTime * 2.6 + tx) * 1.5;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    const outfitColor =
      id === 'barnaby' ? '#8c6239' : id === 'mireille' ? '#f5f5f5' : '#4a7036';
    const hatColor =
      id === 'barnaby' ? '#d9b066' : id === 'mireille' ? '#ffffff' : '#3a5c28';

    ctx.fillStyle = outfitColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 10 + bob, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2b1b0e';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#f2c299';
    ctx.beginPath();
    ctx.arc(cx, cy - 24 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 32 + bob, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const hasReadyQuest = QUESTS.some(
      (q) =>
        q.giver === id &&
        !state.completedQuests.includes(q.id) &&
        getQuestProgress(state, q.id).ready
    );

    const npcDef = NPCS[id];
    this.drawWorldLabel(
      ctx,
      cx,
      cy - 44 + bob,
      hasReadyQuest ? `❗ ${npcDef.name}` : npcDef.name,
      hasReadyQuest ? '#ffe566' : '#ffffff'
    );
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
    const p = state.player;
    const cx = (p.x + 0.5) * TILE_SIZE;
    const cy = (p.y + 0.72) * TILE_SIZE;
    const isMoving = p.action === 'walk';
    const stride = isMoving ? Math.sin(this.animTime * 12) * 3.5 : Math.sin(this.animTime * 3) * 1.2;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a2e16';
    ctx.beginPath();
    ctx.arc(cx - 5, cy + 1 + (isMoving ? stride : 0), 4, 0, Math.PI * 2);
    ctx.arc(cx + 5, cy + 1 - (isMoving ? stride : 0), 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3b6ca8';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11 + Math.abs(stride) * 0.3, 11, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1f140b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#c9382e';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 19, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f5c69d';
    ctx.beginPath();
    ctx.arc(cx, cy - 26 + Math.abs(stride) * 0.2, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#2b180a';
    if (p.facing !== 'up') {
      const ex = p.facing === 'left' ? -3 : p.facing === 'right' ? 3 : 0;
      ctx.beginPath();
      ctx.arc(cx - 3 + ex, cy - 26, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 3 + ex, cy - 26, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#e0b45c';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 34, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c9963e';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 37, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (p.actionTimer > 0 && p.action !== 'idle' && p.action !== 'walk') {
      const dirX = p.facing === 'left' ? -1 : p.facing === 'right' ? 1 : 0;
      const dirY = p.facing === 'up' ? -1 : p.facing === 'down' ? 1 : 0.5;
      const swing = Math.sin((1 - p.actionTimer / 0.4) * Math.PI);
      const tx = cx + dirX * (16 + swing * 10);
      const ty = cy - 12 + dirY * (10 + swing * 8);

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(swing * 0.9);
      if (p.action === 'water') {
        ctx.fillStyle = hasUpgrade(state, 'water_can_1') ? '#d47b39' : '#5898b8';
        ctx.fillRect(-7, -6, 14, 12);
      } else if (p.action === 'plant') {
        ctx.fillStyle = '#e8bc4a';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#8c5828';
        ctx.fillRect(-2, -12, 4, 20);
        ctx.fillStyle = '#cfd8dc';
        ctx.fillRect(-6, 6, 12, 6);
      }
      ctx.restore();
    }
  }

  private drawGreenhouseFrame(ctx: CanvasRenderingContext2D): void {
    const x = 17 * TILE_SIZE;
    const y = 14 * TILE_SIZE;
    const w = 7 * TILE_SIZE;
    const h = 4 * TILE_SIZE;

    ctx.save();
    ctx.strokeStyle = 'rgba(210, 242, 255, 0.55)';
    ctx.fillStyle = 'rgba(195, 238, 255, 0.08)';
    ctx.lineWidth = 3;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.lineWidth = 1.5;
    for (let gx = x + TILE_SIZE; gx < x + w; gx += TILE_SIZE) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.stroke();
    }
    this.drawWorldLabel(ctx, x + w / 2, y - 6, 'All-Season Glass Coldframe', '#d6f4ff');
    ctx.restore();
  }

  private drawWorldLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    color: string
  ): void {
    ctx.save();
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    const metrics = ctx.measureText(text);
    const padX = 6;
    const w = metrics.width + padX * 2;
    const h = 16;
    ctx.fillStyle = 'rgba(28, 18, 10, 0.78)';
    ctx.fillRect(x - w / 2, y - h + 3, w, h);
    ctx.strokeStyle = 'rgba(198, 152, 82, 0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2, y - h + 3, w, h);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - 1);
    ctx.restore();
  }

  private updateAndDrawParticles(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y -= dt * 22;
      const alpha = Math.max(0, 1 - ft.life / p_maxLife(ft));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#1f1208';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private drawWeatherAndLightingOverlay(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    viewW: number,
    viewH: number
  ): void {
    const hour = state.calendar.hour;
    const weather = state.calendar.weather;

    if (hour >= 17.5 && hour < 19.5) {
      const t = (hour - 17.5) / 2;
      ctx.fillStyle = `rgba(235, 130, 50, ${t * 0.16})`;
      ctx.fillRect(0, 0, viewW, viewH);
    } else if (hour >= 19.5) {
      const t = Math.min(1, (hour - 19.5) / 1.5);
      ctx.fillStyle = `rgba(18, 28, 58, ${0.16 + t * 0.18})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    if (weather === 'rainy' || weather === 'stormy') {
      ctx.fillStyle = 'rgba(30, 55, 85, 0.12)';
      ctx.fillRect(0, 0, viewW, viewH);

      const count = state.settings.reducedMotion ? 18 : weather === 'stormy' ? 65 : 42;
      ctx.strokeStyle = 'rgba(185, 228, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const rx = ((i * 97 + this.animTime * 260) % (viewW + 80)) - 40;
        const ry = ((i * 61 + this.animTime * 540) % (viewH + 60)) - 30;
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 6, ry + 14);
      }
      ctx.stroke();
    } else if (weather === 'frosty' || state.calendar.season === 'winter') {
      const count = state.settings.reducedMotion ? 14 : 36;
      ctx.fillStyle = 'rgba(240, 248, 255, 0.65)';
      for (let i = 0; i < count; i++) {
        const sx =
          ((i * 83 + Math.sin(this.animTime + i) * 18 + this.animTime * 35) %
            (viewW + 40)) -
          20;
        const sy = ((i * 53 + this.animTime * 75) % (viewH + 40)) - 20;
        ctx.beginPath();
        ctx.arc(sx, sy, (i % 2) + 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function p_maxLife(ft: FloatingText): number {
  return ft.maxLife || 1.45;
}
