import {
    JSXElement,
    createContext,
    createEffect,
    createSignal,
    on,
    onCleanup,
    onMount,
    useContext,
} from "solid-js";
import { GameRecord, GameResult } from "@draftgap/core/src/history/game-record";
import { getLaneRating } from "@draftgap/core/src/draft/suggestions";
import { getGameflowSession } from "../api/lcu-api";
import { loadGameHistory, saveGameHistory } from "../api/game-history-api";
import { useMedia } from "../hooks/useMedia";
import { ClientState, useLolClient } from "./LolClientContext";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDraft } from "./DraftContext";
import { useDataset } from "./DatasetContext";

type DraftSnapshot = Omit<
    GameRecord,
    "id" | "date" | "queueId" | "queueName" | "result"
>;

const POLL_INTERVAL_MS = 2000;
// Give up on a snapshot if the game hasn't started this long after champ select ended.
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

const GAME_STARTED_PHASES = new Set(["GameStart", "InProgress", "Reconnect"]);
const GAME_ENDED_PHASES = new Set([
    "PreEndOfGame",
    "WaitingForStats",
    "EndOfGame",
]);
// Champ select ended without a game, i.e. someone dodged.
const NO_GAME_PHASES = new Set(["None", "Lobby", "Matchmaking", "ReadyCheck"]);

function createGameHistoryContext() {
    const { isDesktop } = useMedia();
    const { clientState, champSelectSession } = useLolClient();
    const { allyTeamComp, opponentTeamComp, allyDraftAnalysis } =
        useDraftAnalysis();
    const { bans } = useDraft();
    const { dataset } = useDataset();

    const [records, setRecords] = createSignal<GameRecord[]>([]);
    // Saving is only allowed after a successful load, so a failed read can never overwrite the history.
    const [isLoaded, setIsLoaded] = createSignal(false);
    const [loadError, setLoadError] = createSignal<string>();
    const [promptRecordId, setPromptRecordId] = createSignal<string>();

    onMount(async () => {
        try {
            setRecords(await loadGameHistory(isDesktop));
            setIsLoaded(true);
        } catch (e) {
            console.error("Could not load game history", e);
            setLoadError(String(e));
        }
    });

    function updateRecords(next: GameRecord[]) {
        setRecords(next);
        if (!isLoaded()) return;
        saveGameHistory(isDesktop, next).catch((e) =>
            console.error("Could not save game history", e),
        );
    }

    function setResult(id: string, result: GameResult | undefined) {
        updateRecords(
            records().map((r) => (r.id === id ? { ...r, result } : r)),
        );
        if (promptRecordId() === id) setPromptRecordId(undefined);
    }

    // Keep the latest draft while in champ select; the client clears bans as soon as it ends.
    let lastSnapshot: DraftSnapshot | undefined;
    createEffect(() => {
        if (clientState() !== ClientState.InChampSelect) return;
        const analysis = allyDraftAnalysis();
        if (!analysis) return;

        const allyTeam = [...allyTeamComp()].map(([role, championKey]) => ({
            championKey,
            role,
        }));
        const localPlayer = champSelectSession.myTeam.find(
            (p) => p.cellId === champSelectSession.localPlayerCellId,
        );
        const yourPick = allyTeam.find(
            (p) => p.championKey === String(localPlayer?.championId),
        );

        lastSnapshot = {
            patch: dataset()?.version ?? "",
            allyTeam,
            opponentTeam: [...opponentTeamComp()].map(
                ([role, championKey]) => ({ championKey, role }),
            ),
            bans: [...bans],
            yourPick,
            predictedWinrate: analysis.winrate,
            laneRating: yourPick
                ? getLaneRating(analysis, yourPick.role, yourPick.championKey)
                : undefined,
        };
    });

    let pending: { snapshot: DraftSnapshot; since: number } | undefined;
    createEffect(
        on(clientState, (state, previous) => {
            if (
                previous === ClientState.InChampSelect &&
                state !== ClientState.InChampSelect &&
                lastSnapshot
            ) {
                pending = { snapshot: lastSnapshot, since: Date.now() };
            }
            if (state === ClientState.InChampSelect) lastSnapshot = undefined;
        }),
    );

    let promptedRecordId: string | undefined;
    async function pollGameflow() {
        if (
            clientState() !== ClientState.MainMenu &&
            clientState() !== ClientState.InChampSelect
        )
            return;

        const latest = records()[0];
        const awaitingResult =
            latest && !latest.result && promptedRecordId !== latest.id;
        if (!pending && !awaitingResult) return;

        const session = await getGameflowSession().catch(() => null);
        const phase = session?.phase ?? "None";

        if (pending) {
            if (GAME_STARTED_PHASES.has(phase)) {
                const id = String(session?.gameData?.gameId ?? Date.now());
                if (!records().some((r) => r.id === id)) {
                    updateRecords([
                        {
                            ...pending.snapshot,
                            id,
                            date: new Date().toISOString(),
                            queueId: session?.gameData?.queue?.id,
                            queueName: session?.gameData?.queue?.description,
                            result: undefined,
                        },
                        ...records(),
                    ]);
                }
                pending = undefined;
            } else if (
                NO_GAME_PHASES.has(phase) ||
                Date.now() - pending.since > PENDING_TIMEOUT_MS
            ) {
                pending = undefined;
            }
        }

        const unmarked = records()[0];
        if (
            GAME_ENDED_PHASES.has(phase) &&
            unmarked &&
            !unmarked.result &&
            promptedRecordId !== unmarked.id
        ) {
            promptedRecordId = unmarked.id;
            setPromptRecordId(unmarked.id);
        }
    }

    onMount(() => {
        if (!isDesktop) return;
        const interval = setInterval(pollGameflow, POLL_INTERVAL_MS);
        onCleanup(() => clearInterval(interval));
    });

    const promptRecord = () => records().find((r) => r.id === promptRecordId());

    return {
        records,
        loadError,
        setResult,
        promptRecord,
        dismissPrompt: () => setPromptRecordId(undefined),
    };
}

const GameHistoryContext =
    createContext<ReturnType<typeof createGameHistoryContext>>();

export function GameHistoryProvider(props: { children: JSXElement }) {
    const ctx = createGameHistoryContext();

    return (
        <GameHistoryContext.Provider value={ctx}>
            {props.children}
        </GameHistoryContext.Provider>
    );
}

export function useGameHistory() {
    const useCtx = useContext(GameHistoryContext);
    if (!useCtx) throw new Error("No GameHistoryContext found");

    return useCtx;
}
