/**
 * Clean, crisp inline SVG vector icons for SPUDSTEAD.
 * Replaces all unicode emojis to guarantee consistent, emoji-free rendering across all platforms.
 */

export type IconName =
  | 'coin'
  | 'stamina'
  | 'water'
  | 'sun'
  | 'breeze'
  | 'rain'
  | 'storm'
  | 'frost'
  | 'shop'
  | 'pack'
  | 'quests'
  | 'build'
  | 'trophy'
  | 'sleep'
  | 'settings'
  | 'save'
  | 'sprout'
  | 'spade'
  | 'hoe'
  | 'watering_can'
  | 'fork'
  | 'pouch'
  | 'star'
  | 'check'
  | 'lock'
  | 'clock'
  | 'tip'
  | 'warning'
  | 'book'
  | 'cycle'
  | 'close'
  | 'play'
  | 'pause'
  | 'arrow-up'
  | 'arrow-down'
  | 'arrow-left'
  | 'arrow-right'
  | 'compost'
  | 'kitchen'
  | 'import'
  | 'export'
  | 'trash'
  | 'sound'
  | 'compass'
  | 'target';

const SVG_PATHS: Record<IconName, string> = {
  coin: `<circle cx="12" cy="12" r="9" fill="#f5b935" stroke="#8c5308" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff3c4" stroke-width="1.5"/>`,
  stamina: `<polygon points="13,2 4,14 11,14 10,22 20,10 13,10" fill="#ffd23f" stroke="#854d0e" stroke-width="1.8" stroke-linejoin="round"/>`,
  water: `<path d="M12 2.5 C12 2.5 5.5 10.5 5.5 15 A6.5 6.5 0 0 0 18.5 15 C18.5 10.5 12 2.5 12 2.5 Z" fill="#38bdf8" stroke="#0369a1" stroke-width="1.8"/>`,
  sun: `<circle cx="12" cy="12" r="5" fill="#facc15" stroke="#ca8a04" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="#eab308" stroke-width="2" stroke-linecap="round"/>`,
  breeze: `<path d="M3 9h12a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M5 17h9" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>`,
  rain: `<path d="M6 13a4 4 0 0 1 .8-7.9A5.5 5.5 0 0 1 17.5 7a3.5 3.5 0 0 1 .5 6H6z" fill="#94a3b8" stroke="#475569" stroke-width="1.8"/><path d="M8 16l-1.5 4M12 16l-1.5 4M16 16l-1.5 4" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>`,
  storm: `<path d="M6 12a4 4 0 0 1 .8-7.9A5.5 5.5 0 0 1 17.5 6a3.5 3.5 0 0 1 .5 6H6z" fill="#64748b" stroke="#334155" stroke-width="1.8"/><polygon points="13,13 9,18 12,18 11,22 16,16 13,16" fill="#facc15"/>`,
  frost: `<path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round"/>`,
  shop: `<path d="M3 9l1.8-5h14.4L21 9v2a3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1-3 3 3 3 0 0 1-3-3V9z" fill="#e11d48" stroke="#881337" stroke-width="1.6"/><path d="M5 14v7h14v-7" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/>`,
  pack: `<rect x="5" y="7" width="14" height="14" rx="3" fill="#b45309" stroke="#451a03" stroke-width="1.8"/><path d="M9 7V5a3 3 0 0 1 6 0v2M5 12h14M12 10v4" fill="none" stroke="#fef3c7" stroke-width="1.8" stroke-linecap="round"/>`,
  quests: `<rect x="5" y="3" width="14" height="18" rx="2" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#78350f" stroke-width="1.8" stroke-linecap="round"/>`,
  build: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z" fill="#94a3b8" stroke="#334155" stroke-width="1.8"/>`,
  trophy: `<path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="#facc15" stroke="#854d0e" stroke-width="1.8"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 20h8" fill="none" stroke="#854d0e" stroke-width="1.8" stroke-linecap="round"/>`,
  sleep: `<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="#fde047" stroke="#854d0e" stroke-width="1.8"/>`,
  settings: `<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  save: `<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="#60a5fa" stroke="#1e3a8a" stroke-width="1.8"/><rect x="8" y="4" width="6" height="5" fill="#eff6ff"/><rect x="7" y="13" width="10" height="7" fill="#eff6ff"/>`,
  sprout: `<path d="M12 21V10M12 14c-4 0-7-3-7-7 4 0 7 3 7 7zM12 11c3.5 0 6.5-2.5 6.5-6.5-3.5 0-6.5 2.5-6.5 6.5z" fill="#4ade80" stroke="#166534" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  spade: `<path d="M4 20l7-7M9 3l3 3M11 13l5-5c2-2 2-5 0-5s-3 0-5 2l-5 5 5 3z" fill="#94a3b8" stroke="#334155" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  hoe: `<path d="M4 20L15 9M13 5l6 6-3 3-6-6 3-3z" fill="#b45309" stroke="#451a03" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  watering_can: `<rect x="6" y="10" width="10" height="9" rx="2" fill="#38bdf8" stroke="#0369a1" stroke-width="1.8"/><path d="M16 13l5-4M6 12c-2 0-3-1.5-3-3s1.5-3 4-3h5" fill="none" stroke="#0369a1" stroke-width="1.8" stroke-linecap="round"/>`,
  fork: `<path d="M4 20l8-8M11 9l4 4M13 7l5 5M12 12l6-6M10 10l6-6M14 14l6-6" fill="none" stroke="#ca8a04" stroke-width="1.8" stroke-linecap="round"/>`,
  pouch: `<path d="M7 9c-2 2.5-2.5 6.5-1 9.5 1.2 2 3.5 2.5 6 2.5s4.8-.5 6-2.5c1.5-3 1-7-1-9.5H7z" fill="#d97706" stroke="#78350f" stroke-width="1.8"/><path d="M8 9L6 5h12l-2 4" fill="#f59e0b" stroke="#78350f" stroke-width="1.8" stroke-linejoin="round"/>`,
  star: `<polygon points="12,2.5 14.9,8.5 21.5,9.4 16.7,14 17.9,20.5 12,17.4 6.1,20.5 7.3,14 2.5,9.4 9.1,8.5" fill="#facc15" stroke="#854d0e" stroke-width="1.6" stroke-linejoin="round"/>`,
  check: `<polyline points="4,12.5 9.5,18 20,6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock: `<rect x="5" y="11" width="14" height="10" rx="2" fill="#94a3b8" stroke="#334155" stroke-width="1.8"/><path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="#334155" stroke-width="1.8"/>`,
  clock: `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="12,7 12,12 15.5,14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  tip: `<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.6.5 1.1 1.3 1.3 2.1h5c.2-.8.7-1.6 1.3-2.1A6 6 0 0 0 12 3z" fill="#fde047" stroke="#854d0e" stroke-width="1.8" stroke-linecap="round"/>`,
  warning: `<polygon points="12,3 22,20 2,20" fill="#facc15" stroke="#854d0e" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v5M12 17h.01" stroke="#451a03" stroke-width="2.2" stroke-linecap="round"/>`,
  book: `<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/><path d="M8 3v18M11 8h6M11 12h6" stroke="#78350f" stroke-width="1.6" stroke-linecap="round"/>`,
  cycle: `<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  play: `<polygon points="6,4 20,12 6,20" fill="currentColor"/>`,
  pause: `<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>`,
  'arrow-up': `<polygon points="12,5 20,17 4,17" fill="currentColor"/>`,
  'arrow-down': `<polygon points="12,19 20,7 4,7" fill="currentColor"/>`,
  'arrow-left': `<polygon points="5,12 17,4 17,20" fill="currentColor"/>`,
  'arrow-right': `<polygon points="19,12 7,4 7,20" fill="currentColor"/>`,
  compost: `<circle cx="12" cy="12" r="9" fill="#86efac" stroke="#166534" stroke-width="1.8"/><path d="M8 12l3 3 5-6" fill="none" stroke="#166534" stroke-width="2" stroke-linecap="round"/>`,
  kitchen: `<path d="M5 11h14v5a6 6 0 0 1-12 0v-5z" fill="#475569" stroke="#1e293b" stroke-width="1.8"/><path d="M9 7V5M12 7V4M15 7V5" stroke="#f97316" stroke-width="1.8" stroke-linecap="round"/>`,
  import: `<path d="M12 3v12M8 11l4 4 4-4M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  export: `<path d="M12 15V3M8 7l4-4 4 4M4 17v3h16v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  trash: `<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  sound: `<polygon points="11,5 6,9 2,9 2,15 6,15 11,19" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  compass: `<circle cx="12" cy="12" r="9" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/><polygon points="16.5,7.5 13.8,13.8 7.5,16.5 10.2,10.2" fill="#e11d48" stroke="#78350f" stroke-width="1.2" stroke-linejoin="round"/>`,
  target: `<circle cx="12" cy="12" r="8" fill="none" stroke="#facc15" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#facc15"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#facc15" stroke-width="2" stroke-linecap="round"/>`
};

export function icon(name: IconName, size = 15): string {
  const inner = SVG_PATHS[name] || SVG_PATHS.sprout;
  return `<svg class="ui-svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style="display:inline-block;vertical-align:-2px;flex-shrink:0;">${inner}</svg>`;
}
