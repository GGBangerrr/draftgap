import { For, Show, createMemo, createSignal } from "solid-js";
import { Icon } from "solid-heroicons";
import {
    arrowUturnLeft,
    lockClosed,
    lockOpen,
} from "solid-heroicons/solid-mini";
import { Role } from "@draftgap/core/src/models/Role";
import {
    PoolGoal,
    compareSwap,
    createPoolModel,
    getPoolContributions,
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
import { championName } from "../../../utils/i18n";
import { formatPercentage, getRatingClass } from "../../../utils/rating";
import { cn } from "../../../utils/style";
import { tooltip } from "../../../directives/tooltip";
// eslint-disable-next-line
tooltip;

const MAX_RESULTS = 10;
// Below this share of the role's games a champion's numbers rest on thin data.
const LOW_PICK_RATE = 0.01;

const winrate = (rating: number) =>
    `${formatPercentage(ratingToWinrate(rating), 1)}%`;

// Winrate points with two decimals, without a sign.
const points = (rating: number) =>
    formatPercentage(Math.abs(ratingToWinrate(rating) - 0.5), 2);

const GOAL_OPTIONS = [
    { value: "both" as const, label: "Both" },
    { value: "counterpick" as const, label: "Counterpick" },
    { value: "blind" as const, label: "Blind" },
];

const smallButton =
    "px-2 py-0.5 rounded-md uppercase text-base border border-neutral-700 text-neutral-300 hover:bg-neutral-800";

export function PoolRecommender(props: { role: Role; pool: string[] }) {
    const {
        config,
        setFavourite,
        isCore,
        setCore,
        primePool,
        swapFor,
        substitute,
        swapBack,
        savePrime,
        resetToPrime,
    } = useUser();
    const { dataset, dataset30Days } = useDataset();

    const prime = () => primePool(props.role);

    // Prime champions are candidates too, even when rare, so swaps can be compared against them.
    const model = createMemo(() =>
        createPoolModel(
            dataset()!,
            dataset30Days()!,
            props.role,
            [...new Set([...props.pool, ...prime()])],
            priorGamesByRiskLevel[config.riskLevel],
            deviationsByBlindPickCaution[config.blindPickCaution],
        ),
    );

    const [goal, setGoal] = createSignal<PoolGoal>("both");
    const [removed, setRemoved] = createSignal<string>();
    const [confirmSavePrime, setConfirmSavePrime] = createSignal(false);

    const locked = (championKey: string) => isCore(championKey, props.role);
    const replacedPrime = (championKey: string) =>
        swapFor(championKey, props.role);
    const name = (championKey: string) => {
        const champion = dataset()?.championData[championKey];
        return champion ? championName(champion, config) : championKey;
    };

    // Ignore a selection that is no longer a replaceable pool champion, e.g. after switching role or locking it.
    const removedInPool = () => {
        const key = removed();
        return key && props.pool.includes(key) && !locked(key)
            ? key
            : undefined;
    };

    const contributions = createMemo(
        () =>
            new Map(
                getPoolContributions(model(), props.pool, goal()).map((c) => [
                    c.championKey,
                    c.contribution,
                ]),
            ),
    );

    // Substitutes whose prime champion is ahead again, i.e. worth swapping back.
    const swapBacks = createMemo(() =>
        props.pool.flatMap((substituteKey) => {
            const primeKey = replacedPrime(substituteKey);
            if (!primeKey || !model().candidates.has(primeKey)) return [];

            const lead = compareSwap(
                model(),
                props.pool,
                substituteKey,
                primeKey,
                goal(),
            );
            // Equal counts too: the prime pick is the long-term choice, so a tie goes back to it.
            return points(lead) === "0.00" || lead < 0
                ? [{ substituteKey, primeKey, lead }]
                : [];
        }),
    );

    const benchedFor = (primeKey: string) =>
        props.pool.find((key) => replacedPrime(key) === primeKey);
    const differsFromPrime = () =>
        prime().length > 0 &&
        (prime().some((key) => !props.pool.includes(key)) ||
            props.pool.some((key) => !prime().includes(key)));

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
        if (out) {
            substitute(out, championKey, props.role);
        } else {
            setFavourite(championKey, props.role, true);
        }
        setRemoved(undefined);
    }

    function onSavePrime() {
        if (prime().length && !confirmSavePrime()) {
            setConfirmSavePrime(true);
            return;
        }
        savePrime(props.role);
        setConfirmSavePrime(false);
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

            <div class="flex flex-wrap items-center gap-2 mb-3">
                <span
                    class="text-lg uppercase text-neutral-400 w-20"
                    title="Your long-term pool. Patch swaps remember which prime champion they replaced."
                >
                    Prime
                </span>
                <Show
                    when={prime().length}
                    fallback={
                        <span class="text-neutral-400">
                            No prime pool for this role yet.
                        </span>
                    }
                >
                    <For each={prime()}>
                        {(primeKey) => (
                            <div
                                class="flex items-center gap-1"
                                classList={{
                                    "opacity-40":
                                        !props.pool.includes(primeKey),
                                }}
                                title={
                                    benchedFor(primeKey)
                                        ? `Benched for ${name(benchedFor(primeKey)!)} this patch`
                                        : props.pool.includes(primeKey)
                                          ? name(primeKey)
                                          : `${name(primeKey)} is not in your current pool`
                                }
                            >
                                <ChampionIcon
                                    championKey={primeKey}
                                    size={28}
                                />
                            </div>
                        )}
                    </For>
                </Show>
                <div class="flex gap-2 ml-2">
                    <Show when={differsFromPrime()}>
                        <button
                            class={smallButton}
                            onClick={() => resetToPrime(props.role)}
                            title="Put the prime pool back, undoing every patch swap"
                        >
                            Reset to prime
                        </button>
                    </Show>
                    <button
                        class={cn(smallButton, {
                            "border-yellow-500 text-yellow-500":
                                confirmSavePrime(),
                        })}
                        onClick={onSavePrime}
                        onMouseLeave={() => setConfirmSavePrime(false)}
                        title="Make your current pool the new long-term prime pool"
                    >
                        {confirmSavePrime()
                            ? "Click again to overwrite prime"
                            : "Save current pool as prime"}
                    </button>
                </div>
            </div>

            <For each={swapBacks()}>
                {(swap) => (
                    <div class="flex flex-wrap items-center gap-2 mb-3 rounded-md border border-yellow-600 bg-yellow-950/40 px-3 py-2">
                        <ChampionIcon championKey={swap.primeKey} size={24} />
                        <span class="text-yellow-400">
                            <Show
                                when={points(swap.lead) !== "0.00"}
                                fallback={
                                    <>
                                        {name(swap.primeKey)} is as good as{" "}
                                        {name(swap.substituteKey)} again.
                                    </>
                                }
                            >
                                {name(swap.primeKey)} is ahead of{" "}
                                {name(swap.substituteKey)} again (by{" "}
                                {points(swap.lead)} points).
                            </Show>
                        </span>
                        <button
                            class={smallButton}
                            onClick={() =>
                                swapBack(swap.substituteKey, props.role)
                            }
                        >
                            Swap back
                        </button>
                    </div>
                )}
            </For>

            <div class="flex flex-wrap items-start gap-2 mb-2">
                <span class="text-lg uppercase text-neutral-400 w-20 mt-1">
                    Replace
                </span>
                <button
                    class={cn(
                        "px-3 py-1 rounded-md uppercase border border-neutral-700 text-neutral-400 hover:bg-neutral-800 whitespace-nowrap",
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
                        <div class="flex flex-col items-center gap-0.5 w-16 overflow-hidden">
                            <button
                                class={cn(
                                    "rounded-md border-2 border-transparent opacity-60 hover:opacity-100",
                                    {
                                        "border-red-500 opacity-100":
                                            removedInPool() === championKey,
                                        "opacity-100 cursor-default":
                                            locked(championKey),
                                    },
                                )}
                                title={
                                    locked(championKey)
                                        ? `${name(championKey)} is locked: unlock it to replace it`
                                        : `Find a replacement for ${name(championKey)}`
                                }
                                onClick={() => {
                                    if (locked(championKey)) return;
                                    setRemoved(
                                        removedInPool() === championKey
                                            ? undefined
                                            : championKey,
                                    );
                                }}
                            >
                                <ChampionIcon
                                    championKey={championKey}
                                    size={36}
                                />
                            </button>
                            <div class="flex items-center gap-1 h-4">
                                <button
                                    class={cn(
                                        "text-neutral-500 hover:text-neutral-300",
                                        { "text-white": locked(championKey) },
                                    )}
                                    title={
                                        locked(championKey)
                                            ? "Locked: never suggested for replacement. Click to unlock."
                                            : "Click to lock: never suggest replacing it, even when weak."
                                    }
                                    onClick={() =>
                                        setCore(
                                            championKey,
                                            props.role,
                                            !locked(championKey),
                                        )
                                    }
                                >
                                    <Icon
                                        path={
                                            locked(championKey)
                                                ? lockClosed
                                                : lockOpen
                                        }
                                        class="w-3.5"
                                    />
                                </button>
                                <Show when={replacedPrime(championKey)}>
                                    {(primeKey) => (
                                        <button
                                            class="flex items-center text-neutral-500 hover:text-neutral-300"
                                            title={`Stands in for ${name(primeKey())} this patch. Click to swap back.`}
                                            onClick={() =>
                                                swapBack(
                                                    championKey,
                                                    props.role,
                                                )
                                            }
                                        >
                                            <Icon
                                                path={arrowUturnLeft}
                                                class="w-3.5"
                                            />
                                            <ChampionIcon
                                                championKey={primeKey()}
                                                size={14}
                                            />
                                        </button>
                                    )}
                                </Show>
                            </div>
                            <Show when={contributions().has(championKey)}>
                                <span
                                    class={cn(
                                        "text-xs whitespace-nowrap tabular-nums",
                                        getRatingClass(
                                            -contributions().get(championKey)!,
                                        ),
                                    )}
                                    title={`Your pool's score drops by ${points(contributions().get(championKey)!)} winrate points without ${name(championKey)}`}
                                >
                                    −{points(contributions().get(championKey)!)}
                                </span>
                            </Show>
                        </div>
                    )}
                </For>
            </div>
            <p class="text-sm text-neutral-400 mb-4">
                The number under each champion is what your pool loses without
                it. Lock champions you never want replaced; swaps of prime
                champions are remembered, and you get a reminder when the prime
                champion is ahead again.
            </p>

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
                                        <div class="flex items-center gap-2">
                                            <ChampionCell
                                                championKey={row.championKey}
                                            />
                                            <Show
                                                when={prime().includes(
                                                    row.championKey,
                                                )}
                                            >
                                                <span class="text-sm text-neutral-400 uppercase">
                                                    prime
                                                </span>
                                            </Show>
                                        </div>
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
                                            class={smallButton}
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
