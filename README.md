# SPUDSTEAD — Specialty-Potato Farming Simulator

**SPUDSTEAD** is a complete, original 2D top-down specialty-potato farming simulator built with TypeScript, HTML5 2D Canvas, Web Audio, and versioned IndexedDB persistence.

Transform an overgrown homestead plot into a thriving specialty-potato estate: clear weeds and field stones, till rich loam furrows, plant six distinct potato varieties, manage soil moisture and fertility, earth up growing stems with the Hilling Hoe, run compost tumblers, seed cutters, and an artisan kitchen, install rotary brass sprinklers, fulfill town contracts, and win the **Golden Spud Festival**.

---

## 🎮 Live Playable URL & Repository

- **Public GitHub Pages Game URL:** `https://themizeguy.github.io/spudstead-argon/`
- **Public GitHub Repository:** `https://github.com/TheMizeGuy/spudstead-argon`

---

## 🕹️ Controls & First 10 Minutes Quickstart

### Controls (Desktop Keyboard/Mouse & Mobile Touch)
| Action | Keyboard / Mouse | Mobile / Touch |
| :--- | :--- | :--- |
| **Move** | `W A S D` or `Arrow Keys` (or click tiles) | On-screen D-Pad (Bottom-Left) or tap tiles |
| **Use Selected Tool** | Click target tile or press `E` | Tap target tile or tap **⚒️ Use Tool** |
| **Interact / Talk** | Click landmark/NPC or press `F` | Tap landmark/NPC or tap **💬 Interact** |
| **Select Tools (1–5)** | `1` Spade • `2` Hilling Hoe • `3` Watering Can • `4` Harvest Fork • `5` Seed/Compost Pouch | Tap any slot on the Bottom Tool Belt |
| **Cycle Active Seed / Compost** | `Tab` or click Active Pouch card | Tap the Active Pouch card |
| **Pause / Time Speed** | `Space` (Pause) or click `⏸ / 1× / 2× / 4×` | Tap `⏸ / 1× / 2× / 4×` on Top-Left HUD |
| **Menus** | `M` Shop • `I` Backpack/Cellar • `J` Quests • `B` Build • `K` Festival Almanac • `N` Sleep • `Esc` Settings | Tap Top-Right HUD Menu Buttons |

### Reaching the First Meaningful Milestone (~3–10 Minutes)
1. **Immediate First Harvest (First 60 Seconds):** Walk south from the Farmhouse to row `y=8` in your Homestead Patch. Use the **Harvest Fork (`Key 4`)** on the two mature **Yukon Sunburst** ridges at `(9,8)` and `(10,8)` to lift your first 6–8 tubers, then click **🎁 Claim 45g** on the HUD objective banner.
2. **Plant, Water & Hill:** Switch to the **Seed & Compost Pouch (`Key 5`)** and plant **Yukon Sunburst** or **Crimson Rose** seeds into the pre-tilled furrows at `(9,9)–(12,9)`. Water with the **Watering Can (`Key 3`)** and use the **Hilling Hoe (`Key 2`)** on the growing ridges to mound soil (`Hill 1/2` → `2/2`) for bonus yield and Artisan quality.
3. **Sell & Buy Your First Upgrade:** Open **Shop & Sell (`M`)**, switch to the **Sell Harvest & Goods** tab to sell your harvested tubers, then open **Upgrades & Land Deeds** to purchase the **Tempered Ash Spade (`85g`)**, **Copper Rose Watering Can (`90g`)**, or **Waxed Canvas Field Pack (`95g`)**.

---

## 🥔 Six Distinct Potato Varieties

| Variety | Preferred Seasons | Growth Time | Yield | Water Need | Signature Trait |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Yukon Sunburst** | Spring, Summer | ~2.25 days (36h) | 3–4 | Moderate (35–80%) | Fast, forgiving golden all-rounder |
| **Crimson Rose** | Spring, Autumn | ~3.0 days (48h) | 4–6 | High (50–95%) | High-volume waxy red tuber; loves rain |
| **Ironclad Russet** | Summer, Autumn | ~3.4 days (54h) | 3–4 | Low (25–68%) | Drought-hardy starchy baker; ideal for Kettle Chips |
| **Violet Majesty** | Summer, Autumn | ~4.0 days (64h) | 2–4 | Precise (45–78%) | Gourmet purple fingerling; high Artisan value |
| **Glacier Finger** | Autumn, Winter, Spring | ~3.25 days (52h) | 3–4 | Low (30–75%) | **Frost-tolerant** winter variety; gains care in frost/snow |
| **Golden Truffle Spud** | Spring, Summer, Autumn | ~4.75 days (76h) | 2–3 | Precise (45–82%) | Prestige *Solanum Aurum* crown variety for the Festival |

---

## 💾 Browser-Local Saves & Recovery Architecture

- **Primary Storage:** IndexedDB (`spudstead_argon_idb_v1`, store `saves`, keys `primary` and `backup`) with a synchronized fallback mirror in `localStorage`.
- **Automatic Saving:** Triggers after planting, harvesting, hilling, shopping, selling, upgrades, machine actions, quest/order rewards, day transitions, every 15 seconds while active, and on `visibilitychange` when hidden.
- **Verified Save Indicator:** The HUD displays `"Saving…"` and transitions to `"Saved • HH:MM:SS"` **only** after the storage transaction completes.
- **Last-Known-Good Backup Recovery:** Every valid save rotates the previous valid primary save into the `backup` slot. If the primary save is ever corrupted, `SaveManager` automatically restores from `backup` and notifies the player.
- **Multi-Tab Conflict Protection:** Uses `BroadcastChannel` and monotonic `saveRevision` counters to prevent an older open tab from silently overwriting newer progress saved in another tab.
- **Validated Export / Import:** Export your farm as a versioned JSON file or import and validate a backup from the Title Screen or Settings modal.

---

## 🛠️ Local Development & Testing

```bash
# Install dependencies
npm ci

# Start local development server
npm run dev

# Run TypeScript type checking
npm run typecheck

# Run deterministic unit & IndexedDB persistence tests (Vitest)
npm test

# Build production static bundle
npm run build

# Run end-to-end Playwright browser & visual verification suite
npm run test:e2e
```

---

## 📜 License & Attribution

Released under the [MIT License](./LICENSE). All artwork (`public/assets/art/*`, `design/*`) and audio (`public/assets/audio/*`) are original production assets created for SPUDSTEAD.
