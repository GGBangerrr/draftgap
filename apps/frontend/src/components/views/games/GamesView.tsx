import { For, Show, createMemo, createSignal } from "solid-js";
import {
    RANKED_QUEUE_IDS,
    getAccuracyStats,
} from "@draftgap/core/src/history/accuracy";
import { GameResult } from "@draftgap/core/src/history/game-record";
import { useGameHistory } from "../../../contexts/GameHistoryContext";
import { useMedia } from "../../../hooks/useMedia";
import { ButtonGroup } from "../../common/ButtonGroup";
import { DeltaText } from "../../common/DeltaText";
import { Panel, PanelHeader } from "../../common/Panel";
import { SummaryStat } from "../../common/SummaryStat";
import { ChampionIcon } from "../../icons/ChampionIcon";
import { RoleIcon } from "../../icons/roles/RoleIcon";
import { formatPercentage } from "../../../utils/rating";
import { cn } from "../../../utils/style";

type QueueFilter = "ranked" | "all";

const RESULT_OPTIONS: { value: GameResult; label: string }[] = [
    { value: "win", label: "Win" },
    { value: "loss", label: "Loss" },
    { value: "remake", label: "Remake" },
];

const percent = (value: number) => `${formatPercentage(value, 1)}%`;

export default function GamesView() {
    const { records, setResult, loadError } = useGameHistory();
    const { isDesktop } = useMedia();
    const [queueFilter, setQueueFilter] = createSignal<QueueFilter>("ranked");

    const filteredRecords = () =>
        queueFilter() === "all"
            ? records()
            : records().filter(
                  (r) =>
                      r.queueId !== undefined &&
                      RANKED_QUEUE_IDS.includes(r.queueId),
              );

    const stats = createMemo(() => getAccuracyStats(filteredRecords()));
    const unmarked = () => filteredRecords().filter((r) => !r.result).length;

    return (
        <div class="flex flex-col gap-6">
            <Show when={loadError()}>
                <Panel class="text-lg text-red-400">
                    Could not load your game history, so recording is paused to
                    avoid overwriting it: {loadError()}
                </Panel>
            </Show>
            <Show when={!isDesktop}>
                <Panel class="text-lg text-neutral-400">
                    Games are recorded automatically in the desktop app, when
                    champ select ends and the game starts.
                </Panel>
            </Show>

            <div class="flex flex-wrap items-center gap-4">
                <ButtonGroup
                    options={[
                        { value: "ranked" as const, label: "Ranked" },
                        { value: "all" as const, label: "All queues" },
                    ]}
                    selected={queueFilter()}
                    onChange={setQueueFilter}
                    size="sm"
                />
                <span class="text-sm text-neutral-400 uppercase">
                    Predictions are your team's draft winrate when the game
                    started. Remakes and unmarked games are not counted.
                </span>
            </div>

            <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <SummaryStat
                    title="Games marked"
                    value={stats().games}
                    detail={`${stats().wins} won, ${unmarked()} unmarked`}
                    tooltip="Games with a win or loss marked."
                />
                <SummaryStat
                    title="Favourite won"
                    value={
                        stats().favouriteGames
                            ? percent(stats().favouriteAccuracy)
                            : "-"
                    }
                    detail={
                        stats().favouriteGames
                            ? `±${formatPercentage(stats().favouriteMargin, 1)} · coin flip = 50%`
                            : "no games yet"
                    }
                    tooltip="How often the team the app predicted to win actually won. The ± is the 95% margin of error: anything within it of 50% isn't proof the app beats a coin flip yet. Draft-only predictions rarely get far above 55%."
                />
                <SummaryStat
                    title="Brier score"
                    value={stats().games ? stats().brierScore.toFixed(3) : "-"}
                    detail="coin flip = 0.250 · lower is better"
                    tooltip="Average squared gap between the predicted winrate and the result (1 for a win, 0 for a loss). Always predicting 50% scores 0.250, so below that means the predictions carry real information."
                />
                <SummaryStat
                    title="Predicted vs actual"
                    value={
                        stats().games
                            ? `${percent(stats().meanPredicted)} / ${percent(stats().wins / stats().games)}`
                            : "-"
                    }
                    detail="average predicted / your winrate"
                    tooltip="If the predictions are well calibrated, your actual winrate ends up close to the average prediction."
                />
            </div>

            <Panel>
                <PanelHeader>Calibration</PanelHeader>
                <p class="text-neutral-400 mb-3">
                    Games grouped by predicted winrate. For good predictions,
                    each group's actual winrate is close to its predicted
                    winrate. Groups need a few dozen games before the comparison
                    means much.
                </p>
                <table class="w-full text-lg">
                    <thead class="text-neutral-400 uppercase text-left">
                        <tr>
                            <th class="font-normal pb-2">Predicted</th>
                            <th class="font-normal pb-2 text-right">Games</th>
                            <th class="font-normal pb-2 text-right">
                                Avg predicted
                            </th>
                            <th class="font-normal pb-2 text-right">Actual</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-800">
                        <For each={stats().buckets}>
                            {(bucket) => (
                                <tr
                                    classList={{
                                        "text-neutral-600": bucket.games === 0,
                                    }}
                                >
                                    <td class="py-2">
                                        {bucket.from === 0
                                            ? `under ${formatPercentage(bucket.to, 0)}%`
                                            : bucket.to === 1
                                              ? `${formatPercentage(bucket.from, 0)}% and up`
                                              : `${formatPercentage(bucket.from, 0)}-${formatPercentage(bucket.to, 0)}%`}
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        {bucket.games}
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        {bucket.games
                                            ? percent(bucket.meanPredicted)
                                            : "-"}
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        {bucket.games
                                            ? percent(bucket.actualWinrate)
                                            : "-"}
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </Panel>

            <Panel>
                <PanelHeader>Games</PanelHeader>
                <Show
                    when={filteredRecords().length}
                    fallback={
                        <div class="text-lg text-neutral-400">
                            No games recorded yet. They appear here once a game
                            starts after champ select.
                        </div>
                    }
                >
                    <div class="overflow-x-auto">
                        <table class="w-full text-lg">
                            <thead class="text-neutral-400 uppercase text-left">
                                <tr>
                                    <th class="font-normal pb-2">Date</th>
                                    <th class="font-normal pb-2">Queue</th>
                                    <th class="font-normal pb-2">You</th>
                                    <th class="font-normal pb-2 text-right">
                                        Predicted
                                    </th>
                                    <th class="font-normal pb-2 text-right">
                                        Lane
                                    </th>
                                    <th class="font-normal pb-2 text-right">
                                        Result
                                    </th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-neutral-800">
                                <For each={filteredRecords()}>
                                    {(record) => (
                                        <tr>
                                            <td class="py-2 whitespace-nowrap tabular-nums">
                                                {new Date(
                                                    record.date,
                                                ).toLocaleString(undefined, {
                                                    dateStyle: "short",
                                                    timeStyle: "short",
                                                })}
                                            </td>
                                            <td class="py-2 text-neutral-400">
                                                {record.queueName ?? "-"}
                                            </td>
                                            <td class="py-2">
                                                <Show
                                                    when={record.yourPick}
                                                    fallback="-"
                                                >
                                                    <div class="flex items-center gap-2">
                                                        <RoleIcon
                                                            role={
                                                                record.yourPick!
                                                                    .role
                                                            }
                                                            class="h-6"
                                                        />
                                                        <ChampionIcon
                                                            championKey={
                                                                record.yourPick!
                                                                    .championKey
                                                            }
                                                            size={32}
                                                        />
                                                    </div>
                                                </Show>
                                            </td>
                                            <td class="py-2 text-right tabular-nums">
                                                {percent(
                                                    record.predictedWinrate,
                                                )}
                                            </td>
                                            <td class="py-2 text-right">
                                                <Show
                                                    when={
                                                        record.laneRating !==
                                                        undefined
                                                    }
                                                    fallback="-"
                                                >
                                                    <DeltaText
                                                        rating={
                                                            record.laneRating!
                                                        }
                                                    />
                                                </Show>
                                            </td>
                                            <td class="py-2">
                                                <div class="flex justify-end gap-1">
                                                    <For each={RESULT_OPTIONS}>
                                                        {(option) => (
                                                            <button
                                                                class={cn(
                                                                    "px-2 py-0.5 rounded-md uppercase text-base border border-neutral-700 text-neutral-500 hover:bg-neutral-800",
                                                                    {
                                                                        "bg-white text-primary border-white hover:bg-neutral-200":
                                                                            record.result ===
                                                                            option.value,
                                                                    },
                                                                )}
                                                                onClick={() =>
                                                                    setResult(
                                                                        record.id,
                                                                        record.result ===
                                                                            option.value
                                                                            ? undefined
                                                                            : option.value,
                                                                    )
                                                                }
                                                            >
                                                                {option.label}
                                                            </button>
                                                        )}
                                                    </For>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </For>
                            </tbody>
                        </table>
                    </div>
                </Show>
            </Panel>
        </div>
    );
}
