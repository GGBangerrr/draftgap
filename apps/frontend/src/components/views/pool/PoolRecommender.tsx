import { For, Show, createMemo, createSignal } from "solid-js";
import { Role } from "@draftgap/core/src/models/Role";
import {
    PoolGoal,
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

    const [goal, setGoal] = createSignal<PoolGoal>("both");
    const [removed, setRemoved] = createSignal<string>();

    // Ignore a selection that no longer belongs to the pool, e.g. after switching role.
    const removedInPool = () =>
        props.pool.includes(removed() ?? "") ? removed() : undefined;

    const currentScore = () => scorePool(model(), props.pool, goal());
    const replacements = () =>
        rankReplacements(model(), props.pool, removedInPool(), goal()).slice(
            0,
            MAX_RESULTS,
        );

    const isThin = (championKey: string) =>
        (model().candidates.get(championKey)?.pickRate ?? 0) < LOW_PICK_RATE;

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
                            <ChampionIcon championKey={championKey} size={36} />
                        </button>
                    )}
                </For>
            </div>

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
                            <th class="font-normal pb-2 text-right">
                                Pool blind
                            </th>
                            <th
                                class="font-normal pb-2 text-right"
                                // @ts-ignore
                                use:tooltip={{
                                    content:
                                        "How much the pool's score (for the chosen goal) changes compared to your current pool, in winrate points.",
                                }}
                            >
                                Change
                            </th>
                            <th class="pb-2" />
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-neutral-800">
                        <For each={replacements()}>
                            {(row) => (
                                <tr
                                    classList={{
                                        "opacity-50": isThin(row.championKey),
                                    }}
                                    title={
                                        isThin(row.championKey)
                                            ? `Only ${formatPercentage(model().candidates.get(row.championKey)?.pickRate ?? 0, 1)}% of this role's games, so these numbers rest on thin data`
                                            : undefined
                                    }
                                >
                                    <td class="py-2">
                                        <ChampionCell
                                            championKey={row.championKey}
                                        />
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        <Show
                                            when={model().candidates.get(
                                                row.championKey,
                                            )}
                                            fallback="-"
                                        >
                                            {(candidate) =>
                                                winrate(candidate().baseRating)
                                            }
                                        </Show>
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        {winrate(row.score.counterpickRating)}
                                    </td>
                                    <td class="py-2 text-right tabular-nums">
                                        {winrate(row.score.blindRating)}
                                    </td>
                                    <td class="py-2 text-right">
                                        <DeltaText rating={row.change} />
                                    </td>
                                    <td class="py-2 text-right">
                                        <button
                                            class="px-2 py-0.5 rounded-md uppercase text-base border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                                            onClick={() =>
                                                swapIn(row.championKey)
                                            }
                                        >
                                            {removedInPool()
                                                ? "Swap in"
                                                : "Add"}
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </For>
                    </tbody>
                </table>
            </div>
        </Panel>
    );
}
