import { For, Show, createMemo, createSignal } from "solid-js";
import { Role } from "@draftgap/core/src/models/Role";
import {
    PoolCandidate,
    PoolGoal,
    PoolScore,
    buildPool,
    createPoolModel,
    rankReplacements,
    scorePool,
} from "@draftgap/core/src/pool/pool-recommender";
import { ratingToWinrate } from "@draftgap/core/src/rating/ratings";
import { priorGamesByRiskLevel } from "@draftgap/core/src/risk/risk-level";
import { deviationsByBlindPickCaution } from "@draftgap/core/src/risk/blind-pick-caution";
import { useUser } from "../../../contexts/UserContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { ButtonGroup } from "../../common/ButtonGroup";
import { DeltaText } from "../../common/DeltaText";
import { Panel, PanelHeader } from "../../common/Panel";
import ChampionCell from "../../common/ChampionCell";
import { ChampionIcon } from "../../icons/ChampionIcon";
import { formatPercentage } from "../../../utils/rating";
import { cn } from "../../../utils/style";
import { tooltip } from "../../../directives/tooltip";
// eslint-disable-next-line
tooltip;

const MAX_RESULTS = 10;
// Below this share of the role's games a champion's numbers rest on thin data.
const LOW_PICK_RATE = 0.01;
const POOL_SIZES = [2, 3, 4, 5, 6, 7, 8];

type Mode = "replace" | "build";

const winrate = (rating: number) =>
    `${formatPercentage(ratingToWinrate(rating), 1)}%`;

const GOAL_OPTIONS = [
    { value: "both" as const, label: "Both" },
    { value: "counterpick" as const, label: "Counterpick" },
    { value: "blind" as const, label: "Blind" },
];

export function PoolRecommender(props: { role: Role; pool: string[] }) {
    const { config, setFavourite } = useUser();
    const { dataset, dataset30Days } = useDataset();

    const model = createMemo(() =>
        createPoolModel(
            dataset()!,
            dataset30Days()!,
            props.role,
            props.pool,
            priorGamesByRiskLevel[config.riskLevel],
            deviationsByBlindPickCaution[config.blindPickCaution],
        ),
    );

    const [mode, setMode] = createSignal<Mode>("replace");
    const [goal, setGoal] = createSignal<PoolGoal>("both");
    const [removed, setRemoved] = createSignal<string>();
    const [kept, setKept] = createSignal<Set<string>>(new Set());
    const [size, setSize] = createSignal(4);

    // Ignore selections that no longer belong to the pool, e.g. after switching role.
    const removedInPool = () =>
        props.pool.includes(removed() ?? "") ? removed() : undefined;
    const keptInPool = () => props.pool.filter((key) => kept().has(key));

    const currentScore = () => scorePool(model(), props.pool, goal());
    const replacements = () =>
        rankReplacements(model(), props.pool, removedInPool(), goal()).slice(
            0,
            MAX_RESULTS,
        );
    const buildSteps = () => buildPool(model(), keptInPool(), size(), goal());

    const candidate = (key: string) => model().candidates.get(key);

    function toggleKept(championKey: string) {
        const next = new Set(kept());
        if (next.has(championKey)) next.delete(championKey);
        else next.add(championKey);
        setKept(next);
    }

    function swapIn(championKey: string) {
        const out = removedInPool();
        if (out) setFavourite(out, props.role, false);
        setFavourite(championKey, props.role, true);
        setRemoved(undefined);
    }

    return (
        <Panel>
            <PanelHeader>Recommender</PanelHeader>
            <div class="flex flex-wrap items-center gap-4 mb-4">
                <ButtonGroup
                    options={[
                        { value: "replace" as const, label: "Replace" },
                        { value: "build" as const, label: "Build" },
                    ]}
                    selected={mode()}
                    onChange={setMode}
                    size="sm"
                />
                <div
                    // @ts-ignore
                    use:tooltip={{
                        content:
                            "Counterpick: your best pool pick in simulated drafts where you see everyone (champion strength + all matchups + synergy). Blind: your best blind pick, as in the Blind column. Both: the average of the two.",
                    }}
                >
                    <ButtonGroup
                        options={GOAL_OPTIONS}
                        selected={goal()}
                        onChange={setGoal}
                        size="sm"
                    />
                </div>
                <span class="text-sm text-neutral-400 uppercase">
                    Current pool: counterpick{" "}
                    {winrate(currentScore().counterpickRating)} · blind{" "}
                    {winrate(currentScore().blindRating)}
                </span>
            </div>

            <Show when={mode() === "replace"}>
                <div class="flex flex-wrap items-center gap-2 mb-4">
                    <span class="text-lg uppercase text-neutral-400 mr-2">
                        Replace
                    </span>
                    <button
                        class={cn(
                            "px-3 py-1 rounded-md uppercase border border-neutral-700 text-neutral-400 hover:bg-neutral-800",
                            {
                                "bg-white text-primary border-white hover:bg-neutral-200":
                                    removedInPool() === undefined,
                            },
                        )}
                        onClick={() => setRemoved(undefined)}
                    >
                        Nobody (add one)
                    </button>
                    <For each={props.pool}>
                        {(championKey) => (
                            <button
                                class={cn(
                                    "rounded-md border-2 border-transparent opacity-60 hover:opacity-100",
                                    {
                                        "border-red-500 opacity-100":
                                            removedInPool() === championKey,
                                    },
                                )}
                                onClick={() =>
                                    setRemoved(
                                        removedInPool() === championKey
                                            ? undefined
                                            : championKey,
                                    )
                                }
                            >
                                <ChampionIcon
                                    championKey={championKey}
                                    size={36}
                                />
                            </button>
                        )}
                    </For>
                </div>
                <RecommendationTable
                    rows={replacements().map((r) => ({
                        championKey: r.championKey,
                        score: r.score,
                        change: r.change,
                        candidate: candidate(r.championKey),
                    }))}
                    actionLabel={removedInPool() ? "Swap in" : "Add"}
                    onAction={swapIn}
                />
            </Show>

            <Show when={mode() === "build"}>
                <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="text-lg uppercase text-neutral-400 mr-2">
                        Keep
                    </span>
                    <For each={props.pool}>
                        {(championKey) => (
                            <button
                                class={cn(
                                    "rounded-md border-2 border-transparent opacity-40 hover:opacity-80",
                                    {
                                        "border-white opacity-100 hover:opacity-100":
                                            kept().has(championKey),
                                    },
                                )}
                                onClick={() => toggleKept(championKey)}
                            >
                                <ChampionIcon
                                    championKey={championKey}
                                    size={36}
                                />
                            </button>
                        )}
                    </For>
                </div>
                <div class="flex flex-wrap items-center gap-2 mb-4">
                    <span class="text-lg uppercase text-neutral-400 mr-2">
                        Pool size
                    </span>
                    <ButtonGroup
                        options={POOL_SIZES.map((s) => ({
                            value: s,
                            label: String(s),
                        }))}
                        selected={size()}
                        onChange={setSize}
                        size="sm"
                    />
                </div>
                <p class="text-neutral-400 mb-3">
                    Starts from the champions you keep, then adds whichever
                    champion improves the pool most, one at a time. The scores
                    are for the pool up to and including that row.
                </p>
                <RecommendationTable
                    rows={buildSteps().map((s, i, steps) => ({
                        championKey: s.championKey,
                        score: s.score,
                        change:
                            i === 0
                                ? undefined
                                : s.score.totalRating -
                                  steps[i - 1].score.totalRating,
                        candidate: candidate(s.championKey),
                        kept: s.kept,
                        inPool: props.pool.includes(s.championKey),
                    }))}
                    actionLabel="Add"
                    onAction={(key) => setFavourite(key, props.role, true)}
                />
            </Show>
        </Panel>
    );
}

function RecommendationTable(props: {
    rows: {
        championKey: string;
        score: PoolScore;
        change: number | undefined;
        candidate: PoolCandidate | undefined;
        kept?: boolean;
        inPool?: boolean;
    }[];
    actionLabel: string;
    onAction: (championKey: string) => void;
}) {
    return (
        <div class="overflow-x-auto">
            <table class="w-full text-lg">
                <thead class="text-neutral-400 uppercase text-left">
                    <tr>
                        <th class="font-normal pb-2">Champion</th>
                        <th
                            class="font-normal pb-2 text-right"
                            // @ts-ignore
                            use:tooltip={{
                                content:
                                    "The champion's own current-patch winrate in this role.",
                            }}
                        >
                            Winrate
                        </th>
                        <th class="font-normal pb-2 text-right">
                            Pool counterpick
                        </th>
                        <th class="font-normal pb-2 text-right">Pool blind</th>
                        <th
                            class="font-normal pb-2 text-right"
                            // @ts-ignore
                            use:tooltip={{
                                content:
                                    "How much the pool's score (for the chosen goal) changes, in winrate points.",
                            }}
                        >
                            Change
                        </th>
                        <th class="pb-2" />
                    </tr>
                </thead>
                <tbody class="divide-y divide-neutral-800">
                    <For each={props.rows}>
                        {(row) => (
                            <tr
                                classList={{
                                    "opacity-50":
                                        (row.candidate?.pickRate ?? 0) <
                                        LOW_PICK_RATE,
                                }}
                                title={
                                    (row.candidate?.pickRate ?? 0) <
                                    LOW_PICK_RATE
                                        ? `Only ${formatPercentage(row.candidate?.pickRate ?? 0, 1)}% of this role's games, so these numbers rest on thin data`
                                        : undefined
                                }
                            >
                                <td class="py-2">
                                    <div class="flex items-center gap-2">
                                        <ChampionCell
                                            championKey={row.championKey}
                                        />
                                        <Show when={row.kept}>
                                            <span class="text-sm text-neutral-400 uppercase">
                                                kept
                                            </span>
                                        </Show>
                                    </div>
                                </td>
                                <td class="py-2 text-right tabular-nums">
                                    {row.candidate
                                        ? winrate(row.candidate.baseRating)
                                        : "-"}
                                </td>
                                <td class="py-2 text-right tabular-nums">
                                    {winrate(row.score.counterpickRating)}
                                </td>
                                <td class="py-2 text-right tabular-nums">
                                    {winrate(row.score.blindRating)}
                                </td>
                                <td class="py-2 text-right">
                                    <Show
                                        when={row.change !== undefined}
                                        fallback="-"
                                    >
                                        <DeltaText rating={row.change!} />
                                    </Show>
                                </td>
                                <td class="py-2 text-right">
                                    <Show when={!row.kept && !row.inPool}>
                                        <button
                                            class="px-2 py-0.5 rounded-md uppercase text-base border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                                            onClick={() =>
                                                props.onAction(row.championKey)
                                            }
                                        >
                                            {props.actionLabel}
                                        </button>
                                    </Show>
                                </td>
                            </tr>
                        )}
                    </For>
                </tbody>
            </table>
        </div>
    );
}
