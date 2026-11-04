import { invoke } from "@tauri-apps/api/core";
import { GameRecord } from "@draftgap/core/src/history/game-record";

const GAME_HISTORY_KEY = "draftgap-game-history";

// The desktop app keeps the history in a file in its data folder; the web version falls back to localStorage.
export async function loadGameHistory(isDesktop: boolean) {
    const contents = isDesktop
        ? ((await invoke("load_game_history")) as string)
        : (localStorage.getItem(GAME_HISTORY_KEY) ?? "[]");

    return JSON.parse(contents) as GameRecord[];
}

export async function saveGameHistory(
    isDesktop: boolean,
    records: GameRecord[],
) {
    const contents = JSON.stringify(records);
    if (isDesktop) {
        await invoke("save_game_history", { contents });
    } else {
        localStorage.setItem(GAME_HISTORY_KEY, contents);
    }
}
