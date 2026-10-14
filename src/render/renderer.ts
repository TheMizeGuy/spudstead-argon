import * as THREE from 'three';
import { NPCS, PLOT_INFO, POTATO_VARIETIES, QUESTS } from '../data/content';
import { GameState, PlacedMachine, SoilTile } from '../data/types';
import { canPlaceMachineAt, getQuestProgress, hasUpgrade } from '../sim/simulation';
import { LANDMARKS, MAP_HEIGHT, MAP_WIDTH, getTileAt } from '../sim/worldMap';

interface Particle3D {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
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

  private tileNodes: TileVisualNode[] = [];
  private waterMeshes: THREE.Mesh[] = [];
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

  private particlesGroup: THREE.Group;
  private particles: Particle3D[] = [];
  private weatherDropGroup: THREE.Group;
  private weatherDrops: THREE.Mesh[] = [];

  private plotFenceGroups: Map<string, THREE.Group> = new Map();
  private coldframeArchGroup: THREE.Group | null = null;

  private hoverTile: { x: number; y: number } | null = null;
  private placementMode: PlacedMachine['type'] | null = null;
  private floatingTexts: { wx: number; wz: number; text: string; color: string; life: number; maxLife: number }[] = [];

  private animTime = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private viewportW = 1280;
  private viewportH = 720;
  private camTarget = new THREE.Vector3(11.5, 0, 9.0);

  // Shared geometries & material cache for high-FPS 3D rendering
  private sphereGeo = new THREE.SphereGeometry(1, 8, 6);
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
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

    this.harvestRingGeo = new THREE.RingGeometry(0.38, 0.45, 16);
    this.harvestRingGeo.rotateX(-Math.PI / 2);
    this.harvestRingMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      side: THREE.DoubleSide
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a4d2c);
    this.scene.fog = new THREE.FogExp2(0x2a4d2c, 0.012);

    this.camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.5, 120);
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
    this.ambientLight = new THREE.AmbientLight(0xfff4dc, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xfff9e6, 0x3b5e2b, 0.55);
    this.hemiLight.position.set(0, 25, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff2cc, 1.45);
    this.sunLight.position.set(18, 22, 16);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 65;
    const d = 16;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.farmhouseGlowLight = new THREE.PointLight(0xffb84d, 0.6, 8);
    this.farmhouseGlowLight.position.set(4.5, 1.5, 4.2);
    this.scene.add(this.farmhouseGlowLight);

    this.kitchenFireLight = new THREE.PointLight(0xff7722, 0.9, 5);
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
      opacity: 0.9
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

    this.buildStaticWorld();
    this.buildWeatherDrops();
    this.resize();
    if (this.webgl) {
      this.webgl.shadowMap.needsUpdate = true;
    }
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
    this.glCanvas.width = this.viewportW;
    this.glCanvas.height = this.viewportH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);

    this.camera.aspect = Math.max(0.4, this.viewportW / Math.max(1, this.viewportH));
    // Widen FOV slightly on narrow mobile portrait screens so the field remains well-framed
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
    // 1. Surrounding meadow skirt plane so the 3D horizon is lush and seamless
    const skirtGeo = new THREE.PlaneGeometry(110, 90);
    skirtGeo.rotateX(-Math.PI / 2);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x3b6e38,
      roughness: 0.92
    });
    const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
    skirtMesh.position.set(MAP_WIDTH / 2, -0.16, MAP_HEIGHT / 2);
    skirtMesh.receiveShadow = true;
    this.scene.add(skirtMesh);

    // 2. Build 28x18 3D terrain tile nodes
    const tileBoxGeo = new THREE.BoxGeometry(0.98, 0.28, 0.98);
    const furrowBoxGeo = new THREE.BoxGeometry(0.84, 0.07, 0.16);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const group = new THREE.Group();
        group.position.set(x + 0.5, 0, y + 0.5);

        const baseMat = new THREE.MeshStandardMaterial({
          color: (x + y) % 2 === 0 ? 0x568d46 : 0x4f8440,
          roughness: 0.88
        });
        const baseMesh = new THREE.Mesh(tileBoxGeo, baseMat);
        baseMesh.position.y = -0.14;
        baseMesh.receiveShadow = true;
        group.add(baseMesh);

        // Furrows for tilled soil
        const furrowGroup = new THREE.Group();
        const furrowMat = new THREE.MeshStandardMaterial({
          color: 0x4b2e1b,
          roughness: 0.9
        });
        for (let f = -1; f <= 1; f++) {
          const fm = new THREE.Mesh(furrowBoxGeo, furrowMat);
          fm.position.set(0, 0.03, f * 0.27);
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

    // 3. Build 3D Plot Timber Borders & Coldframe Arches
    this.buildPlotBorders();

    // 4. Build 3D Buildings, Pond, Well, Stations, Shop & Market
    this.buildFarmhouse3D();
    this.buildCellar3D();
    this.buildCourtyardStations3D();
    this.buildFestivalPlinth3D();
    this.buildShopAndMarket3D();
    this.buildPondAndWell3D();
    this.buildPerimeterTrees3D();
    this.buildNpcs3D();
  }

  private buildPlotBorders(): void {
    const plotBounds: Record<string, { x1: number; y1: number; x2: number; y2: number }> = {
      plot_homestead: { x1: 8, y1: 7, x2: 15, y2: 11 },
      plot_south: { x1: 8, y1: 13, x2: 15, y2: 16 },
      plot_east: { x1: 17, y1: 8, x2: 23, y2: 12 },
      plot_greenhouse: { x1: 17, y1: 14, x2: 23, y2: 17 }
    };

    const timberMat = new THREE.MeshStandardMaterial({ color: 0x5c3818, roughness: 0.85 });
    for (const [plotId, b] of Object.entries(plotBounds)) {
      const g = new THREE.Group();
      const w = b.x2 - b.x1 + 1;
      const h = b.y2 - b.y1 + 1;
      const cx = b.x1 + w / 2;
      const cz = b.y1 + h / 2;

      const northBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.14, 0.12), timberMat);
      northBeam.position.set(cx, 0.07, b.y1 - 0.02);
      northBeam.castShadow = true;
      g.add(northBeam);

      const southBeam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.14, 0.12), timberMat);
      southBeam.position.set(cx, 0.07, b.y2 + 1.02);
      southBeam.castShadow = true;
      g.add(southBeam);

      const westBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, h + 0.16), timberMat);
      westBeam.position.set(b.x1 - 0.02, 0.07, cz);
      westBeam.castShadow = true;
      g.add(westBeam);

      const eastBeam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, h + 0.16), timberMat);
      eastBeam.position.set(b.x2 + 1.02, 0.07, cz);
      eastBeam.castShadow = true;
      g.add(eastBeam);

      // Corner posts
      for (const [px, pz] of [
        [b.x1, b.y1],
        [b.x2 + 1, b.y1],
        [b.x1, b.y2 + 1],
        [b.x2 + 1, b.y2 + 1]
      ]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.18), timberMat);
        post.position.set(px, 0.17, pz);
        post.castShadow = true;
        g.add(post);
      }

      this.scene.add(g);
      this.plotFenceGroups.set(plotId, g);
    }

    // Glass Coldframe 3D arches
    const archGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.6,
      roughness: 0.3
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.25,
      roughness: 0.1
    });
    for (let x = 17; x <= 24; x += 2) {
      const postN = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.08), frameMat);
      postN.position.set(x, 0.42, 14.0);
      archGroup.add(postN);
    }
    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.8, 0.05), glassMat);
    backGlass.position.set(20.5, 0.42, 14.0);
    archGroup.add(backGlass);
    archGroup.visible = false;
    this.scene.add(archGroup);
    this.coldframeArchGroup = archGroup;
  }

  private buildFarmhouse3D(): void {
    const g = new THREE.Group();
    // Farmhouse spans x: 2..6 (width 5), y: 1..4 (depth 4) -> center (4.5, 0, 3.0)
    const cx = 4.5;
    const cz = 3.0;

    // Stone foundation
    const foundMat = new THREE.MeshStandardMaterial({ color: 0x6b655e, roughness: 0.9 });
    const found = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.35, 3.6), foundMat);
    found.position.set(cx, 0.175, cz);
    found.castShadow = true;
    found.receiveShadow = true;
    g.add(found);

    // Stucco walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5e8c7, roughness: 0.78 });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.85, 3.3), wallMat);
    walls.position.set(cx, 1.25, cz);
    walls.castShadow = true;
    walls.receiveShadow = true;
    g.add(walls);

    // Timber beams
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x4a2c14, roughness: 0.85 });
    for (const bx of [2.25, 3.6, 5.4, 6.75]) {
      const vBeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9, 3.36), beamMat);
      vBeam.position.set(bx, 1.25, cz);
      g.add(vBeam);
    }

    // Pitched 3D Roof (2 sloped roof planes + gable ends)
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x9e3b24, roughness: 0.72 });
    const roofSlopeGeo = new THREE.BoxGeometry(5.1, 0.16, 2.2);

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

    const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.2, 0.24), beamMat);
    ridgeCap.position.set(cx, 3.12, cz);
    g.add(ridgeCap);

    // Brick Chimney
    const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 });
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.6, 0.55), chimneyMat);
    chimney.position.set(6.1, 2.95, cz - 0.6);
    chimney.castShadow = true;
    g.add(chimney);

    // Front Door & Porch Step
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.8 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.35, 0.12), doorMat);
    door.position.set(cx, 0.95, cz + 1.66);
    g.add(door);

    const porchStep = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.55), foundMat);
    porchStep.position.set(cx, 0.09, cz + 1.9);
    g.add(porchStep);

    // Glowing Windows + Flower Boxes
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x89cff0,
      emissive: 0xffb74d,
      emissiveIntensity: 0.35,
      roughness: 0.2
    });
    this.windowMaterials.push(winMat);

    for (const wx of [3.05, 5.95]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.68, 0.1), winMat);
      win.position.set(wx, 1.32, cz + 1.65);
      g.add(win);

      const box = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.25), beamMat);
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

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 });
    const mound = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.9, 1.85), stoneMat);
    mound.position.set(cx, 0.45, cz);
    mound.castShadow = true;
    g.add(mound);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
    const doors = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.12, 1.45), doorMat);
    doors.position.set(cx, 0.92, cz + 0.1);
    doors.rotation.x = 0.22;
    g.add(doors);

    this.scene.add(g);
  }

  private buildCourtyardStations3D(): void {
    // 1. Courtyard stone pavement (x: 9..15, y: 2..4)
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.88 });
    const courtyardSlab = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.06, 3.0), slabMat);
    courtyardSlab.position.set(12.5, 0.02, 3.5);
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
      new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.9 })
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
    g.position.set(17.5, 0, 3.8);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.65 });
    const base1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.92), stoneMat);
    base1.position.y = 0.12;
    base1.castShadow = true;
    const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.48, 0.68), stoneMat);
    base2.position.y = 0.48;
    base2.castShadow = true;
    g.add(base1, base2);

    const trophyGroup = new THREE.Group();
    trophyGroup.position.y = 1.05;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xb45309,
      emissiveIntensity: 0.35,
      metalness: 0.85,
      roughness: 0.18
    });
    const spud = new THREE.Mesh(this.sphereGeo, goldMat);
    spud.scale.set(0.32, 0.42, 0.28);
    spud.castShadow = true;
    trophyGroup.add(spud);
    trophyGroup.visible = false;
    g.add(trophyGroup);
    this.trophyGroup = trophyGroup;

    this.scene.add(g);
  }

  private buildShopAndMarket3D(): void {
    const g = new THREE.Group();
    // Barnaby's Shop (x: 19..22, y: 1..4) & Market Stall (x: 23..26, y: 1..4) -> center (23.0, 0, 3.0)
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b3e1b, roughness: 0.82 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.95, 2.8), woodMat);
    counter.position.set(23.0, 0.475, 3.0);
    counter.castShadow = true;
    counter.receiveShadow = true;
    g.add(counter);

    // Back wall & roof posts
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(7.6, 1.9, 0.35), woodMat);
    backWall.position.set(23.0, 0.95, 1.75);
    backWall.castShadow = true;
    g.add(backWall);

    for (const px of [19.4, 23.0, 26.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 8), woodMat);
      post.position.set(px, 1.05, 4.2);
      post.castShadow = true;
      g.add(post);
    }

    // Striped Awning Roof (alternating red/white/green segments)
    const stripeColors = [0xd94e34, 0xfdf6e2, 0x3b7a3e, 0xfdf6e2];
    for (let i = 0; i < 8; i++) {
      const stripeMat = new THREE.MeshStandardMaterial({
        color: stripeColors[i % stripeColors.length],
        roughness: 0.7
      });
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 3.1), stripeMat);
      stripe.position.set(19.65 + i * 0.95, 2.12, 3.05);
      stripe.rotation.x = 0.18;
      stripe.castShadow = true;
      g.add(stripe);
    }

    // 4 Potato Crates on the counter
    const crateColors = [0xe8bc4a, 0xc84b4b, 0x9c7248, 0x7b4b94];
    for (let i = 0; i < 4; i++) {
      const cx = 20.3 + i * 1.8;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 0.65), woodMat);
      crate.position.set(cx, 1.05, 3.8);
      g.add(crate);

      const spudMat = new THREE.MeshStandardMaterial({ color: crateColors[i], roughness: 0.6 });
      for (let s = 0; s < 5; s++) {
        const spud = new THREE.Mesh(this.sphereGeo, spudMat);
        spud.scale.set(0.12, 0.09, 0.1);
        spud.position.set(
          cx + ((s % 3) - 1) * 0.17,
          1.22 + Math.floor(s / 3) * 0.06,
          3.8 + (s % 2 === 0 ? -0.08 : 0.08)
        );
        g.add(spud);
      }
    }

    this.scene.add(g);
  }

  private buildPondAndWell3D(): void {
    // 1. Stone Well at (5.5, 0, 9.5)
    const wellGroup = new THREE.Group();
    wellGroup.position.set(5.5, 0, 9.5);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.88 });
    const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.52, 16), stoneMat);
    wellRing.position.y = 0.26;
    wellRing.castShadow = true;
    wellGroup.add(wellRing);

    const waterDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.36, 0.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.2, metalness: 0.3 })
    );
    waterDisk.position.y = 0.48;
    wellGroup.add(waterDisk);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3818, roughness: 0.85 });
    for (const sx of [-0.38, 0.38]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 0.08), woodMat);
      post.position.set(sx, 0.72, 0);
      post.castShadow = true;
      wellGroup.add(post);
    }

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 0.48, 4),
      new THREE.MeshStandardMaterial({ color: 0x8b3a2b, roughness: 0.75 })
    );
    roof.position.y = 1.38;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    wellGroup.add(roof);

    this.scene.add(wellGroup);

    // 2. Lily pads on the Spring Pond (x: 1..4, y: 9..13)
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.7 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.5 });
    const padCoords = [
      [2.2, 10.2],
      [3.8, 11.1],
      [2.5, 12.2],
      [3.9, 12.8],
      [1.8, 13.3]
    ];
    for (const [lx, lz] of padCoords) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12), padMat);
      pad.position.set(lx, 0.03, lz);
      const bud = new THREE.Mesh(this.sphereGeo, flowerMat);
      bud.scale.set(0.07, 0.07, 0.07);
      bud.position.set(0, 0.05, 0);
      pad.add(bud);
      this.scene.add(pad);
    }
  }

  private buildPerimeterTrees3D(): void {
    const treePositions = [
      [1, 1],
      [8, 1],
      [10, 1],
      [13, 1],
      [16, 1],
      [19, 1],
      [21, 1],
      [1, 3],
      [1, 6],
      [1, 9],
      [1, 12],
      [1, 15],
      [1, 17],
      [27, 6],
      [27, 10],
      [27, 14],
      [27, 17]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x2e6f32, roughness: 0.82 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x3f8f44, roughness: 0.8 });

    for (const [tx, ty] of treePositions) {
      const g = new THREE.Group();
      g.position.set(tx + 0.5, 0, ty + 0.5);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.75, 8), trunkMat);
      trunk.position.y = 0.375;
      trunk.castShadow = true;
      g.add(trunk);

      const crown1 = new THREE.Mesh(this.dodecaGeo, leafMat1);
      crown1.scale.set(0.56, 0.52, 0.56);
      crown1.position.set(0, 0.95, 0);
      crown1.castShadow = true;
      g.add(crown1);

      const crown2 = new THREE.Mesh(this.dodecaGeo, leafMat2);
      crown2.scale.set(0.42, 0.42, 0.42);
      crown2.position.set(0.12, 1.35, -0.08);
      crown2.castShadow = true;
      g.add(crown2);

      this.scene.add(g);
    }
  }

  private buildPlayerMesh(): void {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.65 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf6c99e, roughness: 0.6 });
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xe6b85c, roughness: 0.75 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.52, 12), bodyMat);
    torso.position.y = 0.34;
    torso.castShadow = true;
    this.playerGroup.add(torso);

    const head = new THREE.Mesh(this.sphereGeo, skinMat);
    head.scale.set(0.21, 0.21, 0.21);
    head.position.y = 0.74;
    head.castShadow = true;
    this.playerGroup.add(head);

    // Straw sunhat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16), hatMat);
    brim.position.y = 0.88;
    brim.castShadow = true;
    this.playerGroup.add(brim);

    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 12), bandMat);
    band.position.y = 0.92;
    this.playerGroup.add(band);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 12), hatMat);
    crown.position.y = 0.98;
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

      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.26, 0.54, 12),
        new THREE.MeshStandardMaterial({ color: cfg.coat, roughness: 0.75 })
      );
      torso.position.y = 0.35;
      torso.castShadow = true;
      g.add(torso);

      const head = new THREE.Mesh(this.sphereGeo, skinMat);
      head.scale.set(0.2, 0.2, 0.2);
      head.position.y = 0.74;
      head.castShadow = true;
      g.add(head);

      const hatMat = new THREE.MeshStandardMaterial({ color: cfg.hat, roughness: 0.7 });
      if (cfg.isChef) {
        const toque = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.28, 12), hatMat);
        toque.position.y = 0.98;
        g.add(toque);
      } else {
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 12), hatMat);
        brim.position.y = 0.89;
        g.add(brim);
      }

      // Floating quest marker diamond
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), markerMat);
      marker.position.y = 1.32;
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

    // 1. Update Camera smoothly tracking player in 3D space
    const targetX = THREE.MathUtils.clamp(state.player.x + 0.5, 8.5, MAP_WIDTH - 8.5);
    const targetZ = THREE.MathUtils.clamp(state.player.y + 0.5, 6.2, MAP_HEIGHT - 5.2);
    this.camTarget.lerp(new THREE.Vector3(targetX, 0, targetZ), Math.min(1, dt * 8));

    let shakeX = 0;
    let shakeZ = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeZ = (Math.random() - 0.5) * this.shakeIntensity;
    }

    this.camera.position.set(
      this.camTarget.x + shakeX,
      14.2,
      this.camTarget.z + 11.4 + shakeZ
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

    // 6. Update Hover & Placement cursors
    this.updateCursors3D(state, hoverTile, placementPreview);

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

    // Sun angle across sky from 6:00 to 22:00
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

    // Farmhouse warm glowing windows at evening/night
    const winEmissive = isEvening ? 1.25 : 0.3;
    for (const wm of this.windowMaterials) {
      wm.emissiveIntensity = winEmissive;
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
      this.trophyGroup.position.y = 1.05 + Math.sin(this.animTime * 2.5) * 0.06;
    }
    if (this.coldframeArchGroup) {
      this.coldframeArchGroup.visible = state.unlockedPlots.includes('plot_greenhouse');
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
      spring: [0x589446, 0x4f883e],
      summer: [0x4c8c3e, 0x437e36],
      autumn: [0x94763b, 0x866932],
      winter: [0xdbeafe, 0xcbd5e1]
    };
    const [grassA, grassB] = grassPalette[season] || grassPalette.spring;
    let anyChanged = false;

    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i];
      const node = this.tileNodes[i];
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

      // Update base block material & height
      if (tile.terrain === 'water') {
        node.baseMat.color.setHex(0x1d78ab);
        node.baseMat.roughness = 0.22;
        node.baseMesh.position.y = -0.22;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'path') {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? 0xb5966d : 0xa88960);
        node.baseMat.roughness = 0.85;
        node.baseMesh.position.y = -0.12;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'stone_floor' || tile.terrain === 'building') {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? 0x78716c : 0x6b655e);
        node.baseMat.roughness = 0.88;
        node.baseMesh.position.y = -0.13;
        node.furrowGroup.visible = false;
      } else if (tile.terrain === 'farm_soil') {
        if (!plotUnlocked) {
          node.baseMat.color.setHex(0x4b6b3c);
          node.baseMat.roughness = 0.92;
          node.furrowGroup.visible = false;
        } else if (!tile.tilled) {
          node.baseMat.color.setHex(0x735135);
          node.baseMat.roughness = 0.9;
          node.furrowGroup.visible = false;
        } else {
          const moistNorm = Math.min(1, tile.moisture / 100);
          const dryColor = new THREE.Color(0x855a36);
          const wetColor = new THREE.Color(0x3b2211);
          node.baseMat.color.copy(dryColor).lerp(wetColor, moistNorm);
          node.furrowMat.color.copy(dryColor).lerp(wetColor, Math.min(1, moistNorm + 0.15));
          node.furrowGroup.visible = true;
        }
        node.baseMesh.position.y = -0.14;
      } else {
        node.baseMat.color.setHex((tile.x + tile.y) % 2 === 0 ? grassA : grassB);
        node.baseMat.roughness = 0.88;
        node.baseMesh.position.y = -0.14;
        node.furrowGroup.visible = false;
      }

      // Rebuild 3D content on this tile (debris or 3D hilled ridge + 3D potato crop)
      while (node.contentGroup.children.length > 0) {
        node.contentGroup.remove(node.contentGroup.children[0]);
      }

      if (tile.debris === 'rock') {
        const rock = new THREE.Mesh(this.dodecaGeo, this.getSharedMat(0x78716c, 0.85));
        rock.scale.set(0.28, 0.22, 0.26);
        rock.position.y = 0.14;
        rock.castShadow = true;
        node.contentGroup.add(rock);
      } else if (tile.debris === 'weeds') {
        const weedMat = this.getSharedMat(0x3f8f38, 0.8);
        for (let w = -1; w <= 1; w++) {
          const blade = new THREE.Mesh(this.coneGeo, weedMat);
          blade.scale.set(0.08, 0.28, 0.08);
          blade.position.set(w * 0.16, 0.14, (w % 2) * 0.08);
          node.contentGroup.add(blade);
        }
      } else if (tile.debris === 'wild_sprout') {
        const sproutMat = this.getSharedMat(0x4ade80, 0.7);
        const stem = new THREE.Mesh(this.cylGeo, sproutMat);
        stem.scale.set(0.06, 0.3, 0.06);
        stem.position.y = 0.15;
        const leaf = new THREE.Mesh(this.sphereGeo, sproutMat);
        leaf.scale.set(0.18, 0.1, 0.12);
        leaf.position.set(0, 0.28, 0);
        node.contentGroup.add(stem, leaf);
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
    const hillHeight = crop.hillLevel === 0 ? 0.09 : crop.hillLevel === 1 ? 0.21 : 0.32;
    const ridgeColor = tile.moisture >= 40 ? 0x3b2312 : 0x6b4426;
    const ridgeMat = this.getSharedMat(ridgeColor, 0.92);
    const ridgeMound = new THREE.Mesh(this.sphereGeo, ridgeMat);
    ridgeMound.scale.set(0.42, hillHeight, 0.34);
    ridgeMound.position.y = hillHeight * 0.45;
    ridgeMound.castShadow = true;
    ridgeMound.receiveShadow = true;
    parent.add(ridgeMound);

    const topY = hillHeight * 0.85;
    const leafHex = isDry ? 0xa3923a : crop.stage === 4 ? 0x6b9b37 : 0x2e8534;
    const leafMat = this.getSharedMat(leafHex, 0.72);
    const tuberMat = this.getSharedMat(vDef.colorHex, 0.58);

    if (crop.stage === 0) {
      // Stage 0: Planted Seed Tuber with pale chits
      const seed = new THREE.Mesh(this.sphereGeo, tuberMat);
      seed.scale.set(0.14, 0.1, 0.11);
      seed.position.y = topY + 0.04;
      parent.add(seed);
    } else if (crop.stage === 1) {
      // Stage 1: Emerging 3D Green Chits
      for (const ox of [-0.12, 0, 0.12]) {
        const chit = new THREE.Mesh(this.coneGeo, leafMat);
        chit.scale.set(0.06, 0.22, 0.06);
        chit.position.set(ox, topY + 0.1, 0);
        parent.add(chit);
      }
    } else if (crop.stage === 2) {
      // Stage 2: Lush 3D Leafy Haulm Bush
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
      // Stage 3: Tall Flowering 3D Potato Canopy with Blossoms
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
        flower.scale.set(0.075, 0.075, 0.075);
        flower.position.set(bx, topY + by, bz);
        parent.add(flower);
      }
    } else if (crop.stage === 4) {
      // Stage 4: Harvest-Ready Mature Ridge with Glowing Ring & 3D Tubers Peeking Out!
      const ring = new THREE.Mesh(this.harvestRingGeo, this.harvestRingMat);
      ring.position.y = 0.04;
      parent.add(ring);

      // Mature haulm canopy
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

      // Plump 3D Potato Tubers bursting out the front of the ridge!
      for (const [tx, ty, tz] of [
        [-0.16, 0.08, 0.2],
        [0, 0.11, 0.24],
        [0.16, 0.08, 0.2],
        [0.06, 0.16, 0.14]
      ]) {
        const tuber = new THREE.Mesh(this.sphereGeo, tuberMat);
        tuber.scale.set(0.11, 0.085, 0.09);
        tuber.position.set(tx, topY * 0.6 + ty, tz);
        parent.add(tuber);
      }
    }

    // Weeds or Pests 3D visual indicators
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
        // Built-in courtyard stations at (10,3), (12,3), (14,3) already have permanent 3D meshes
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
          // Placed processing station in courtyard/field
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

    // Rotate 3D sprinkler arms and spawn occasional mist droplets
    for (const rotor of this.sprinklerRotors) {
      rotor.rotation.y += dt * 4.2;
    }
  }

  private updatePlayerAndNpcs3D(state: GameState, _dt: number): void {
    const p = state.player;
    const isWalking = p.action === 'walk';
    const bobY = isWalking && !state.settings.reducedMotion ? Math.abs(Math.sin(this.animTime * 12)) * 0.09 : 0;

    this.playerGroup.position.set(p.x + 0.5, bobY, p.y + 0.5);

    const rotMap: Record<string, number> = {
      down: 0,
      right: Math.PI / 2,
      up: Math.PI,
      left: -Math.PI / 2
    };
    this.playerGroup.rotation.y = rotMap[p.facing] ?? 0;

    // Show active 3D tool mesh and animate swing
    for (const [toolKey, mesh] of Object.entries(this.playerToolMeshes)) {
      mesh.visible = p.selectedTool === toolKey;
    }

    if (p.action !== 'idle' && p.action !== 'walk' && p.actionTimer > 0) {
      const swing = Math.sin((1 - p.actionTimer / 0.28) * Math.PI);
      this.playerToolPivot.rotation.x = swing * 1.15;
    } else {
      this.playerToolPivot.rotation.x = 0.15;
    }

    // Update NPC idle breathing & quest markers
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
    this.hoverCursorMat.color.setHex(0xffe57f);
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

  private projectToScreen(worldX: number, worldY: number, worldZ: number): { x: number; y: number; visible: boolean } {
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

  private drawProjectedWorldLabels(state: GameState, dt = 0.016): void {
    const demandVar = POTATO_VARIETIES[state.calendar.dailyDemandVariety];

    const labels: { wx: number; wy: number; wz: number; text: string; color: string }[] = [
      { wx: 4.5, wy: 2.3, wz: 4.2, text: 'Farmhouse (Sleep)', color: '#fff4d2' },
      { wx: 7.5, wy: 1.25, wz: 4.2, text: 'Cellar', color: '#e8d8b8' },
      { wx: 10.5, wy: 1.35, wz: 3.5, text: 'Composter', color: '#d7f5c6' },
      { wx: 12.5, wy: 1.35, wz: 3.5, text: 'Seed Cutter', color: '#ffe5a3' },
      { wx: 14.5, wy: 1.35, wz: 3.5, text: 'Spud Kitchen', color: '#ffccbc' },
      {
        wx: 17.5,
        wy: 1.55,
        wz: 4.0,
        text: state.festival.won ? 'GOLDEN SPUD TROPHY' : 'Festival Plinth',
        color: state.festival.won ? '#ffe659' : '#e0d6c8'
      },
      { wx: 21.0, wy: 2.25, wz: 4.2, text: "Barnaby's Shop", color: '#fff4d2' },
      {
        wx: 24.8,
        wy: 2.25,
        wz: 4.2,
        text: `Market (${demandVar.name} +25%)`,
        color: '#ffe57f'
      },
      { wx: 5.5, wy: 1.65, wz: 9.5, text: 'Well (Refill)', color: '#bae6fd' },
      { wx: 3.5, wy: 0.7, wz: 16.5, text: 'Grove & Aid', color: '#bbf7d0' }
    ];

    // Locked plot deed signs
    if (!state.unlockedPlots.includes('plot_south')) {
      labels.push({
        wx: 8.5,
        wy: 0.85,
        wz: 13.5,
        text: `${PLOT_INFO.plot_south.name} (Deed: 180g)`,
        color: '#fde68a'
      });
    }
    if (!state.unlockedPlots.includes('plot_east')) {
      labels.push({
        wx: 17.5,
        wy: 0.85,
        wz: 8.5,
        text: `${PLOT_INFO.plot_east.name} (Deed: 280g)`,
        color: '#fde68a'
      });
    }
    if (!state.unlockedPlots.includes('plot_greenhouse')) {
      labels.push({
        wx: 17.5,
        wy: 0.85,
        wz: 14.5,
        text: `${PLOT_INFO.plot_greenhouse.name} (Deed: 420g)`,
        color: '#bae6fd'
      });
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
        wy: 1.45,
        wz: npc.y + 0.5,
        text: hasReady ? `[!] ${npc.name}` : npc.name,
        color: hasReady ? '#fde047' : '#ffffff'
      });
    }

    for (const lbl of labels) {
      const pt = this.projectToScreen(lbl.wx, lbl.wy, lbl.wz);
      if (pt.visible && pt.x >= -60 && pt.x <= this.viewportW + 60 && pt.y >= 20 && pt.y <= this.viewportH - 20) {
        this.drawWorldLabelPill(this.ctx, pt.x, pt.y, lbl.text, lbl.color);
      }
    }

    // Also draw "[Ready]" badge above any processing machine that has finished output
    for (const m of state.machines) {
      if (m.outputItem) {
        const pt = this.projectToScreen(m.x + 0.5, 1.75, m.y + 0.5);
        if (pt.visible) {
          this.drawWorldLabelPill(this.ctx, pt.x, pt.y, 'READY', '#86efac');
        }
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

    // Touch LANDMARKS reference so unused import never warns
    void LANDMARKS;
    void getTileAt;
  }

  private drawWorldLabelPill(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    text: string,
    textColor: string
  ): void {
    ctx.save();
    ctx.font = '700 11px "Inter", system-ui, sans-serif';
    const padX = 7;
    const w = ctx.measureText(text).width + padX * 2;
    const h = 19;

    ctx.fillStyle = 'rgba(26, 16, 9, 0.84)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 5);
    ctx.fill();

    ctx.strokeStyle = 'rgba(225, 178, 97, 0.68)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.restore();
  }
}
