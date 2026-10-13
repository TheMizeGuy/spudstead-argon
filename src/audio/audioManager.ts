import { GameSettings, WeatherType } from '../data/types';

export type SfxId =
  | 'dig'
  | 'plant'
  | 'water'
  | 'hill'
  | 'harvest'
  | 'coin'
  | 'ui'
  | 'fanfare';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private settings: GameSettings = {
    musicVolume: 0.55,
    sfxVolume: 0.75,
    muted: false,
    screenShake: true,
    reducedMotion: false,
    timeSpeed: 1
  };
  private bgmAudio: HTMLAudioElement | null = null;
  private ambDayAudio: HTMLAudioElement | null = null;
  private ambRainAudio: HTMLAudioElement | null = null;
  private sfxCache: Partial<Record<SfxId, HTMLAudioElement>> = {};
  private currentWeather: WeatherType = 'sunny';

  public init(): void {
    const unlockHandler = () => {
      this.unlock();
    };
    window.addEventListener('pointerdown', unlockHandler, { once: false, passive: true });
    window.addEventListener('keydown', unlockHandler, { once: false, passive: true });
  }

  public unlock(): void {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.syncLoops();
      return;
    }
    this.unlocked = true;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    } catch {
      // Ignore AudioContext errors in headless browsers
    }

    try {
      this.bgmAudio = new Audio('./assets/audio/bgm-pastoral.wav');
      this.bgmAudio.loop = true;

      this.ambDayAudio = new Audio('./assets/audio/ambience-day.wav');
      this.ambDayAudio.loop = true;

      this.ambRainAudio = new Audio('./assets/audio/ambience-rain.wav');
      this.ambRainAudio.loop = true;

      const sfxList: SfxId[] = [
        'dig',
        'plant',
        'water',
        'hill',
        'harvest',
        'coin',
        'ui',
        'fanfare'
      ];
      for (const id of sfxList) {
        const el = new Audio(`./assets/audio/sfx-${id}.wav`);
        el.preload = 'auto';
        this.sfxCache[id] = el;
      }
    } catch {
      // Ignore audio element load failures
    }

    this.syncLoops();
  }

  public applySettings(settings: GameSettings, weather?: WeatherType): void {
    this.settings = { ...settings };
    if (weather) {
      this.currentWeather = weather;
    }
    this.syncLoops();
  }

  private syncLoops(): void {
    if (!this.unlocked) return;
    const muted = this.settings.muted;
    const musicVol = muted ? 0 : Math.max(0, Math.min(1, this.settings.musicVolume));
    const sfxVol = muted ? 0 : Math.max(0, Math.min(1, this.settings.sfxVolume));

    if (this.bgmAudio) {
      this.bgmAudio.volume = musicVol * 0.65;
      if (musicVol > 0.01 && this.bgmAudio.paused) {
        this.bgmAudio.play().catch(() => {});
      } else if (musicVol <= 0.01 && !this.bgmAudio.paused) {
        this.bgmAudio.pause();
      }
    }

    const isRain = this.currentWeather === 'rainy' || this.currentWeather === 'stormy';
    if (this.ambDayAudio) {
      this.ambDayAudio.volume = sfxVol * (isRain ? 0.12 : 0.35);
      if (sfxVol > 0.01 && this.ambDayAudio.paused) {
        this.ambDayAudio.play().catch(() => {});
      } else if (sfxVol <= 0.01 && !this.ambDayAudio.paused) {
        this.ambDayAudio.pause();
      }
    }

    if (this.ambRainAudio) {
      this.ambRainAudio.volume = isRain ? sfxVol * 0.45 : 0;
      if (isRain && sfxVol > 0.01 && this.ambRainAudio.paused) {
        this.ambRainAudio.play().catch(() => {});
      } else if ((!isRain || sfxVol <= 0.01) && !this.ambRainAudio.paused) {
        this.ambRainAudio.pause();
      }
    }
  }

  public playSfx(id: SfxId): void {
    if (!this.unlocked || this.settings.muted || this.settings.sfxVolume <= 0.01) {
      return;
    }
    const vol = Math.max(0, Math.min(1, this.settings.sfxVolume));

    // Play cached WAV element clone
    const template = this.sfxCache[id];
    if (template) {
      try {
        const clone = template.cloneNode() as HTMLAudioElement;
        clone.volume = vol * 0.8;
        clone.play().catch(() => {});
        return;
      } catch {
        // Fallback to WebAudio synth below
      }
    }

    this.playSynthFallback(id, vol);
  }

  private playSynthFallback(id: SfxId, vol: number): void {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const freqMap: Record<SfxId, [number, number, number]> = {
        dig: [150, 85, 0.14],
        plant: [260, 440, 0.12],
        water: [380, 520, 0.18],
        hill: [190, 290, 0.15],
        harvest: [440, 880, 0.22],
        coin: [987.7, 1318.5, 0.18],
        ui: [520, 580, 0.06],
        fanfare: [523.25, 1046.5, 0.35]
      };
      const [f0, f1, dur] = freqMap[id];
      osc.type = id === 'coin' || id === 'harvest' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f0, now);
      osc.frequency.exponentialRampToValueAtTime(f1, now + dur);

      gain.gain.setValueAtTime(vol * 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.start(now);
      osc.stop(now + dur);
    } catch {
      // Ignore synth errors
    }
  }
}
