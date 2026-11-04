import { invoke } from "@tauri-apps/api/core";
import {
    LolChampSelectChampSelectSession,
    LolChampSelectGridChampions,
    LolSummonerSummoner,
} from "../types/Lcu";

export async function getChampSelectSession(): Promise<LolChampSelectChampSelectSession | null> {
    return (await invoke(
        "get_champ_select_session",
    )) as LolChampSelectChampSelectSession | null;
}

export async function getCurrentSummoner(): Promise<LolSummonerSummoner | null> {
    return (await invoke("get_current_summoner")) as LolSummonerSummoner | null;
}

export async function getGridChampions(): Promise<LolChampSelectGridChampions | null> {
    return (await invoke(
        "get_grid_champions",
    )) as LolChampSelectGridChampions | null;
}

export async function getPickableChampionIds(): Promise<number[] | null> {
    return (await invoke("get_pickable_champion_ids")) as number[] | null;
}

// Only the parts of /lol-gameflow/v1/session the game history uses.
export type LolGameflowSession = {
    phase: string;
    gameData?: {
        gameId?: number;
        queue?: {
            id?: number;
            description?: string;
        };
    };
};

export async function getGameflowSession(): Promise<LolGameflowSession | null> {
    return (await invoke("get_gameflow_session")) as LolGameflowSession | null;
}
