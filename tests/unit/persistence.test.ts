import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { SaveManager, validateAndMigrateSave } from '../../src/persistence/saveManager';
import { buyUpgrade, createNewGameState, performTileAction } from '../../src/sim/simulation';

describe('SPUDSTEAD Browser-Local Persistence & Save Reliability', () => {
  let saveManager: SaveManager;

  beforeEach(async () => {
    saveManager = new SaveManager();
    await saveManager.deleteAllSaves();
  });

  it('saves to IndexedDB and restores full authoritative game state accurately', async () => {
    const state = createNewGameState('Golden Ridge Farm', 10101);
    state.player.x = 9;
    state.player.y = 7;
    state.player.selectedTool = 'fork';
    performTileAction(state, 9, 8); // Harvest starter crop
    state.player.gold = 345;
    buyUpgrade(state, 'tool_spade_1');

    const saved = await saveManager.saveGame(state);
    expect(saved).toBe(true);

    const loaded = await saveManager.loadGame();
    expect(loaded.state).not.toBeNull();
    expect(loaded.recoveredFromBackup).toBe(false);
    expect(loaded.state?.farmName).toBe('Golden Ridge Farm');
    expect(loaded.state?.player.gold).toBe(260); // 345 - 85g upgrade
    expect(loaded.state?.upgrades).toContain('tool_spade_1');
    expect(loaded.state?.stats.totalHarvested).toBeGreaterThanOrEqual(3);
  });

  it('recovers automatically from the last-known-good backup when the primary save is corrupted', async () => {
    const state = createNewGameState('Backup Haven', 20202);
    state.player.gold = 410;
    await saveManager.saveGame(state);

    // Second save rotates first save into backup
    state.player.gold = 520;
    await saveManager.saveGame(state);

    // Corrupt primary save slot
    await saveManager.corruptPrimarySaveForTest();

    const loaded = await saveManager.loadGame();
    expect(loaded.state).not.toBeNull();
    expect(loaded.recoveredFromBackup).toBe(true);
    expect(loaded.state?.farmName).toBe('Backup Haven');
    expect(loaded.error).toContain('backup');
  });

  it('exports and imports validated JSON saves and rejects malformed or malicious payloads', async () => {
    const state = createNewGameState('Exported Estate', 30303);
    state.player.gold = 777;
    const exportedJson = saveManager.exportSaveToJson(state);

    await saveManager.deleteAllSaves();
    const afterDelete = await saveManager.loadGame();
    expect(afterDelete.state).toBeNull();

    // Reject invalid JSON
    const badJson = await saveManager.importSaveFromJson('{not_valid_json');
    expect(badJson.ok).toBe(false);

    // Reject schema-invalid JSON (e.g. negative gold or wrong tile count)
    const badSchema = await saveManager.importSaveFromJson(
      JSON.stringify({ farmName: 'Bad', calendar: {}, player: { gold: -500 }, tiles: [] })
    );
    expect(badSchema.ok).toBe(false);
    expect(validateAndMigrateSave({ random: 'object' })).toBeNull();

    // Accept valid exported JSON
    const goodImport = await saveManager.importSaveFromJson(exportedJson);
    expect(goodImport.ok).toBe(true);
    expect(goodImport.state?.farmName).toBe('Exported Estate');
    expect(goodImport.state?.player.gold).toBe(777);
  });

  it('surfaces storage write failures visibly instead of silently pretending to save', async () => {
    const state = createNewGameState('Failure Test Farm', 40404);
    const statuses: string[] = [];
    saveManager.onStatusChange((ev) => statuses.push(ev.status));

    saveManager.setSimulateStorageFailure(true);
    const ok = await saveManager.saveGame(state);
    expect(ok).toBe(false);
    expect(statuses).toContain('error');
    expect(statuses[statuses.length - 1]).toBe('error');

    saveManager.setSimulateStorageFailure(false);
  });
});
