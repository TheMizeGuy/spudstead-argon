import * as THREE from 'three';
import { NPCS, PLOT_INFO, POTATO_VARIETIES, QUESTS } from '../data/content';
import { GameState, PlacedMachine, PlotId, SoilTile } from '../data/types';
import { canPlaceMachineAt, getQuestProgress, hasUpgrade } from '../sim/simulation';
import { LANDMARKS, MAP_HEIGHT, MAP_WIDTH, PLOT_BOUNDS, getTileAt } from '../sim/worldMap';

interface Particle3D {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

export interface WorldWaypointTarget {
  x: number;
  y: number;
  label: string;
  subLabel?: string;
}

interface TileVisualNode {
  group: THREE.Group;
  baseMesh: THREE.Mesh;
  baseMat: THREE.MeshStandardMaterial;
  furrowGroup: THREE.Group;
  furrowMat: THREE.MeshStandardMaterial;
  contentGroup: THREE.Group;
  lastSignature: string;
}

export class WorldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private glCanvas: HTMLCanvasElement;
  private webgl: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster: THREE.Raycaster;
  private groundPlane: THREE.Plane;

  private ambientLight: THREE.AmbientLight;
  private hemiLight: THREE.HemisphereLight;
  private sunLight: THREE.DirectionalLight;
  private farmhouseGlowLight: THREE.PointLight;
  private kitchenFireLight: THREE.PointLight;
  private windowMaterials: THREE.MeshStandardMaterial[] = [];
  private lanternGlassMats: THREE.MeshStandardMaterial[] = [];

  private tileNodes: TileVisualNode[] = [];
  private composterBarrel: THREE.Object3D | null = null;
  private seedCutterBlade: THREE.Object3D | null = null;
  private kitchenStewMesh: THREE.Mesh | null = null;
  private trophyGroup: THREE.Group | null = null;

  private dynamicMachinesGroup: THREE.Group;
  private sprinklerRotors: THREE.Object3D[] = [];
  private lastMachinesSignature = '';

  private playerGroup: THREE.Group;
  private playerToolPivot: THREE.Group;
  private playerToolMeshes: Record<string, THREE.Object3D> = {};
  private npcGroups: Map<string, { group: THREE.Group; marker: THREE.Mesh }> = new Map();

  private hoverCursorMesh: THREE.Mesh;
  private hoverCursorMat: THREE.MeshBasicMaterial;
  private placementRangeMesh: THREE.Mesh;
  private placementRangeMat: THREE.MeshBasicMaterial;

  private waypointGroup!: THREE.Group;
  private waypointPointerMesh!: THREE.Group;
  private waypointRingMesh!: THREE.Mesh;
  private waypointBeamMesh!: THREE.Mesh;
  private waypointTrailDots: THREE.Mesh[] = [];
  private waypointTarget: WorldWaypointTarget | null = null;
  private hoverActionHint: { x: number; y: number; text: string; color: string } | null = null;

  private particlesGroup: THREE.Group;
  private particles: Particle3D[] = [];
  private weatherDropGroup: THREE.Group;
  private weatherDrops: THREE.Mesh[] = [];

  private plotFenceGroups: Map<string, THREE.Group> = new Map();
  private plotSignGroups: Map<string, THREE.Group> = new Map();
  private coldframeArchGroup: THREE.Group | null = null;

  private hoverTile: { x: number; y: number } | null = null;
  private placementMode: PlacedMachine['type'] | null = null;
  private floatingTexts: {
    wx: number;
    wz: number;
    text: string;
    color: string;
    life: number;
    maxLife: number;
  }[] = [];

  public static readonly MIN_ZOOM_SCALE = 0.65;
  public static readonly MAX_ZOOM_SCALE = 1.85;
  public static readonly DEFAULT_ZOOM_SCALE = 1.22;

  private animTime = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private viewportW = 1280;
  private viewportH = 720;
  private camTarget = new THREE.Vector3(11.5, 0, 9.0);
  private targetZoomScale = WorldRenderer.DEFAULT_ZOOM_SCALE;
  private currentZoomScale = WorldRenderer.DEFAULT_ZOOM_SCALE;

  // Procedural surface textures
  private grassTex!: THREE.CanvasTexture;
  private pathTex!: THREE.CanvasTexture;
  private soilTex!: THREE.CanvasTexture;
  private stoneTex!: THREE.CanvasTexture;
  private waterTex!: THREE.CanvasTexture;

  // Shared geometries & material cache for high-FPS 3D rendering
  private sphereGeo = new THREE.SphereGeometry(1, 10, 8);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  private coneGeo = new THREE.ConeGeometry(1, 1, 8);
  private dodecaGeo = new THREE.DodecahedronGeometry(1, 0);
  private harvestRingGeo: THREE.RingGeometry;
  private harvestRingMat: THREE.MeshBasicMaterial;
  private sharedMatCache = new Map<string, THREE.MeshStandardMaterial>();
  private shadowUpdateTimer = 0;

  private getSharedMat(color: number | string, roughness = 0.78): THREE.MeshStandardMaterial {
    const key = `${color}_${roughness}`;
    let m = this.sharedMatCache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness });
      this.sharedMatCache.set(key, m);
    }
    return m;
  }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2;';
    if (canvas.parentElement) {
      canvas.parentElement.insertBefore(this.glCanvas, canvas.nextSibling);
    }
    const ctx = this.glCanvas.getContext('2d');
    if (!ctx) throw new Error('2D overlay context unavailable');
    this.ctx = ctx;

    this.createProceduralTerrainTextures();

    this.harvestRingGeo = new THREE.RingGeometry(0.38, 0.46, 20);
    this.harvestRingGeo.rotateX(-Math.PI / 2);
    this.harvestRingMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a4d2c);
    this.scene.fog = new THREE.FogExp2(0x2a4d2c, 0.0048);

    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 160);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    try {
      this.webgl = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.webgl.shadowMap.enabled = true;
      this.webgl.shadowMap.type = THREE.PCFShadowMap;
      this.webgl.shadowMap.autoUpdate = false;
      this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
      this.webgl.toneMappingExposure = 1.08;
    } catch {
      this.webgl = null;
    }

    // Lighting setup
    this.ambientLight = new THREE.AmbientLight(0xfff4dc, 0.66);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xfff9e6, 0x3b5e2b, 0.56);
    this.hemiLight.position.set(0, 28, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2cc, 1.45);
    this.sunLight.position.set(18, 24, 16);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 95;
    const d = 25;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.farmhouseGlowLight = new THREE.PointLight(0xffb84d, 0.6, 9);
    this.farmhouseGlowLight.position.set(4.5, 1.5, 4.2);
    this.scene.add(this.farmhouseGlowLight);

    this.kitchenFireLight = new THREE.PointLight(0xff7722, 0.9, 6);
    this.kitchenFireLight.position.set(14.5, 1.1, 3.8);
    this.scene.add(this.kitchenFireLight);

    this.dynamicMachinesGroup = new THREE.Group();
    this.scene.add(this.dynamicMachinesGroup);

    this.particlesGroup = new THREE.Group();
    this.scene.add(this.particlesGroup);

    this.weatherDropGroup = new THREE.Group();
    this.scene.add(this.weatherDropGroup);

    this.playerGroup = new THREE.Group();
    this.playerToolPivot = new THREE.Group();
    this.buildPlayerMesh();
    this.scene.add(this.playerGroup);

    // Hover & placement cursors in 3D space
    const ringGeo = new THREE.RingGeometry(0.38, 0.48, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.hoverCursorMat = new THREE.MeshBasicMaterial({
      color: 0xffe57f,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    });
    this.hoverCursorMesh = new THREE.Mesh(ringGeo, this.hoverCursorMat);
    this.hoverCursorMesh.position.y = 0.08;
    this.scene.add(this.hoverCursorMesh);

    const rangeGeo = new THREE.PlaneGeometry(3, 3);
    rangeGeo.rotateX(-Math.PI / 2);
    this.placementRangeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide
    });
    this.placementRangeMesh = new THREE.Mesh(rangeGeo, this.placementRangeMat);
    this.placementRangeMesh.position.y = 0.06;
    this.placementRangeMesh.visible = false;
    this.scene.add(this.placementRangeMesh);

    this.buildWaypointBeacon3D();
    this.buildStaticWorld();
    this.buildWeatherDrops();
    this.resize();
    if (this.webgl) {
      this.webgl.shadowMap.needsUpdate = true;
    }
  }

  private createProceduralTerrainTextures(): void {
    const makeTex = (drawFn: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture => {
      const s = 64;
      const c = document.createElement('canvas');
      c.width = s;
      c.height = s;
      const ctx = c.getContext('2d')!;
      drawFn(ctx, s);
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.needsUpdate = true;
      return tex;
    };

    // 1. Lush Meadow Grass Texture (neutral grayscale/tintable pattern)
    this.grassTex = makeTex((ctx, s) => {
      ctx.fillStyle = '#e8ece6';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 80; i++) {
        const x = (i * 19) % s;
        const y = (i * 31) % s;
        ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#d2ddd0';
        ctx.fillRect(x, y, 2, 5);
        ctx.fillRect((x + 3) % s, (y + 1) % s, 2, 4);
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    });

    // 2. Country Gravel & Cobble Path Texture
    this.pathTex = makeTex((ctx, s) => {
      ctx.fillStyle = '#ede4d5';
      ctx.fillRect(0, 0, s, s);
      const pebbles = [
        [10, 12, 6, 4],
        [28, 10, 7, 5],
        [48, 14, 6, 5],
        [16, 30, 8, 5],
        [38, 28, 7, 6],
        [54, 34, 5, 4],
        [12, 50, 7, 5],
        [30, 48, 8, 5],
        [50, 52, 6, 4]
      ];
      for (const [px, py, rx, ry] of pebbles) {
        ctx.fillStyle = '#d8cbb8';
        ctx.beginPath();
        ctx.ellipse(px, py, rx, ry, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f7efe2';
        ctx.beginPath();
        ctx.ellipse(px - 1, py - 1, rx * 0.6, ry * 0.6, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 3. Rich Loam Soil Texture
    this.soilTex = makeTex((ctx, s) => {
      ctx.fillStyle = '#e5ddd5';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 95; i++) {
        const x = (i * 23) % s;
        const y = (i * 37) % s;
        ctx.fillStyle = i % 2 === 0 ? '#cfc2b6' : '#f4ece4';
        ctx.fillRect(x, y, 3, 3);
      }
    });

    // 4. Fitted Courtyard Flagstone Texture
    this.stoneTex = makeTex((ctx, s) => {
      ctx.fillStyle = '#dcd9d6';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, 28, 28);
      ctx.strokeRect(32, 2, 30, 28);
      ctx.strokeRect(2, 32, 30, 30);
      ctx.strokeRect(34, 32, 28, 30);
    });

    // 5. Pond Water Ripple Texture
    this.waterTex = makeTex((ctx, s) => {
      ctx.fillStyle = '#dceefb';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      for (const y of [14, 34, 52]) {
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.quadraticCurveTo(22, y - 4, 36, y);
        ctx.quadraticCurveTo(48, y + 4, 56, y);
        ctx.stroke();
      }
    });
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
    this.glCanvas.width = this.viewportW;
    this.glCanvas.height = this.viewportH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.camera.aspect = Math.max(0.4, this.viewportW / Math.max(1, this.viewportH));
    this.camera.fov = this.viewportW < 640 ? 46 : 34;
    this.camera.updateProjectionMatrix();

    if (this.webgl) {
      this.webgl.setSize(this.viewportW, this.viewportH, true);
      this.webgl.setPixelRatio(dpr);
      this.webgl.shadowMap.needsUpdate = true;
    }
  }

  public screenToTile(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(this.groundPlane, hit);
    if (!intersected) return { x: -1, y: -1 };

    const tx = Math.floor(hit.x);
    const ty = Math.floor(hit.z);
    return { x: tx, y: ty };
  }

  public setHoverTile(coord: { x: number; y: number } | null): void {
    if (!coord || coord.x < 0 || coord.x >= MAP_WIDTH || coord.y < 0 || coord.y >= MAP_HEIGHT) {
      this.hoverTile = null;
    } else {
      this.hoverTile = coord;
    }
  }

  public getHoverTile(): { x: number; y: number } | null {
    return this.hoverTile;
  }

  public spawnActionParticles(
    tileX: number,
    tileY: number,
    kind: 'soil' | 'water' | 'harvest' | 'gold' | 'sparkle' | 'dig' | 'plant' | 'hill',
    reducedMotion: boolean
  ): void {
    const count = reducedMotion ? 5 : 14;
    const cx = tileX + 0.5;
    const cz = tileY + 0.5;
    const colorMap: Record<string, number[]> = {
      soil: [0x5c3a21, 0x7c502e, 0x3f2614],
      dig: [0x5c3a21, 0x7c502e, 0x3f2614],
      hill: [0x6b4426, 0x4b2e1b, 0x855a36],
      plant: [0x4ade80, 0x86efac, 0xe8bc4a],
      water: [0x38bdf8, 0x7dd3fc, 0xbae6fd],
      harvest: [0xfacc15, 0x4ade80, 0xe8bc4a],
      gold: [0xffd700, 0xfef08a, 0xf59e0b],
      sparkle: [0xa7f3d0, 0xfef08a, 0xffffff]
    };
    const palette = colorMap[kind] || colorMap.soil;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 2.1;
      const mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        roughness: 0.4,
        metalness: kind === 'gold' ? 0.6 : 0.1
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      const r = 0.05 + Math.random() * 0.05;
      mesh.scale.set(r, r, r);
      mesh.position.set(
        cx + (Math.random() - 0.5) * 0.3,
        0.25 + Math.random() * 0.2,
        cz + (Math.random() - 0.5) * 0.3
      );
      this.particlesGroup.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: 1.8 + Math.random() * 2.2,
        vz: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.42 + Math.random() * 0.28
      });
    }
  }

  public spawnFloatingText(tileX: number, tileY: number, text: string, color = '#ffe066'): void {
    this.floatingTexts.push({
      wx: tileX + 0.5,
      wz: tileY + 0.5,
      text,
      color,
      life: 0,
      maxLife: 1.15
    });
  }

  public triggerShake(amount: number, duration = 0.15, enabled = true): void {
    if (!enabled) return;
    this.shakeIntensity = Math.min(0.28, amount * 0.04);
    this.shakeTimer = duration;
  }

  public setPlacementMode(type: PlacedMachine['type'] | null): void {
    this.placementMode = type;
  }

  private buildStaticWorld(): void {
    // 1. Surrounding meadow skirt plane so the 3D horizon is lush and seamless at max zoom-out
    const skirtGeo = new THREE.PlaneGeometry(160, 140);
    skirtGeo.rotateX(-Math.PI / 2);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x3b6e38,
      roughness: 0.92
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.set(MAP_WIDTH / 2, -0.16, MAP_HEIGHT / 2);
    skirtMesh.receiveShadow = true;
    this.scene.add(skirtMesh);

    // 2. Build 38x28 3D terrain tile nodes with procedural textures
    const tileBoxGeo = new THREE.BoxGeometry(0.99, 0.28, 0.99);
    const furrowCylGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.86, 8);
    furrowCylGeo.rotateZ(Math.PI / 2);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const group = new THREE.Group();
        group.position.set(x + 0.5, 0, y + 0.5);

        const baseMat = new THREE.MeshStandardMaterial({
          color: (x + y) % 2 === 0 ? 0x568d46 : 0x4f8440,
          map: this.grassTex,
          roughness: 0.86
        });
        const baseMesh = new THREE.Mesh(tileBoxGeo, baseMat);
        baseMesh.position.y = -0.14;
        baseMesh.receiveShadow = true;
        group.add(baseMesh);

        // Rounded 3D soil furrows for tilled soil
        const furrowGroup = new THREE.Group();
        const furrowMat = new THREE.MeshStandardMaterial({
          color: 0x4b2e1b,
          map: this.soilTex,
          roughness: 0.9
        });
        for (let f = -1; f <= 1; f++) {
          const fm = new THREE.Mesh(furrowCylGeo, furrowMat);
          fm.scale.set(1, 0.65, 1);
          fm.position.set(0, 0.015, f * 0.28);
          fm.castShadow = true;
          fm.receiveShadow = true;
          furrowGroup.add(fm);
        }
        furrowGroup.visible = false;
        group.add(furrowGroup);

        const contentGroup = new THREE.Group();
        group.add(contentGroup);

        this.scene.add(group);
        this.tileNodes.push({
          group,
          baseMesh,
          baseMat,
          furrowGroup,
          furrowMat,
          contentGroup,
          lastSignature: ''
        });
      }
    }

    // 3. Build 3D Plot Timber Enclosures, Deed Signposts & Coldframe Arches
    this.buildPlotBorders();

    // 4. Build 3D Buildings, Pond, Well, Stations, Shop, Market, Lanterns & Trees
    this.buildFarmhouse3D();
    this.buildCellar3D();
    this.buildCourtyardStations3D();
    this.buildFestivalPlinth3D();
    this.buildShopAndMarket3D();
    this.buildPondAndWell3D();
    this.buildOldMossyCamp3D();
    this.buildEstateLanternsAndProps3D();
    this.buildPerimeterTrees3D();
    this.buildNpcs3D();
  }

  private buildPlotBorders(): void {
    const timberMat = new THREE.MeshStandardMaterial({ color: 0x5c3818, roughness: 0.84 });
    const postCapMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.5,
      roughness: 0.35
    });

    for (const [plotId, b] of Object.entries(PLOT_BOUNDS) as [
      PlotId,
      typeof PLOT_BOUNDS.plot_homestead
    ][]) {
      const g = new THREE.Group();
      const w = b.x2 - b.x1 + 1;
      const h = b.y2 - b.y1 + 1;
      const cx = b.x1 + w / 2;
      const cz = b.y1 + h / 2;

      // Double-rail timber border beams around each spread-out plot
      for (const railY of [0.09, 0.22]) {
        const northBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, 0.08), timberMat);
        northBeam.position.set(cx, railY, b.y1 - 0.04);
        northBeam.castShadow = true;
        g.add(northBeam);

        const southBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.06, 0.08), timberMat);
        southBeam.position.set(cx, railY, b.y2 + 1.04);
        southBeam.castShadow = true;
        g.add(southBeam);

        const westBeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, h + 0.2), timberMat);
        westBeam.position.set(b.x1 - 0.04, railY, cz);
        westBeam.castShadow = true;
        g.add(westBeam);

        const eastBeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, h + 0.2), timberMat);
        eastBeam.position.set(b.x2 + 1.04, railY, cz);
        eastBeam.castShadow = true;
        g.add(eastBeam);
      }

      // Corner & mid-span fence posts with brass caps
      const postCoords: [number, number][] = [
        [b.x1 - 0.04, b.y1 - 0.04],
        [cx, b.y1 - 0.04],
        [b.x2 + 1.04, b.y1 - 0.04],
        [b.x1 - 0.04, b.y2 + 1.04],
        [cx, b.y2 + 1.04],
        [b.x2 + 1.04, b.y2 + 1.04],
        [b.x1 - 0.04, cz],
        [b.x2 + 1.04, cz]
      ];
      for (const [px, pz] of postCoords) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), timberMat);
        post.position.set(px, 0.18, pz);
        post.castShadow = true;
        g.add(post);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.05, 0.19), postCapMat);
        cap.position.set(px, 0.37, pz);
        g.add(cap);
      }

      this.scene.add(g);
      this.plotFenceGroups.set(plotId, g);

      // Build 3D Deed Signpost for unlockable plots
      if (plotId !== 'plot_homestead') {
        const info = PLOT_INFO[plotId];
        const signG = new THREE.Group();
        signG.position.set(info.signX + 0.5, 0, info.signY + 0.5);

        const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.72, 8), timberMat);
        stake.position.y = 0.36;
        stake.castShadow = true;
        signG.add(stake);

        const plaque = new THREE.Mesh(
          new THREE.BoxGeometry(0.56, 0.32, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xd6b588, roughness: 0.75 })
        );
        plaque.position.set(0, 0.62, 0.03);
        plaque.castShadow = true;
        signG.add(plaque);

        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.06), timberMat);
        trim.position.set(0, 0.62, 0.01);
        signG.add(trim);

        this.scene.add(signG);
        this.plotSignGroups.set(plotId, signG);
      }
    }

    // Glass Coldframe 3D arches over plot_greenhouse (x: 22..29, y: 18..22)
    const gh = PLOT_BOUNDS.plot_greenhouse;
    const archGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.65,
      roughness: 0.28
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.24,
      roughness: 0.1
    });
    for (let x = gh.x1; x <= gh.x2 + 1; x += 2) {
      const postN = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), frameMat);
      postN.position.set(x, 0.475, gh.y1);
      archGroup.add(postN);
    }
    const backGlass = new THREE.Mesh(
      new THREE.BoxGeometry(gh.x2 - gh.x1 + 1, 0.9, 0.05),
      glassMat
    );
    backGlass.position.set((gh.x1 + gh.x2 + 1) / 2, 0.475, gh.y1);
    archGroup.add(backGlass);
    archGroup.visible = false;
    this.scene.add(archGroup);
    this.coldframeArchGroup = archGroup;
  }

  private buildFarmhouse3D(): void {
    const g = new THREE.Group();
    const cx = 4.5;
    const cz = 3.0;

    const foundMat = new THREE.MeshStandardMaterial({
      color: 0x6b655e,
      map: this.stoneTex,
      roughness: 0.9
    });
    const found = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.36, 3.6), foundMat);
    found.position.set(cx, 0.18, cz);
    found.castShadow = true;
    found.receiveShadow = true;
    g.add(found);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5e8c7, roughness: 0.76 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.85, 3.3), wallMat);
    walls.position.set(cx, 1.25, cz);
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.85 });
    for (const bx of [2.25, 3.6, 5.4, 6.75]) {
      const vBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 3.36), beamMat);
      vBeam.position.set(bx, 1.25, cz);
      g.add(vBeam);
    }
    const hBeam = new THREE.Mesh(new THREE.BoxGeometry(4.66, 0.14, 3.36), beamMat);
    hBeam.position.set(cx, 2.12, cz);
    g.add(hBeam);

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9e3b24, roughness: 0.72 });
    const roofSlopeGeo = new THREE.BoxGeometry(5.15, 0.16, 2.25);

    const roofFront = new THREE.Mesh(roofSlopeGeo, roofMat);
    roofFront.position.set(cx, 2.58, cz + 0.86);
    roofFront.rotation.x = Math.PI / 5.5;
    roofFront.castShadow = true;
    g.add(roofFront);

    const roofBack = new THREE.Mesh(roofSlopeGeo, roofMat);
    roofBack.position.set(cx, 2.58, cz - 0.86);
    roofBack.rotation.x = -Math.PI / 5.5;
    roofBack.castShadow = true;
    g.add(roofBack);

    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 0.24), beamMat);
    ridgeCap.position.set(cx, 3.12, cz);
    g.add(ridgeCap);

    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 });
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.65, 0.58), chimneyMat);
    chimney.position.set(6.1, 2.95, cz - 0.6);
    chimney.castShadow = true;
    g.add(chimney);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.78, 1.38, 0.12), doorMat);
    door.position.set(cx, 0.96, cz + 1.66);
    g.add(door);

    const porchStep = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.6), foundMat);
    porchStep.position.set(cx, 0.09, cz + 1.92);
    g.add(porchStep);

    const winMat = new THREE.MeshStandardMaterial({
      color: 0x89cff0,
      emissive: 0xffb74d,
      emissiveIntensity: 0.35,
      roughness: 0.2
    });
    this.windowMaterials.push(winMat);

    for (const wx of [3.05, 5.95]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.1), winMat);
      win.position.set(wx, 1.32, cz + 1.65);
      g.add(win);

      const box = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.2, 0.26), beamMat);
      box.position.set(wx, 0.88, cz + 1.75);
      g.add(box);

      for (let f = -1; f <= 1; f++) {
        const flower = new THREE.Mesh(
          this.sphereGeo,
          new THREE.MeshStandardMaterial({ color: f === 0 ? 0xfacc15 : 0xf43f5e })
        );
        flower.scale.set(0.09, 0.09, 0.09);
        flower.position.set(wx + f * 0.24, 1.03, cz + 1.77);
        g.add(flower);
      }
    }

    this.scene.add(g);
  }

  private buildCellar3D(): void {
    const g = new THREE.Group();
    const cx = 7.5;
    const cz = 3.8;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x57534e,
      map: this.stoneTex,
      roughness: 0.9
    });
    const mound = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.92, 1.88), stoneMat);
    mound.position.set(cx, 0.46, cz);
    mound.castShadow = true;
    g.add(mound);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
    const doors = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 1.48), doorMat);
    doors.position.set(cx, 0.94, cz + 0.1);
    doors.rotation.x = 0.22;
    g.add(doors);

    this.scene.add(g);
  }

  private buildCourtyardStations3D(): void {
    // 1. Courtyard stone pavement (x: 9..16, y: 2..4)
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x78716c,
      map: this.stoneTex,
      roughness: 0.88
    });
    const courtyardSlab = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.06, 3.0), slabMat);
    courtyardSlab.position.set(13.0, 0.02, 3.5);
    courtyardSlab.receiveShadow = true;
    this.scene.add(courtyardSlab);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c4a1e, roughness: 0.82 });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.65,
      roughness: 0.35
    });

    // 2. Compost Tumbler at (10.5, 0, 3.5)
    const compGroup = new THREE.Group();
    compGroup.position.set(10.5, 0, 3.5);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.5), woodMat);
    legL.position.set(-0.38, 0.45, 0);
    const legR = legL.clone();
    legR.position.set(0.38, 0.45, 0);
    compGroup.add(legL, legR);

    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(0, 0.72, 0);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.68, 12), woodMat);
    barrel.rotation.z = Math.PI / 2;
    barrel.castShadow = true;
    barrelGroup.add(barrel);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.1, 12), ironMat);
    band.rotation.z = Math.PI / 2;
    barrelGroup.add(band);
    compGroup.add(barrelGroup);
    this.composterBarrel = barrelGroup;
    this.scene.add(compGroup);

    // 3. Seed Tuber Cutter at (12.5, 0, 3.5)
    const cutterGroup = new THREE.Group();
    cutterGroup.position.set(12.5, 0, 3.5);
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.65, 0.68), woodMat);
    table.position.set(0, 0.325, 0);
    table.castShadow = true;
    cutterGroup.add(table);

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xd6b588, roughness: 0.7 })
    );
    board.position.set(0, 0.68, 0);
    cutterGroup.add(board);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.04), ironMat);
    blade.position.set(0, 0.82, 0);
    cutterGroup.add(blade);
    this.seedCutterBlade = blade;
    this.scene.add(cutterGroup);

    // 4. Artisan Spud Kitchen at (14.5, 0, 3.5)
    const kitGroup = new THREE.Group();
    kitGroup.position.set(14.5, 0, 3.5);
    const hearth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.54, 0.42, 14),
      new THREE.MeshStandardMaterial({ color: 0x57534e, map: this.stoneTex, roughness: 0.9 })
    );
    hearth.position.set(0, 0.21, 0);
    hearth.castShadow = true;
    kitGroup.add(hearth);

    const cauldron = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), ironMat);
    cauldron.scale.set(1, 0.82, 1);
    cauldron.position.set(0, 0.52, 0);
    cauldron.castShadow = true;
    kitGroup.add(cauldron);

    const stewMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.45,
      roughness: 0.3
    });
    const stew = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12), stewMat);
    stew.position.set(0, 0.76, 0);
    kitGroup.add(stew);
    this.kitchenStewMesh = stew;
    this.scene.add(kitGroup);
  }

  private buildFestivalPlinth3D(): void {
    const g = new THREE.Group();
    g.position.set(19.5, 0, 3.8);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xa8a29e,
      map: this.stoneTex,
      roughness: 0.65
    });
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.24, 1.1), stoneMat);
    base1.position.y = 0.12;
    base1.castShadow = true;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.52, 0.76), stoneMat);
    base2.position.y = 0.5;
    base2.castShadow = true;
    g.add(base1, base2);

    const trophyGroup = new THREE.Group();
    trophyGroup.position.y = 1.08;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xb45309,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.18
    });
    const spud = new THREE.Mesh(this.sphereGeo, goldMat);
    spud.scale.set(0.34, 0.44, 0.3);
    spud.castShadow = true;
    trophyGroup.add(spud);
    trophyGroup.visible = false;
    g.add(trophyGroup);
    this.trophyGroup = trophyGroup;

    this.scene.add(g);
  }

  private buildShopAndMarket3D(): void {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.82 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.85 });

    // 1. Barnaby's Tuber & Tool Emporium (x: 24..28, y: 1..4) -> center (26.5, 0, 3.0)
    const shopCounter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.96, 2.8), woodMat);
    shopCounter.position.set(26.5, 0.48, 3.0);
    shopCounter.castShadow = true;
    shopCounter.receiveShadow = true;
    g.add(shopCounter);

    const shopBack = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.0, 0.35), darkWoodMat);
    shopBack.position.set(26.5, 1.0, 1.75);
    shopBack.castShadow = true;
    g.add(shopBack);

    for (const px of [24.4, 26.5, 28.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.15, 8), darkWoodMat);
      post.position.set(px, 1.07, 4.2);
      post.castShadow = true;
      g.add(post);
    }

    const shopStripeColors = [0x2e6f32, 0xfdf6e2];
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, 0.14, 3.15),
        new THREE.MeshStandardMaterial({
          color: shopStripeColors[i % 2],
          roughness: 0.68
        })
      );
      stripe.position.set(24.62 + i * 0.94, 2.15, 3.05);
      stripe.rotation.x = 0.18;
      stripe.castShadow = true;
      g.add(stripe);
    }

    // 2. Spudstead Market Stall & Bistro (x: 30..34, y: 1..4) -> center (32.5, 0, 3.0)
    const mktCounter = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.96, 2.8), woodMat);
    mktCounter.position.set(32.5, 0.48, 3.0);
    mktCounter.castShadow = true;
    mktCounter.receiveShadow = true;
    g.add(mktCounter);

    const mktBack = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.0, 0.35), darkWoodMat);
    mktBack.position.set(32.5, 1.0, 1.75);
    mktBack.castShadow = true;
    g.add(mktBack);

    for (const px of [30.4, 32.5, 34.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.15, 8), darkWoodMat);
      post.position.set(px, 1.07, 4.2);
      post.castShadow = true;
      g.add(post);
    }

    const mktStripeColors = [0xc2410c, 0xfdf6e2];
    for (let i = 0; i < 5; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, 0.14, 3.15),
        new THREE.MeshStandardMaterial({
          color: mktStripeColors[i % 2],
          roughness: 0.68
        })
      );
      stripe.position.set(30.62 + i * 0.94, 2.15, 3.05);
      stripe.rotation.x = 0.18;
      stripe.castShadow = true;
      g.add(stripe);
    }

    // Overflowing Potato Crates on both counters
    const crateConfigs = [
      { cx: 25.3, col: 0xe8bc4a },
      { cx: 27.6, col: 0x9c7248 },
      { cx: 31.3, col: 0xc84b4b },
      { cx: 33.6, col: 0x7b4b94 }
    ];
    for (const cfg of crateConfigs) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.26, 0.68), darkWoodMat);
      crate.position.set(cfg.cx, 1.08, 3.8);
      g.add(crate);

      const spudMat = new THREE.MeshStandardMaterial({ color: cfg.col, roughness: 0.58 });
      for (let s = 0; s < 6; s++) {
        const spud = new THREE.Mesh(this.sphereGeo, spudMat);
        spud.scale.set(0.12, 0.09, 0.1);
        spud.position.set(
          cfg.cx + ((s % 3) - 1) * 0.18,
          1.24 + Math.floor(s / 3) * 0.06,
          3.8 + (s % 2 === 0 ? -0.09 : 0.09)
        );
        g.add(spud);
      }
    }

    this.scene.add(g);
  }

  private buildPondAndWell3D(): void {
    // 1. Upgraded Stone Well at (5.5, 0, 9.5)
    const wellGroup = new THREE.Group();
    wellGroup.position.set(5.5, 0, 9.5);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x78716c,
      map: this.stoneTex,
      roughness: 0.88
    });
    const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.54, 16), stoneMat);
    wellRing.position.y = 0.27;
    wellRing.castShadow = true;
    wellGroup.add(wellRing);

    const waterDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.3 })
    );
    waterDisk.position.y = 0.49;
    wellGroup.add(waterDisk);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3818, roughness: 0.85 });
    for (const sx of [-0.39, 0.39]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.98, 0.09), woodMat);
      post.position.set(sx, 0.74, 0);
      post.castShadow = true;
      wellGroup.add(post);
    }
    const crossBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.84, 8), woodMat);
    crossBeam.rotation.z = Math.PI / 2;
    crossBeam.position.y = 1.05;
    wellGroup.add(crossBeam);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x8b3a2b, roughness: 0.75 })
    );
    roof.position.y = 1.42;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    wellGroup.add(roof);

    this.scene.add(wellGroup);

    // 2. Wooden Pier, Shoreline Boulders, Cattails & Lily Pads on the Spring Pond (x: 1..4, y: 9..14)
    const pier = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.68), woodMat);
    pier.position.set(4.65, 0.06, 11.5);
    pier.castShadow = true;
    this.scene.add(pier);

    const padMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.7 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.45 });
    const padCoords = [
      [2.2, 10.1],
      [3.7, 10.9],
      [2.4, 12.1],
      [3.8, 12.9],
      [1.8, 13.6],
      [3.1, 14.2]
    ];
    for (const [lx, lz] of padCoords) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14), padMat);
      pad.position.set(lx, -0.06, lz);
      const bud = new THREE.Mesh(this.sphereGeo, flowerMat);
      bud.scale.set(0.08, 0.07, 0.08);
      bud.position.set(0, 0.05, 0);
      pad.add(bud);
      this.scene.add(pad);
    }

    // Cattails & shoreline boulders along the pond edge
    const reedStemMat = this.getSharedMat(0x3f8f38, 0.8);
    const reedHeadMat = this.getSharedMat(0x5c3818, 0.85);
    for (const [rx, rz] of [
      [1.2, 9.2],
      [1.2, 11.5],
      [1.3, 14.3],
      [4.7, 13.8]
    ]) {
      const reedG = new THREE.Group();
      reedG.position.set(rx, 0, rz);
      for (const ox of [-0.08, 0.08]) {
        const stem = new THREE.Mesh(this.cylGeo, reedStemMat);
        stem.scale.set(0.025, 0.55, 0.025);
        stem.position.set(ox, 0.25, 0);
        const head = new THREE.Mesh(this.cylGeo, reedHeadMat);
        head.scale.set(0.045, 0.16, 0.045);
        head.position.set(ox, 0.46, 0);
        reedG.add(stem, head);
      }
      this.scene.add(reedG);
    }
  }

  private buildOldMossyCamp3D(): void {
    const g = new THREE.Group();
    g.position.set(3.5, 0, 19.4);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.84 });
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.6,
      roughness: 0.4
    });

    // Aid Barrel & Sprout Basket
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 0.62, 12), woodMat);
    barrel.position.set(0, 0.31, 0);
    barrel.castShadow = true;
    g.add(barrel);

    const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 12), ironMat);
    hoop.position.set(0, 0.42, 0);
    g.add(hoop);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.32, 0.55), woodMat);
    crate.position.set(-0.65, 0.16, 0.1);
    crate.castShadow = true;
    g.add(crate);

    this.scene.add(g);
  }

  private buildEstateLanternsAndProps3D(): void {
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.7,
      roughness: 0.35
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.45,
      roughness: 0.2
    });
    this.lanternGlassMats.push(glassMat);

    // Scenic lamp posts along the Grand Avenue, Central Promenade & Cross-Meadow Boulevard
    const lampCoords = [
      [8, 4.8],
      [17.5, 4.8],
      [23.5, 4.8],
      [17.5, 11.5],
      [17.5, 17.5],
      [7.5, 13.5],
      [30.5, 13.5]
    ];

    for (const [lx, lz] of lampCoords) {
      const lamp = new THREE.Group();
      lamp.position.set(lx, 0, lz);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.35, 8), ironMat);
      pole.position.y = 0.675;
      pole.castShadow = true;
      lamp.add(pole);

      const globe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.2), glassMat);
      globe.position.y = 1.42;
      lamp.add(globe);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 4), ironMat);
      cap.position.y = 1.58;
      cap.rotation.y = Math.PI / 4;
      lamp.add(cap);

      this.scene.add(lamp);
    }
  }

  private buildPerimeterTrees3D(): void {
    const treePositions = [
      // North border trees
      [1, 1],
      [8, 1],
      [17, 1],
      [22, 1],
      [36, 1],
      // West border & grove trees
      [1, 5],
      [1, 8],
      [1, 16],
      [1, 19],
      [1, 24],
      [1, 26],
      // Central Promenade & Cross-Meadow Boulevard accent trees (between spread-out plots!)
      [17, 13],
      [20, 13],
      [12, 16],
      [26, 16],
      // East Orchard & Southern Meadow perimeter trees
      [34, 8],
      [35, 12],
      [34, 17],
      [35, 22],
      [33, 25],
      [10, 25],
      [18, 25],
      [25, 25]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2e6f32, roughness: 0.8 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3f8f44, roughness: 0.78 });
    const leafMat3 = new THREE.MeshStandardMaterial({ color: 0x4ea353, roughness: 0.76 });

    for (const [tx, ty] of treePositions) {
      const g = new THREE.Group();
      g.position.set(tx + 0.5, 0, ty + 0.5);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.82, 8), trunkMat);
      trunk.position.y = 0.41;
      trunk.castShadow = true;
      g.add(trunk);

      const crown1 = new THREE.Mesh(this.dodecaGeo, leafMat1);
      crown1.scale.set(0.6, 0.54, 0.6);
      crown1.position.set(0, 1.0, 0);
      crown1.castShadow = true;
      g.add(crown1);

      const crown2 = new THREE.Mesh(this.dodecaGeo, leafMat2);
      crown2.scale.set(0.46, 0.44, 0.46);
      crown2.position.set(0.16, 1.38, -0.09);
      crown2.castShadow = true;
      g.add(crown2);

      const crown3 = new THREE.Mesh(this.dodecaGeo, leafMat3);
      crown3.scale.set(0.36, 0.36, 0.36);
      crown3.position.set(-0.15, 1.32, 0.12);
      crown3.castShadow = true;
      g.add(crown3);

      this.scene.add(g);
    }
  }

  private buildPlayerMesh(): void {
    const denimMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf6c99e, roughness: 0.6 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe6b85c, roughness: 0.75 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });

    // Boots
    for (const bx of [-0.1, 0.1]) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.14, 0.16), bootMat);
      boot.position.set(bx, 0.07, 0.02);
      this.playerGroup.add(boot);
    }

    // Overalls torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.5, 12), denimMat);
    torso.position.y = 0.36;
    torso.castShadow = true;
    this.playerGroup.add(torso);

    // Flannel shoulders & arms
    for (const ax of [-0.24, 0.24]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.34, 8), shirtMat);
      arm.position.set(ax, 0.42, 0.04);
      arm.rotation.z = ax < 0 ? 0.18 : -0.18;
      this.playerGroup.add(arm);
    }

    // Red bandana kerchief
    const kerchief = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.23, 0.07, 12), bandMat);
    kerchief.position.y = 0.6;
    this.playerGroup.add(kerchief);

    const head = new THREE.Mesh(this.sphereGeo, skinMat);
    head.scale.set(0.21, 0.21, 0.21);
    head.position.y = 0.76;
    head.castShadow = true;
    this.playerGroup.add(head);

    // Straw sunhat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.04, 16), hatMat);
    brim.position.y = 0.9;
    brim.castShadow = true;
    this.playerGroup.add(brim);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12), bandMat);
    band.position.y = 0.94;
    this.playerGroup.add(band);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 12), hatMat);
    crown.position.y = 1.0;
    this.playerGroup.add(crown);

    // Tool pivot on right side
    this.playerToolPivot.position.set(0.28, 0.48, 0.15);
    this.playerGroup.add(this.playerToolPivot);

    const handleMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.75,
      roughness: 0.25
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      metalness: 0.65,
      roughness: 0.3
    });
    const waterCanMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.4,
      roughness: 0.35
    });

    // Spade
    const spadeG = new THREE.Group();
    const sShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), handleMat);
    sShaft.rotation.x = Math.PI / 2;
    sShaft.position.z = 0.22;
    const sBlade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.2), steelMat);
    sBlade.position.z = 0.5;
    spadeG.add(sShaft, sBlade);
    this.playerToolPivot.add(spadeG);
    this.playerToolMeshes.spade = spadeG;

    // Hoe
    const hoeG = new THREE.Group();
    const hShaft = sShaft.clone();
    const hBlade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.04), steelMat);
    hBlade.position.set(0, -0.06, 0.48);
    hoeG.add(hShaft, hBlade);
    this.playerToolPivot.add(hoeG);
    this.playerToolMeshes.hoe = hoeG;

    // Watering Can
    const canG = new THREE.Group();
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.24, 10), waterCanMat);
    canBody.position.set(0, 0, 0.28);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 8), waterCanMat);
    spout.rotation.x = Math.PI / 3;
    spout.position.set(0, 0.06, 0.44);
    canG.add(canBody, spout);
    this.playerToolPivot.add(canG);
    this.playerToolMeshes.watering_can = canG;

    // Harvest Fork
    const forkG = new THREE.Group();
    const fShaft = sShaft.clone();
    const fHead = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.04), goldMat);
    fHead.position.z = 0.45;
    forkG.add(fShaft, fHead);
    for (const tx of [-0.07, 0, 0.07]) {
      const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.18, 6), goldMat);
      tine.rotation.x = Math.PI / 2;
      tine.position.set(tx, 0, 0.54);
      forkG.add(tine);
    }
    this.playerToolPivot.add(forkG);
    this.playerToolMeshes.fork = forkG;

    // Seed Pouch
    const pouchG = new THREE.Group();
    const bag = new THREE.Mesh(
      this.sphereGeo,
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.8 })
    );
    bag.scale.set(0.14, 0.16, 0.14);
    bag.position.set(0, 0, 0.26);
    pouchG.add(bag);
    this.playerToolPivot.add(pouchG);
    this.playerToolMeshes.pouch = pouchG;
  }

  private buildNpcs3D(): void {
    const npcConfigs: {
      id: string;
      x: number;
      y: number;
      coat: number;
      hat: number;
      isChef?: boolean;
    }[] = [
      { id: 'barnaby', x: NPCS.barnaby.x, y: NPCS.barnaby.y, coat: 0x8a5a2b, hat: 0xd9b36c },
      {
        id: 'mireille',
        x: NPCS.mireille.x,
        y: NPCS.mireille.y,
        coat: 0xf8fafc,
        hat: 0xffffff,
        isChef: true
      },
      { id: 'mossy', x: NPCS.mossy.x, y: NPCS.mossy.y, coat: 0x3b6e3b, hat: 0x2a522a }
    ];

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2c59d, roughness: 0.65 });
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.5,
      roughness: 0.2
    });

    for (const cfg of npcConfigs) {
      const g = new THREE.Group();
      g.position.set(cfg.x + 0.5, 0, cfg.y + 0.5);

      const coatMat = new THREE.MeshStandardMaterial({ color: cfg.coat, roughness: 0.75 });
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.56, 12), coatMat);
      torso.position.y = 0.35;
      torso.castShadow = true;
      g.add(torso);

      for (const ax of [-0.24, 0.24]) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.32, 8), coatMat);
        arm.position.set(ax, 0.4, 0.03);
        g.add(arm);
      }

      const head = new THREE.Mesh(this.sphereGeo, skinMat);
      head.scale.set(0.2, 0.2, 0.2);
      head.position.y = 0.75;
      head.castShadow = true;
      g.add(head);

      const hatMat = new THREE.MeshStandardMaterial({ color: cfg.hat, roughness: 0.7 });
      if (cfg.isChef) {
        const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.17, 0.3, 12), hatMat);
        toque.position.y = 0.99;
        g.add(toque);
      } else {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 12), hatMat);
        brim.position.y = 0.89;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.15, 12), hatMat);
        crown.position.y = 0.98;
        g.add(brim, crown);
      }

      // Floating quest marker diamond
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), markerMat);
      marker.position.y = 1.36;
      marker.visible = false;
      g.add(marker);

      this.scene.add(g);
      this.npcGroups.set(cfg.id, { group: g, marker });
    }
  }

  private buildWeatherDrops(): void {
    const dropGeo = new THREE.BoxGeometry(0.03, 0.38, 0.03);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.65
    });
    for (let i = 0; i < 65; i++) {
      const drop = new THREE.Mesh(dropGeo, dropMat);
      drop.position.set(
        2 + Math.random() * (MAP_WIDTH - 4),
        Math.random() * 9,
        2 + Math.random() * (MAP_HEIGHT - 4)
      );
      drop.rotation.z = 0.15;
      this.weatherDropGroup.add(drop);
      this.weatherDrops.push(drop);
    }
    this.weatherDropGroup.visible = false;
  }

  private buildWaypointBeacon3D(): void {
    this.waypointGroup = new THREE.Group();
    this.waypointGroup.visible = false;

    const ringGeo = new THREE.RingGeometry(0.32, 0.49, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92
    });
    this.waypointRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.waypointRingMesh.position.y = 0.1;
    this.waypointGroup.add(this.waypointRingMesh);

    const beamGeo = new THREE.CylinderGeometry(0.16, 0.3, 1.65, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.waypointBeamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.waypointBeamMesh.position.y = 0.9;
    this.waypointGroup.add(this.waypointBeamMesh);

    this.waypointPointerMesh = new THREE.Group();
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xd97706,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.35
    });
    const tipCone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), coneMat);
    tipCone.rotation.x = Math.PI;
    this.waypointPointerMesh.add(tipCone);

    const topCap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 4), coneMat);
    topCap.position.y = 0.34;
    this.waypointPointerMesh.add(topCap);

    this.waypointPointerMesh.position.y = 1.25;
    this.waypointGroup.add(this.waypointPointerMesh);

    const dotGeo = new THREE.CylinderGeometry(0.1, 0.13, 0.05, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.85
    });
    for (let i = 0; i < 10; i++) {
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.y = 0.09;
      this.waypointTrailDots.push(dot);
      this.scene.add(dot);
      dot.visible = false;
    }

    this.scene.add(this.waypointGroup);
  }

  public setWaypointTarget(target: WorldWaypointTarget | null): void {
    this.waypointTarget = target;
  }

  public getWaypointTarget(): WorldWaypointTarget | null {
    return this.waypointTarget;
  }

  public adjustZoom(deltaScale: number): void {
    this.targetZoomScale = THREE.MathUtils.clamp(
      this.targetZoomScale + deltaScale,
      WorldRenderer.MIN_ZOOM_SCALE,
      WorldRenderer.MAX_ZOOM_SCALE
    );
  }

  public setZoomScale(scale: number, immediate = false): void {
    this.targetZoomScale = THREE.MathUtils.clamp(
      scale,
      WorldRenderer.MIN_ZOOM_SCALE,
      WorldRenderer.MAX_ZOOM_SCALE
    );
    if (immediate) {
      this.currentZoomScale = this.targetZoomScale;
    }
  }

  public resetZoom(): void {
    this.targetZoomScale = WorldRenderer.DEFAULT_ZOOM_SCALE;
  }

  public getZoomScale(): number {
    return this.targetZoomScale;
  }

  public getZoomPercent(): number {
    return Math.round((WorldRenderer.DEFAULT_ZOOM_SCALE / this.targetZoomScale) * 100);
  }

  public render(
    state: GameState,
    dt: number,
    hoverTile: { x: number; y: number } | null = this.hoverTile,
    placementPreview: {
      x: number;
      y: number;
      valid: boolean;
      type: PlacedMachine['type'];
    } | null = null
  ): void {
    this.animTime += dt;

    if (!placementPreview && this.placementMode && hoverTile) {
      const check = canPlaceMachineAt(state, this.placementMode, hoverTile.x, hoverTile.y);
      placementPreview = {
        x: hoverTile.x,
        y: hoverTile.y,
        valid: check.valid,
        type: this.placementMode
      };
    }

    // 1. Smoothly interpolate scrollwheel zoom and update 3D camera tracking player
    this.currentZoomScale = THREE.MathUtils.lerp(
      this.currentZoomScale,
      this.targetZoomScale,
      Math.min(1, dt * 12)
    );

    const zoomNorm =
      (this.currentZoomScale - WorldRenderer.MIN_ZOOM_SCALE) /
      (WorldRenderer.MAX_ZOOM_SCALE - WorldRenderer.MIN_ZOOM_SCALE);
    const marginX = THREE.MathUtils.lerp(6.5, 11.8, zoomNorm);
    const marginZ = THREE.MathUtils.lerp(4.8, 8.2, zoomNorm);

    const targetX = THREE.MathUtils.clamp(state.player.x + 0.5, marginX, MAP_WIDTH - marginX);
    const targetZ = THREE.MathUtils.clamp(state.player.y + 0.5, marginZ, MAP_HEIGHT - marginZ);
    this.camTarget.lerp(new THREE.Vector3(targetX, 0, targetZ), Math.min(1, dt * 8));

    let shakeX = 0;
    let shakeZ = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeZ = (Math.random() - 0.5) * this.shakeIntensity;
    }

    const camHeight = 14.2 * this.currentZoomScale;
    const camZOffset = 11.4 * this.currentZoomScale;
    this.camera.position.set(
      this.camTarget.x + shakeX,
      camHeight,
      this.camTarget.z + camZOffset + shakeZ
    );
    this.camera.lookAt(this.camTarget.x + shakeX, 0.2, this.camTarget.z - 0.7 + shakeZ);

    this.sunLight.target.position.copy(this.camTarget);

    // 2. Update 3D Day/Night & Weather Lighting
    this.updateLightingAndWeather3D(state, dt);

    // 3. Update 3D Tile visuals (only rebuilding tiles whose state changed)
    this.syncTiles3D(state);

    // 4. Update placed machines (sprinklers, extra stations)
    this.syncPlacedMachines3D(state, dt);

    // 5. Update 3D Player & NPCs
    this.updatePlayerAndNpcs3D(state, dt);

    // 6. Update Hover & Placement cursors + 3D Waypoint Beacon & Trail
    this.updateCursors3D(state, hoverTile, placementPreview);
    this.updateWaypointBeacon3D(state);

    // 7. Update 3D Particles
    this.updateParticles3D(dt);

    // 8. Render 3D WebGL scene directly to main canvas and draw crisp 2D projected labels on overlay
    this.shadowUpdateTimer += dt;
    if (this.shadowUpdateTimer >= 0.6 && this.webgl) {
      this.shadowUpdateTimer = 0;
      this.webgl.shadowMap.needsUpdate = true;
    }

    if (this.webgl) {
      this.webgl.render(this.scene, this.camera);
    }

    this.ctx.clearRect(0, 0, this.viewportW, this.viewportH);
    this.drawProjectedWorldLabels(state, dt);
  }

  private updateLightingAndWeather3D(state: GameState, dt: number): void {
    const hour = state.calendar.hour;
    const weather = state.calendar.weather;

    const dayProgress = THREE.MathUtils.clamp((hour - 6) / 16, 0, 1);
    const sunAngle = (dayProgress - 0.5) * Math.PI * 0.85;
    this.sunLight.position.set(
      this.camTarget.x - Math.sin(sunAngle) * 18,
      Math.max(4, Math.cos(sunAngle) * 22),
      this.camTarget.z + 12
    );

    const isEvening = hour >= 17.5;
    const nightFactor = hour >= 18 ? Math.min(1, (hour - 18) / 3.5) : 0;

    if (nightFactor > 0.2) {
      this.sunLight.color.setHex(0x8da9fc);
      this.sunLight.intensity = THREE.MathUtils.lerp(1.3, 0.45, nightFactor);
      this.ambientLight.color.setHex(0x475569);
      this.ambientLight.intensity = THREE.MathUtils.lerp(0.65, 0.42, nightFactor);
      this.scene.background = new THREE.Color(0x162436);
    } else if (isEvening) {
      this.sunLight.color.setHex(0xffb26b);
      this.sunLight.intensity = 1.25;
      this.ambientLight.color.setHex(0xffe0b2);
      this.ambientLight.intensity = 0.6;
      this.scene.background = new THREE.Color(0x2d4228);
    } else if (weather === 'rainy' || weather === 'stormy') {
      this.sunLight.color.setHex(0xcbd5e1);
      this.sunLight.intensity = 0.85;
      this.ambientLight.color.setHex(0x94a3b8);
      this.ambientLight.intensity = 0.65;
      this.scene.background = new THREE.Color(0x243b35);
    } else {
      this.sunLight.color.setHex(0xfff4d4);
      this.sunLight.intensity = 1.48;
      this.ambientLight.color.setHex(0xfff8e7);
      this.ambientLight.intensity = 0.68;
      this.scene.background = new THREE.Color(
        state.calendar.season === 'winter' ? 0x64748b : 0x2a4d2c
      );
    }

    const winEmissive = isEvening ? 1.25 : 0.3;
    for (const wm of this.windowMaterials) {
      wm.emissiveIntensity = winEmissive;
    }
    for (const lm of this.lanternGlassMats) {
      lm.emissiveIntensity = isEvening ? 1.4 : 0.35;
    }
    this.farmhouseGlowLight.intensity = isEvening ? 1.8 : 0.4;

    // Courtyard station animations
    const composterActive = state.machines.some((m) => m.type === 'composter' && m.activeRecipeId);
    if (this.composterBarrel) {
      this.composterBarrel.rotation.x += dt * (composterActive ? 2.8 : 0.35);
    }
    const cutterActive = state.machines.some((m) => m.type === 'seed_cutter' && m.activeRecipeId);
    if (this.seedCutterBlade) {
      this.seedCutterBlade.position.y =
        0.82 + Math.sin(this.animTime * (cutterActive ? 10 : 1.5)) * 0.05;
    }
    if (this.kitchenStewMesh) {
      this.kitchenStewMesh.scale.y = 1 + Math.sin(this.animTime * 5) * 0.15;
    }
    if (this.trophyGroup) {
      this.trophyGroup.visible = state.festival.won;
      this.trophyGroup.rotation.y = this.animTime * 1.4;
      this.trophyGroup.position.y = 1.08 + Math.sin(this.animTime * 2.5) * 0.06;
    }
    if (this.coldframeArchGroup) {
      this.coldframeArchGroup.visible = state.unlockedPlots.includes('plot_greenhouse');
    }
    for (const [plotId, signG] of this.plotSignGroups.entries()) {
      signG.visible = !state.unlockedPlots.includes(plotId as PlotId);
    }

    // Rain / Frost 3D particles
    const showWeather =
      !state.settings.reducedMotion &&
      (weather === 'rainy' || weather === 'stormy' || weather === 'frosty');
    this.weatherDropGroup.visible = showWeather;
    if (showWeather) {
      const fallSpeed = weather === 'frosty' ? 2.5 : 11.0;
      for (const drop of this.weatherDrops) {
        drop.position.y -= dt * fallSpeed;
        drop.position.x -= dt * (weather === 'frosty' ? 0.6 : 2.2);
        if (drop.position.y < 0) {
          drop.position.y = 8.5 + Math.random() * 2;
          drop.position.x = this.camTarget.x + (Math.random() - 0.5) * 18;
          drop.position.z = this.camTarget.z + (Math.random() - 0.5) * 14;
        }
      }
    }
  }

  private syncTiles3D(state: GameState): void {
    const season = state.calendar.season;
    const grassPalette: Record<string, [number, number]> = {
      spring: [0x5a9648, 0x518a40],
      summer: [0x4e8e40, 0x458038],
      autumn: [0x96783d, 0x886b34],
      winter: [0xdbeafe, 0xcbd5e1]
    };
    const [grassA, grassB] = grassPalette[season] || grassPalette.spring;
    let anyChanged = false;

    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i];
      const node = this.tileNodes[i];
      if (!node) continue;
      const plotUnlocked = !tile.plotId || state.unlockedPlots.includes(tile.plotId);
      const crop = tile.crop;

      const sig = `${season}|${tile.terrain}|${plotUnlocked ? 1 : 0}|${tile.tilled ? 1 : 0}|${Math.round(tile.moisture / 10)}|${tile.debris}|${
        crop
          ? `${crop.varietyId}:${crop.stage}:${crop.hillLevel}:${crop.hasWeeds ? 1 : 0}:${crop.hasPests ? 1 : 0}`
          : '0'
      }`;

      if (sig === node.lastSignature) continue;
      node.lastSignature = sig;
      anyChanged = true;

      if (tile.terrain === 'water') {
        node.baseMat.color.setHex(0x2282b8);
        node.baseMat.map = this.waterTex;
        node.baseMat.roughness = 0.22;
        node.baseMesh.position.y = -0.22;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'path') {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? 0xc2a378 : 0xb5966c);
        node.baseMat.map = this.pathTex;
        node.baseMat.roughness = 0.85;
        node.baseMesh.position.y = -0.12;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'stone_floor' || tile.terrain === 'building') {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? 0x8a827c : 0x7c746e);
        node.baseMat.map = this.stoneTex;
        node.baseMat.roughness = 0.88;
        node.baseMesh.position.y = -0.13;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'farm_soil') {
        node.baseMat.map = this.soilTex;
        if (!plotUnlocked) {
          node.baseMat.color.setHex(0x527042);
          node.baseMat.roughness = 0.92;
          node.furrowGroup.visible = false;
        } else if (!tile.tilled) {
          node.baseMat.color.setHex(0x7c583a);
          node.baseMat.roughness = 0.9;
          node.furrowGroup.visible = false;
        } else {
          const moistNorm = Math.min(1, tile.moisture / 100);
          const dryColor = new THREE.Color(0x8c603a);
          const wetColor = new THREE.Color(0x422613);
          node.baseMat.color.copy(dryColor).lerp(wetColor, moistNorm);
          node.furrowMat.color.copy(dryColor).lerp(wetColor, Math.min(1, moistNorm + 0.15));
          node.furrowGroup.visible = true;
        }
        node.baseMesh.position.y = -0.14;
      } else {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? grassA : grassB);
        node.baseMat.map = this.grassTex;
        node.baseMat.roughness = 0.86;
        node.baseMesh.position.y = -0.14;
        node.furrowGroup.visible = false;
      }
      node.baseMat.needsUpdate = true;

      // Rebuild 3D content on this tile
      while (node.contentGroup.children.length > 0) {
        node.contentGroup.remove(node.contentGroup.children[0]);
      }

      if (tile.debris === 'rock') {
        const rockMat = this.getSharedMat(0x78716c, 0.85);
        const mossMat = this.getSharedMat(0x4d7c3f, 0.88);
        const rock = new THREE.Mesh(this.dodecaGeo, rockMat);
        rock.scale.set(0.28, 0.22, 0.26);
        rock.position.set(-0.04, 0.13, 0);
        rock.castShadow = true;
        const pebble = new THREE.Mesh(this.dodecaGeo, rockMat);
        pebble.scale.set(0.13, 0.1, 0.12);
        pebble.position.set(0.18, 0.06, 0.12);
        const moss = new THREE.Mesh(this.sphereGeo, mossMat);
        moss.scale.set(0.18, 0.07, 0.16);
        moss.position.set(-0.04, 0.22, 0);
        node.contentGroup.add(rock, pebble, moss);
      } else if (tile.debris === 'weeds') {
        const weedMat = this.getSharedMat(0x3f8f38, 0.78);
        const dandelionMat = this.getSharedMat(0xfacc15, 0.6);
        for (const [wx, wz, rot] of [
          [-0.16, 0.06, -0.25],
          [0, -0.06, 0.05],
          [0.16, 0.08, 0.25]
        ]) {
          const tuft = new THREE.Mesh(this.dodecaGeo, weedMat);
          tuft.scale.set(0.13, 0.16, 0.12);
          tuft.position.set(wx, 0.11, wz);
          tuft.rotation.z = rot;
          node.contentGroup.add(tuft);
        }
        const flw = new THREE.Mesh(this.sphereGeo, dandelionMat);
        flw.scale.set(0.055, 0.055, 0.055);
        flw.position.set(0.02, 0.24, -0.04);
        node.contentGroup.add(flw);
      } else if (tile.debris === 'wild_sprout') {
        const sproutMat = this.getSharedMat(0x4ade80, 0.7);
        const flwMat = this.getSharedMat(0xfef08a, 0.5);
        const stem = new THREE.Mesh(this.cylGeo, sproutMat);
        stem.scale.set(0.05, 0.32, 0.05);
        stem.position.y = 0.16;
        const leaf1 = new THREE.Mesh(this.sphereGeo, sproutMat);
        leaf1.scale.set(0.18, 0.08, 0.12);
        leaf1.position.set(-0.08, 0.26, 0);
        const leaf2 = new THREE.Mesh(this.sphereGeo, sproutMat);
        leaf2.scale.set(0.18, 0.08, 0.12);
        leaf2.position.set(0.08, 0.28, 0);
        const bud = new THREE.Mesh(this.sphereGeo, flwMat);
        bud.scale.set(0.07, 0.07, 0.07);
        bud.position.set(0, 0.35, 0);
        node.contentGroup.add(stem, leaf1, leaf2, bud);
      }

      if (crop) {
        this.build3DCropOnTile(node.contentGroup, tile, crop);
      }
    }

    if (anyChanged && this.webgl) {
      this.webgl.shadowMap.needsUpdate = true;
    }
  }

  private build3DCropOnTile(
    parent: THREE.Group,
    tile: SoilTile,
    crop: NonNullable<SoilTile['crop']>
  ): void {
    const vDef = POTATO_VARIETIES[crop.varietyId];
    const isDry = tile.moisture < vDef.optimalMoisture[0] * 0.55;

    // 1. 3D Hilled Soil Ridge Mound (visibly taller at hillLevel 1 and 2!)
    const hillHeight = crop.hillLevel === 0 ? 0.09 : crop.hillLevel === 1 ? 0.22 : 0.33;
    const ridgeColor = tile.moisture >= 40 ? 0x3b2312 : 0x6b4426;
    const ridgeMat = this.getSharedMat(ridgeColor, 0.92);
    const ridgeMound = new THREE.Mesh(this.sphereGeo, ridgeMat);
    ridgeMound.scale.set(0.43, hillHeight, 0.35);
    ridgeMound.position.y = hillHeight * 0.45;
    ridgeMound.castShadow = true;
    ridgeMound.receiveShadow = true;
    parent.add(ridgeMound);

    const topY = hillHeight * 0.85;
    const leafHex = isDry ? 0xa3923a : crop.stage === 4 ? 0x6b9b37 : 0x2e8534;
    const leafMat = this.getSharedMat(leafHex, 0.72);
    const tuberMat = this.getSharedMat(vDef.colorHex, 0.58);

    if (crop.stage === 0) {
      const seed = new THREE.Mesh(this.sphereGeo, tuberMat);
      seed.scale.set(0.15, 0.1, 0.12);
      seed.position.y = topY + 0.04;
      parent.add(seed);
    } else if (crop.stage === 1) {
      for (const ox of [-0.12, 0, 0.12]) {
        const chit = new THREE.Mesh(this.coneGeo, leafMat);
        chit.scale.set(0.065, 0.24, 0.065);
        chit.position.set(ox, topY + 0.11, 0);
        parent.add(chit);
      }
    } else if (crop.stage === 2) {
      const positions = [
        [0, 0.16, 0, 0.22],
        [-0.16, 0.11, 0.06, 0.17],
        [0.16, 0.11, -0.05, 0.17],
        [0, 0.12, 0.14, 0.15]
      ];
      for (const [lx, ly, lz, r] of positions) {
        const puff = new THREE.Mesh(this.dodecaGeo, leafMat);
        puff.scale.set(r, r * 0.85, r);
        puff.position.set(lx, topY + ly, lz);
        parent.add(puff);
      }
    } else if (crop.stage === 3) {
      const positions = [
        [0, 0.22, 0, 0.26],
        [-0.19, 0.14, 0.08, 0.19],
        [0.19, 0.14, -0.08, 0.19],
        [-0.1, 0.16, -0.14, 0.18],
        [0.1, 0.16, 0.14, 0.18]
      ];
      for (const [lx, ly, lz, r] of positions) {
        const puff = new THREE.Mesh(this.dodecaGeo, leafMat);
        puff.scale.set(r, r * 0.9, r);
        puff.position.set(lx, topY + ly, lz);
        parent.add(puff);
      }

      const blossomMat = this.getSharedMat(vDef.blossomHex, 0.4);
      for (const [bx, by, bz] of [
        [-0.12, 0.44, 0.05],
        [0.12, 0.42, -0.04],
        [0, 0.48, 0]
      ]) {
        const flower = new THREE.Mesh(this.sphereGeo, blossomMat);
        flower.scale.set(0.08, 0.08, 0.08);
        flower.position.set(bx, topY + by, bz);
        parent.add(flower);
      }
    } else if (crop.stage === 4) {
      const ring = new THREE.Mesh(this.harvestRingGeo, this.harvestRingMat);
      ring.position.y = 0.04;
      parent.add(ring);

      for (const [lx, ly, lz, r] of [
        [-0.14, 0.18, -0.06, 0.2],
        [0.14, 0.18, -0.06, 0.2],
        [0, 0.25, -0.08, 0.22]
      ]) {
        const puff = new THREE.Mesh(this.dodecaGeo, leafMat);
        puff.scale.set(r, r * 0.85, r);
        puff.position.set(lx, topY + ly, lz);
        parent.add(puff);
      }

      for (const [tx, ty, tz] of [
        [-0.16, 0.08, 0.2],
        [0, 0.11, 0.24],
        [0.16, 0.08, 0.2],
        [0.06, 0.16, 0.14]
      ]) {
        const tuber = new THREE.Mesh(this.sphereGeo, tuberMat);
        tuber.scale.set(0.115, 0.09, 0.095);
        tuber.position.set(tx, topY * 0.6 + ty, tz);
        parent.add(tuber);
      }
    }

    if (crop.hasWeeds) {
      const wMat = this.getSharedMat(0x65a30d, 0.8);
      for (const wx of [-0.32, 0.32]) {
        const spike = new THREE.Mesh(this.coneGeo, wMat);
        spike.scale.set(0.06, 0.24, 0.06);
        spike.position.set(wx, 0.12, 0.22);
        parent.add(spike);
      }
    }
    if (crop.hasPests) {
      const bugMat = this.getSharedMat(0xdc2626, 0.6);
      const bug = new THREE.Mesh(this.sphereGeo, bugMat);
      bug.scale.set(0.07, 0.05, 0.07);
      bug.position.set(0.15, topY + 0.28, 0.15);
      parent.add(bug);
    }
  }

  private syncPlacedMachines3D(state: GameState, dt: number): void {
    const sig = state.machines
      .map((m) => `${m.id}:${m.type}:${m.x}:${m.y}:${m.activeRecipeId || ''}:${m.outputItem ? 1 : 0}`)
      .join('|');

    if (sig !== this.lastMachinesSignature) {
      this.lastMachinesSignature = sig;
      this.sprinklerRotors = [];
      while (this.dynamicMachinesGroup.children.length > 0) {
        this.dynamicMachinesGroup.remove(this.dynamicMachinesGroup.children[0]);
      }

      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xeab308,
        metalness: 0.78,
        roughness: 0.25
      });
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.6,
        roughness: 0.4
      });

      for (const m of state.machines) {
        if (
          (m.x === 10 && m.y === 3) ||
          (m.x === 12 && m.y === 3) ||
          (m.x === 14 && m.y === 3)
        ) {
          continue;
        }

        const g = new THREE.Group();
        g.position.set(m.x + 0.5, 0, m.y + 0.5);

        if (m.type === 'sprinkler') {
          const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 12), baseMat);
          flange.position.y = 0.04;
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.46, 10), brassMat);
          pipe.position.y = 0.25;
          pipe.castShadow = true;

          const rotor = new THREE.Group();
          rotor.position.y = 0.48;
          const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.04), brassMat);
          const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.56), brassMat);
          rotor.add(arm1, arm2);
          g.add(flange, pipe, rotor);
          this.sprinklerRotors.push(rotor);
        } else {
          const body = new THREE.Mesh(
            new THREE.BoxGeometry(0.68, 0.62, 0.68),
            new THREE.MeshStandardMaterial({ color: 0x7c4a1e, roughness: 0.8 })
          );
          body.position.y = 0.31;
          body.castShadow = true;
          g.add(body);
        }

        this.dynamicMachinesGroup.add(g);
      }
    }

    for (const rotor of this.sprinklerRotors) {
      rotor.rotation.y += dt * 4.2;
    }
  }

  private updatePlayerAndNpcs3D(state: GameState, _dt: number): void {
    const p = state.player;
    const isWalking = p.action === 'walk';
    const bobY =
      isWalking && !state.settings.reducedMotion ? Math.abs(Math.sin(this.animTime * 12)) * 0.09 : 0;

    this.playerGroup.position.set(p.x + 0.5, bobY, p.y + 0.5);

    const rotMap: Record<string, number> = {
      down: 0,
      right: Math.PI / 2,
      up: Math.PI,
      left: -Math.PI / 2
    };
    this.playerGroup.rotation.y = rotMap[p.facing] ?? 0;

    for (const [toolKey, mesh] of Object.entries(this.playerToolMeshes)) {
      mesh.visible = p.selectedTool === toolKey;
    }

    if (p.action !== 'idle' && p.action !== 'walk' && p.actionTimer > 0) {
      const swing = Math.sin((1 - p.actionTimer / 0.28) * Math.PI);
      this.playerToolPivot.rotation.x = swing * 1.15;
    } else {
      this.playerToolPivot.rotation.x = 0.15;
    }

    for (const [npcId, entry] of this.npcGroups.entries()) {
      entry.group.position.y = Math.sin(this.animTime * 2 + npcId.length) * 0.025;
      const hasReady = QUESTS.some(
        (q) =>
          q.giver === npcId &&
          !state.completedQuests.includes(q.id) &&
          getQuestProgress(state, q.id).ready
      );
      entry.marker.visible = hasReady;
      entry.marker.rotation.y = this.animTime * 2.5;
    }
  }

  private updateCursors3D(
    state: GameState,
    hoverTile: { x: number; y: number } | null,
    placementPreview: {
      x: number;
      y: number;
      valid: boolean;
      type: PlacedMachine['type'];
    } | null
  ): void {
    this.hoverActionHint = null;
    if (placementPreview) {
      this.hoverCursorMesh.position.set(placementPreview.x + 0.5, 0.09, placementPreview.y + 0.5);
      this.hoverCursorMat.color.setHex(placementPreview.valid ? 0x4ade80 : 0xf87171);

      if (placementPreview.type === 'sprinkler') {
        const radius = hasUpgrade(state, 'irrigation_2') ? 2 : 1;
        const span = radius * 2 + 1;
        this.placementRangeMesh.visible = true;
        this.placementRangeMesh.scale.set(span / 3, 1, span / 3);
        this.placementRangeMesh.position.set(
          placementPreview.x + 0.5,
          0.06,
          placementPreview.y + 0.5
        );
      } else {
        this.placementRangeMesh.visible = false;
      }
      return;
    }

    this.placementRangeMesh.visible = false;
    const p = state.player;
    const dx = p.facing === 'left' ? -1 : p.facing === 'right' ? 1 : 0;
    const dy = p.facing === 'up' ? -1 : p.facing === 'down' ? 1 : 0;
    const tx = hoverTile ? hoverTile.x : Math.round(p.x) + dx;
    const ty = hoverTile ? hoverTile.y : Math.round(p.y) + dy;

    this.hoverCursorMesh.position.set(tx + 0.5, 0.08, ty + 0.5);

    const tile = getTileAt(state.tiles, tx, ty);
    let cursorHex = 0xffe57f;
    if (tile) {
      const unlocked = !tile.plotId || state.unlockedPlots.includes(tile.plotId);
      if (unlocked) {
        if (tile.crop && tile.crop.stage === 4) {
          cursorHex = 0xfacc15;
          if (hoverTile) {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: p.selectedTool === 'fork' ? 'Click / E: Harvest Mature Ridge' : 'Harvest Ready! Equip Fork [4]',
              color: '#fde047'
            };
          }
        } else if (tile.crop && tile.moisture < 42) {
          cursorHex = 0x38bdf8;
          if (hoverTile) {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: p.selectedTool === 'watering_can' ? 'Click / E: Water Crop' : 'Needs Water! Equip Can [3]',
              color: '#7dd3fc'
            };
          }
        } else if (tile.crop && tile.crop.stage >= 1 && tile.crop.stage <= 3 && tile.crop.hillLevel < 2) {
          cursorHex = 0x86efac;
          if (hoverTile && p.selectedTool === 'hoe') {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: `Click / E: Hill Ridge (${tile.crop.hillLevel}/2)`,
              color: '#86efac'
            };
          }
        } else if (tile.terrain === 'farm_soil' && tile.debris !== 'none') {
          cursorHex = 0xfb923c;
          if (hoverTile) {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: p.selectedTool === 'spade' ? `Click / E: Clear ${tile.debris === 'rock' ? 'Stone' : 'Weeds'}` : `Equip Spade [1] to Clear`,
              color: '#fdba74'
            };
          }
        } else if (tile.terrain === 'farm_soil' && tile.tilled && !tile.crop && !tile.machineId) {
          cursorHex = 0x4ade80;
          if (hoverTile && p.selectedTool === 'pouch') {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: 'Click / E: Plant Seed in Furrow',
              color: '#86efac'
            };
          }
        } else if (tile.terrain === 'farm_soil' && !tile.tilled && !tile.crop && !tile.machineId) {
          cursorHex = 0xfcd34d;
          if (hoverTile && p.selectedTool === 'spade') {
            this.hoverActionHint = {
              x: tx,
              y: ty,
              text: 'Click / E: Till Furrow',
              color: '#fde68a'
            };
          }
        }
      }
    }
    this.hoverCursorMat.color.setHex(cursorHex);
  }

  private updateWaypointBeacon3D(state: GameState): void {
    const target = this.waypointTarget;
    if (!target) {
      this.waypointGroup.visible = false;
      for (const dot of this.waypointTrailDots) dot.visible = false;
      return;
    }

    this.waypointGroup.visible = true;
    this.waypointGroup.position.set(target.x + 0.5, 0, target.y + 0.5);

    const pulse = 1 + Math.sin(this.animTime * 5.2) * 0.14;
    this.waypointRingMesh.scale.set(pulse, pulse, 1);
    this.waypointPointerMesh.position.y = 1.25 + Math.sin(this.animTime * 4.5) * 0.16;
    this.waypointPointerMesh.rotation.y = this.animTime * 2.4;

    const px = state.player.x + 0.5;
    const pz = state.player.y + 0.5;
    const tx = target.x + 0.5;
    const tz = target.y + 0.5;
    const dist = Math.hypot(tx - px, tz - pz);

    const count = this.waypointTrailDots.length;
    for (let i = 0; i < count; i++) {
      const dot = this.waypointTrailDots[i];
      if (dist < 1.15) {
        dot.visible = false;
        continue;
      }
      const frac = (i + 1) / (count + 1);
      const wx = px + (tx - px) * frac;
      const wz = pz + (tz - pz) * frac;
      const wave = Math.max(0.25, 0.75 + Math.sin(this.animTime * 6.5 - i * 0.65) * 0.45);
      dot.visible = true;
      dot.position.set(wx, 0.08 + wave * 0.05, wz);
      dot.scale.set(wave, 1, wave);
    }
  }

  private updateParticles3D(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        this.particlesGroup.remove(pt.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.vy -= 6.5 * dt;
      if (pt.mesh.position.y < 0.05) {
        pt.mesh.position.y = 0.05;
        pt.vy *= -0.3;
      }
    }
  }

  private projectToScreen(
    worldX: number,
    worldY: number,
    worldZ: number
  ): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(worldX, worldY, worldZ);
    v.project(this.camera);
    if (v.z < -1 || v.z > 1) {
      return { x: 0, y: 0, visible: false };
    }
    return {
      x: (v.x * 0.5 + 0.5) * this.viewportW,
      y: (-v.y * 0.5 + 0.5) * this.viewportH,
      visible: true
    };
  }

  private isInsideHudSafeZone(sx: number, sy: number): boolean {
    // Keep 3D labels from colliding with the top-left HUD plaque + minimap, top-right nav dock, or bottom toolbelt
    if (sy < 345 && sx < 460) return true;
    if (sy < 310 && sx > this.viewportW - 600) return true;
    if (sy > this.viewportH - 145) return true;
    return false;
  }

  private drawProjectedWorldLabels(state: GameState, dt = 0.016): void {
    const demandVar = POTATO_VARIETIES[state.calendar.dailyDemandVariety];

    const labels: { wx: number; wy: number; wz: number; text: string; color: string }[] = [
      { wx: 4.5, wy: 2.35, wz: 4.2, text: 'Farmhouse (Sleep)', color: '#fff4d2' },
      { wx: 7.5, wy: 1.25, wz: 4.2, text: 'Root Cellar', color: '#e8d8b8' },
      { wx: 10.5, wy: 1.35, wz: 3.5, text: 'Composter', color: '#d7f5c6' },
      { wx: 12.5, wy: 1.35, wz: 3.5, text: 'Seed Cutter', color: '#ffe5a3' },
      { wx: 14.5, wy: 1.35, wz: 3.5, text: 'Spud Kitchen', color: '#ffccbc' },
      {
        wx: 19.5,
        wy: 1.55,
        wz: 4.0,
        text: state.festival.won ? 'GOLDEN SPUD TROPHY' : 'Festival Plinth',
        color: state.festival.won ? '#ffe659' : '#e0d6c8'
      },
      { wx: 26.5, wy: 2.35, wz: 4.2, text: "Barnaby's Emporium", color: '#fff4d2' },
      {
        wx: 32.5,
        wy: 2.35,
        wz: 4.2,
        text: `Market (${demandVar.name} +25%)`,
        color: '#ffe57f'
      },
      { wx: 5.5, wy: 1.65, wz: 9.5, text: 'Stone Well (Refill)', color: '#bae6fd' },
      { wx: 3.5, wy: 0.85, wz: 19.5, text: 'Grove & Aid Barrel', color: '#bbf7d0' }
    ];

    // Locked plot deed signs at their spread-out locations
    for (const plotId of ['plot_south', 'plot_east', 'plot_greenhouse'] as PlotId[]) {
      if (!state.unlockedPlots.includes(plotId)) {
        const info = PLOT_INFO[plotId];
        labels.push({
          wx: info.signX + 0.5,
          wy: 0.95,
          wz: info.signY + 0.5,
          text: `${info.name} (${info.badge})`,
          color: plotId === 'plot_greenhouse' ? '#bae6fd' : '#fde68a'
        });
      }
    }

    // NPC labels
    for (const npc of Object.values(NPCS)) {
      const hasReady = QUESTS.some(
        (q) =>
          q.giver === npc.id &&
          !state.completedQuests.includes(q.id) &&
          getQuestProgress(state, q.id).ready
      );
      labels.push({
        wx: npc.x + 0.5,
        wy: 1.5,
        wz: npc.y + 0.5,
        text: hasReady ? `[!] ${npc.name}` : npc.name,
        color: hasReady ? '#fde047' : '#ffffff'
      });
    }

    for (const lbl of labels) {
      // Skip standard label if it's right on top of the active waypoint target so they don't overlap
      if (
        this.waypointTarget &&
        Math.hypot(lbl.wx - (this.waypointTarget.x + 0.5), lbl.wz - (this.waypointTarget.y + 0.5)) < 1.8
      ) {
        continue;
      }
      const pt = this.projectToScreen(lbl.wx, lbl.wy, lbl.wz);
      if (
        pt.visible &&
        pt.x >= 40 &&
        pt.x <= this.viewportW - 40 &&
        pt.y >= 20 &&
        pt.y <= this.viewportH - 25 &&
        !this.isInsideHudSafeZone(pt.x, pt.y)
      ) {
        this.drawWorldLabelPill(this.ctx, pt.x, pt.y, lbl.text, lbl.color);
      }
    }

    // Draw "[READY]" badge above any processing machine that has finished output
    for (const m of state.machines) {
      if (m.outputItem) {
        const pt = this.projectToScreen(m.x + 0.5, 1.75, m.y + 0.5);
        if (pt.visible && !this.isInsideHudSafeZone(pt.x, pt.y)) {
          this.drawWorldLabelPill(this.ctx, pt.x, pt.y, 'READY TO COLLECT', '#86efac');
        }
      }
    }

    // Draw Hovered Tile Action Hint pill when hovering an interactive tile
    if (this.hoverActionHint) {
      const hPt = this.projectToScreen(
        this.hoverActionHint.x + 0.5,
        1.15,
        this.hoverActionHint.y + 0.5
      );
      if (hPt.visible && !this.isInsideHudSafeZone(hPt.x, hPt.y)) {
        this.drawWorldLabelPill(
          this.ctx,
          hPt.x,
          hPt.y,
          this.hoverActionHint.text,
          this.hoverActionHint.color
        );
      }
    }

    // Draw 3D Waypoint Target Callout Banner (or Off-Screen Edge Compass if off-screen)
    if (this.waypointTarget) {
      const bobY = 2.0 + Math.sin(this.animTime * 4.5) * 0.1;
      const wpPt = this.projectToScreen(
        this.waypointTarget.x + 0.5,
        bobY,
        this.waypointTarget.y + 0.5
      );
      const inBounds =
        wpPt.visible &&
        wpPt.x >= 90 &&
        wpPt.x <= this.viewportW - 90 &&
        wpPt.y >= 55 &&
        wpPt.y <= this.viewportH - 135 &&
        !this.isInsideHudSafeZone(wpPt.x, wpPt.y);

      if (inBounds) {
        this.drawWaypointCalloutBanner(
          this.ctx,
          wpPt.x,
          wpPt.y,
          this.waypointTarget.label,
          this.waypointTarget.subLabel
        );
      } else {
        const distTiles = Math.round(
          Math.hypot(
            this.waypointTarget.x - state.player.x,
            this.waypointTarget.y - state.player.y
          )
        );
        const angle = Math.atan2(
          this.waypointTarget.y - state.player.y,
          this.waypointTarget.x - state.player.x
        );
        this.drawOffscreenCompass(
          this.ctx,
          angle,
          `${this.waypointTarget.label} (${distTiles}m)`
        );
      }
    }

    // Render 3D-projected floating action texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life += dt;
      if (ft.life >= ft.maxLife) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      const prog = ft.life / ft.maxLife;
      const pt = this.projectToScreen(ft.wx, 0.9 + prog * 1.1, ft.wz);
      if (pt.visible) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, 1 - prog * 0.85);
        this.drawWorldLabelPill(this.ctx, pt.x, pt.y, ft.text, ft.color);
        this.ctx.restore();
      }
    }

    void LANDMARKS;
    void getTileAt;
  }

  private drawWaypointCalloutBanner(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    title: string,
    subtitle?: string
  ): void {
    ctx.save();
    ctx.font = '800 12px "Inter", system-ui, sans-serif';
    const titleW = ctx.measureText(title).width;
    let subW = 0;
    if (subtitle) {
      ctx.font = '700 10.5px "Inter", system-ui, sans-serif';
      subW = ctx.measureText(subtitle).width;
    }
    const padX = 12;
    const w = Math.max(titleW, subW) + padX * 2;
    const h = subtitle ? 38 : 24;
    const boxY = cy - h - 8;

    // Golden outer glow & dark oak background
    ctx.fillStyle = 'rgba(28, 16, 6, 0.95)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, boxY, w, h, 8);
    ctx.fill();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Downward pointer triangle
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(cx - 6, boxY + h);
    ctx.lineTo(cx + 6, boxY + h);
    ctx.lineTo(cx, boxY + h + 7);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 12px "Inter", system-ui, sans-serif';
    ctx.fillStyle = '#fef08a';
    ctx.fillText(title, cx, subtitle ? boxY + 12 : boxY + h / 2);

    if (subtitle) {
      ctx.font = '700 10.5px "Inter", system-ui, sans-serif';
      ctx.fillStyle = '#d9f99d';
      ctx.fillText(subtitle, cx, boxY + 27);
    }
    ctx.restore();
  }

  private drawOffscreenCompass(
    ctx: CanvasRenderingContext2D,
    angleRad: number,
    label: string
  ): void {
    ctx.save();
    const centerX = this.viewportW * 0.5;
    const centerY = this.viewportH * 0.52;
    const radiusX = Math.min(280, this.viewportW * 0.32);
    const radiusY = Math.min(165, this.viewportH * 0.24);
    const cx = centerX + Math.cos(angleRad) * radiusX;
    const cy = centerY + Math.sin(angleRad) * radiusY;

    ctx.font = '800 11.5px "Inter", system-ui, sans-serif';
    const dirStr =
      Math.abs(Math.cos(angleRad)) > Math.abs(Math.sin(angleRad))
        ? Math.cos(angleRad) > 0
          ? 'EAST -> '
          : '<- WEST '
        : Math.sin(angleRad) > 0
          ? 'SOUTH v '
          : 'NORTH ^ ';
    const fullText = `TARGET: ${dirStr}${label}`;
    const w = ctx.measureText(fullText).width + 22;
    const h = 26;

    ctx.fillStyle = 'rgba(24, 52, 28, 0.95)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 999);
    ctx.fill();

    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullText, cx, cy + 0.5);
    ctx.restore();
  }

  private drawWorldLabelPill(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    text: string,
    textColor: string
  ): void {
    ctx.save();
    ctx.font = '700 11.5px "Inter", system-ui, sans-serif';
    const padX = 8;
    const w = ctx.measureText(text).width + padX * 2;
    const h = 21;

    ctx.fillStyle = 'rgba(24, 15, 8, 0.88)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
    ctx.fill();

    ctx.strokeStyle = 'rgba(228, 182, 98, 0.78)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }
}
