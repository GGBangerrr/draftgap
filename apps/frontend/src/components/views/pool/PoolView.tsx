import { For, Show, createMemo, createSignal } from "solid-js";
import { Role, ROLES, displayNameByRole } from "@draftgap/core/src/models/Role";
import { PoolColumn, analyzePool } from "@draftgap/core/src/pool/pool-analysis";
import { priorGamesByRiskLevel } from "@draftgap/core/src/risk/risk-level";
import { useUser } from "../../../contexts/UserContext";
import { useDataset } from "../../../contexts/DatasetContext";
import { ButtonGroup } from "../../common/ButtonGroup";
import { Panel, PanelHeader } from "../../common/Panel";
import ChampionCell from "../../common/ChampionCell";
import { ChampionIcon } from "../../icons/ChampionIcon";
import { RoleIcon } from "../../icons/roles/RoleIcon";
import { DeltaText } from "../../common/DeltaText";
import { SummaryStat } from "../../common/SummaryStat";
import { formatPercentage, formatRiskRating } from "../../../utils/rating";
import { cn } from "../../../utils/style";
import { tooltip } from "../../../directives/tooltip";
// eslint-disable-next-line
tooltip;

// Below this many games a number is mostly the small sample correction talking.
const LOW_SAMPLE_GAMES = 1000;

type TableType = "matchups" | "synergies";
type ColumnFilter = "lane" | "all" | Role;

export default function PoolView() {
    const { favouritePicks, config } = useUser();
    const { isLoaded, dataset30Days } = useDataset();

    const poolByRole = createMemo(() => {
        const byRole = new Map<Role, string[]>();
        for (const favouritePick of favouritePicks()) {
            const [championKey, roleString] = favouritePick.split(":");
            const role = Number(roleString) as Role;
            byRole.set(role, [...(byRole.get(role) ?? []), championKey]);
        }
        return byRole;
    });

    const poolRoles = () => ROLES.filter((role) => poolByRole().has(role));

    const [selectedRole, setSelectedRole] = createSignal<Role>();
    // Default to the role with the most favourites.
    const role = () => {
        const byRole = poolByRole();
        const selected = selectedRole();
        if (selected !== undefined && byRole.has(selected)) {
            return selected;
        }
        return [...poolRoles()].sort(
            (a, b) => byRole.get(b)!.length - byRole.get(a)!.length,
        )[0];
    };

    const pool = () => {
        const currentRole = role();
        if (currentRole === undefined || !isLoaded()) return [];
        return poolByRole()
            .get(currentRole)!
            .filter((key) => dataset30Days()!.championData[key]);
    };

    const analysis = createMemo(() => {
        const currentRole = role();
        if (currentRole === undefined || !pool().length) return undefined;

        return analyzePool(
            dataset30Days()!,
            currentRole,
            pool(),
            priorGamesByRiskLevel[config.riskLevel],
        );
    });

    const [tableType, setTableType] = createSignal<TableType>("matchups");
    const [columnFilter, setColumnFilter] = createSignal<ColumnFilter>("lane");

    const columnFilterOptions = () => [
        { value: "lane" as const, label: "In lane" },
        { value: "all" as const, label: "All" },
        ...ROLES.filter((r) => tableType() === "matchups" || r !== role()).map(
            (r) => ({
                value: r,
                label: <RoleIcon role={r} class="h-5" />,
            }),
        ),
    ];

    const columns = () => {
        const currentAnalysis = analysis();
        if (!currentAnalysis) return [];

        const filter = columnFilter();
        return (
            tableType() === "matchups"
                ? currentAnalysis.matchups
                : currentAnalysis.synergies
        )
            .filter((column) =>
                filter === "all"
                    ? true
                    : filter === "lane"
                      ? column.inLane
                      : column.role === filter,
            )
            .sort((a, b) => b.pickRate - a.pickRate);
    };

    const safestChampion = () =>
        [...(analysis()?.champions ?? [])].sort(
            (a, b) => a.blindRiskRating - b.blindRiskRating,
        )[0];

    const cellTitle = (column: PoolColumn, games: number) =>
        `${Math.round(games).toLocaleString()} games` +
        (games < LOW_SAMPLE_GAMES ? " (small sample, pulled toward 0)" : "") +
        (column.best && !column.covered
            ? "\nYour best pick loses by 0.5 points or more"
            : "");

    return (
        <Show
            when={poolRoles().length > 0}
            fallback={
                <Panel class="text-lg">
                    Your pool is empty. Star champions in the Draft tab to add
                    them to your pool, then come back here.
                </Panel>
            }
        >
            <div class="flex flex-col gap-6">
                <div class="flex flex-wrap items-center gap-4">
                    <ButtonGroup
                        options={poolRoles().map((r) => ({
                            value: r,
                            label: displayNameByRole[r],
                        }))}
                        selected={role()!}
                        onChange={setSelectedRole}
                        size="sm"
                    />
                    <div class="flex gap-1">
                        <For each={pool()}>
                            {(championKey) => (
                                <ChampionIcon
                                    championKey={championKey}
                                    size={32}
                                />
                            )}
                        </For>
                    </div>
                </div>

                <Show when={analysis()}>
                    {(currentAnalysis) => (
                        <>
                            <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
                                <SummaryStat
                                    title="Matchup coverage"
                                    value={`${currentAnalysis().matchupCoverage.covered} / ${currentAnalysis().matchupCoverage.total}`}
                                    detail={`${formatPercentage(currentAnalysis().matchupCoverage.weightedCoverage, 0)}% of games`}
                                    tooltip="Common enemies (at least 0.5% of their role's games) your best pick doesn't lose to by 0.5 points or more. Even matchups count, since skill decides those. The percentage weights each enemy by how often they are played."
                                />
                                <SummaryStat
                                    title="Avg best matchup"
                                    value={
                                        <DeltaText
                                            rating={
                                                currentAnalysis()
                                                    .matchupCoverage
                                                    .weightedMeanBestRating
                                            }
                                        />
                                    }
                                    detail="winrate points"
                                    tooltip="Average edge of your best answer to each enemy, weighted by how often they are played. Taking the best of several picks flatters this number, more so for bigger pools."
                                />
                                <SummaryStat
                                    title="Synergy coverage"
                                    value={`${currentAnalysis().synergyCoverage.covered} / ${currentAnalysis().synergyCoverage.total}`}
                                    detail={`${formatPercentage(currentAnalysis().synergyCoverage.weightedCoverage, 0)}% of games`}
                                    tooltip="Common teammates your best pick doesn't lose with by 0.5 points or more."
                                />
                                <SummaryStat
                                    title="Safest blind pick"
                                    value={
                                        <ChampionCell
                                            championKey={
                                                safestChampion().championKey
                                            }
                                        />
                                    }
                                    detail={`±${formatRiskRating(safestChampion().blindRiskRating)} risk`}
                                    tooltip="The pool champion whose winrate swings least against a random enemy team."
                                />
                            </div>

                            <div class="flex flex-col lg:flex-row gap-4">
                                <Panel class="lg:w-3/5">
                                    <PanelHeader>Pool champions</PanelHeader>
                                    <table class="w-full text-lg">
                                        <thead class="text-neutral-400 uppercase text-left">
                                            <tr>
                                                <th class="font-normal pb-2">
                                                    Champion
                                                </th>
                                                <th
                                                    class="font-normal pb-2 text-right"
                                                    // @ts-ignore
                                                    use:tooltip={{
                                                        content:
                                                            "Winrate spread against a random enemy team, one standard deviation. Lower is a safer blind pick.",
                                                    }}
                                                >
                                                    Blind risk
                                                </th>
                                                <th
                                                    class="font-normal pb-2 text-right"
                                                    // @ts-ignore
                                                    use:tooltip={{
                                                        content:
                                                            "Share of enemy games where this champion is your pool's best answer, weighted by how often each enemy is picked.",
                                                    }}
                                                >
                                                    Best answer
                                                </th>
                                                <th
                                                    class="font-normal pb-2 text-right"
                                                    // @ts-ignore
                                                    use:tooltip={{
                                                        content:
                                                            "The pool member whose matchups rise and fall most like this one's (correlation r, weighted by pick rate). Near 1 means the two cover the same enemies.",
                                                    }}
                                                >
                                                    Most similar
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-neutral-800">
                                            <For
                                                each={[
                                                    ...currentAnalysis()
                                                        .champions,
                                                ].sort(
                                                    (a, b) =>
                                                        a.blindRiskRating -
                                                        b.blindRiskRating,
                                                )}
                                            >
                                                {(champion) => (
                                                    <tr>
                                                        <td class="py-2">
                                                            <ChampionCell
                                                                championKey={
                                                                    champion.championKey
                                                                }
                                                            />
                                                        </td>
                                                        <td class="py-2 text-right tabular-nums">
                                                            ±
                                                            {formatRiskRating(
                                                                champion.blindRiskRating,
                                                            )}
                                                        </td>
                                                        <td class="py-2 text-right tabular-nums">
                                                            {formatPercentage(
                                                                champion.bestAnswerShare,
                                                                0,
                                                            )}
                                                            %
                                                        </td>
                                                        <td class="py-2">
                                                            <Show
                                                                when={
                                                                    champion.closestChampionKey
                                                                }
                                                                fallback={
                                                                    <span class="flex justify-end text-neutral-500">
                                                                        -
                                                                    </span>
                                                                }
                                                            >
                                                                <div class="flex justify-end items-center gap-2">
                                                                    <ChampionIcon
                                                                        championKey={
                                                                            champion.closestChampionKey!
                                                                        }
                                                                        size={
                                                                            28
                                                                        }
                                                                    />
                                                                    <span class="tabular-nums">
                                                                        {champion.closestCorrelation!.toFixed(
                                                                            2,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            </Show>
                                                        </td>
                                                    </tr>
                                                )}
                                            </For>
                                        </tbody>
                                    </table>
                                </Panel>

                                <Panel class="lg:w-2/5">
                                    <PanelHeader>Ban suggestions</PanelHeader>
                                    <Show
                                        when={currentAnalysis().bans.length}
                                        fallback={
                                            <div class="text-lg text-neutral-400">
                                                Your pool doesn't lose by 0.5
                                                points or more to any common
                                                enemy. Ban whoever you
                                                personally struggle with.
                                            </div>
                                        }
                                    >
                                        <table class="w-full text-lg">
                                            <thead class="text-neutral-400 uppercase text-left">
                                                <tr>
                                                    <th class="font-normal pb-2">
                                                        Enemy
                                                    </th>
                                                    <th class="font-normal pb-2 text-right">
                                                        Pick rate
                                                    </th>
                                                    <th
                                                        class="font-normal pb-2 text-right"
                                                        // @ts-ignore
                                                        use:tooltip={{
                                                            content:
                                                                "Your pool's best matchup into them. Ranked by how often you'd face them times how much you'd lose.",
                                                        }}
                                                    >
                                                        Best answer
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-neutral-800">
                                                <For
                                                    each={
                                                        currentAnalysis().bans
                                                    }
                                                >
                                                    {(ban) => (
                                                        <tr>
                                                            <td class="py-2">
                                                                <div class="flex items-center gap-2">
                                                                    <RoleIcon
                                                                        role={
                                                                            ban.role
                                                                        }
                                                                        class="h-6"
                                                                    />
                                                                    <ChampionCell
                                                                        championKey={
                                                                            ban.championKey
                                                                        }
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td class="py-2 text-right tabular-nums">
                                                                {formatPercentage(
                                                                    ban.pickRate,
                                                                    1,
                                                                )}
                                                                %
                                                            </td>
                                                            <td class="py-2 text-right">
                                                                <DeltaText
                                                                    rating={
                                                                        ban.bestRating
                                                                    }
                                                                />
                                                            </td>
                                                        </tr>
                                                    )}
                                                </For>
                                            </tbody>
                                        </table>
                                    </Show>
                                </Panel>
                            </div>

                            <Panel>
                                <div class="flex flex-wrap items-center gap-4 mb-4">
                                    <ButtonGroup
                                        options={[
                                            {
                                                value: "matchups" as const,
                                                label: "Matchups",
                                            },
                                            {
                                                value: "synergies" as const,
                                                label: "Synergies",
                                            },
                                        ]}
                                        selected={tableType()}
                                        onChange={(type) => {
                                            setTableType(type);
                                            if (columnFilter() === role()) {
                                                setColumnFilter("all");
                                            }
                                        }}
                                        size="sm"
                                    />
                                    <ButtonGroup
                                        options={columnFilterOptions()}
                                        selected={columnFilter()}
                                        onChange={setColumnFilter}
                                        size="sm"
                                    />
                                    <span class="text-sm text-neutral-400 uppercase">
                                        Winrate points vs expected. Bold = best
                                        pool pick. Red rows = best pick loses by
                                        0.5+. Faded = under {LOW_SAMPLE_GAMES}{" "}
                                        games.
                                    </span>
                                </div>
                                <Show
                                    when={columns().length}
                                    fallback={
                                        <div class="text-lg text-neutral-400">
                                            No common champions for this filter.
                                        </div>
                                    }
                                >
                                    <div class="overflow-x-auto">
                                        <table class="w-full text-lg">
                                            <thead class="text-neutral-400 uppercase text-left">
                                                <tr>
                                                    <th class="font-normal pb-2">
                                                        {tableType() ===
                                                        "matchups"
                                                            ? "Enemy"
                                                            : "Teammate"}
                                                    </th>
                                                    <th class="font-normal pb-2 text-right pr-4">
                                                        Pick rate
                                                    </th>
                                                    <For each={pool()}>
                                                        {(championKey) => (
                                                            <th class="pb-2">
                                                                <div class="flex justify-end">
                                                                    <ChampionIcon
                                                                        championKey={
                                                                            championKey
                                                                        }
                                                                        size={
                                                                            32
                                                                        }
                                                                    />
                                                                </div>
                                                            </th>
                                                        )}
                                                    </For>
                                                </tr>
                                            </thead>
                                            <tbody class="divide-y divide-neutral-800">
                                                <For each={columns()}>
                                                    {(column) => (
                                                        <tr
                                                            class={cn({
                                                                "bg-red-950/40":
                                                                    column.best &&
                                                                    !column.covered,
                                                            })}
                                                        >
                                                            <td class="py-1">
                                                                <div class="flex items-center gap-2">
                                                                    <RoleIcon
                                                                        role={
                                                                            column.role
                                                                        }
                                                                        class="h-6"
                                                                    />
                                                                    <ChampionCell
                                                                        championKey={
                                                                            column.championKey
                                                                        }
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td class="py-1 text-right pr-4 tabular-nums text-neutral-400">
                                                                {formatPercentage(
                                                                    column.pickRate,
                                                                    1,
                                                                )}
                                                                %
                                                            </td>
                                                            <For
                                                                each={
                                                                    column.cells
                                                                }
                                                            >
                                                                {(cell) => (
                                                                    <td class="py-1 text-right">
                                                                        <Show
                                                                            when={
                                                                                cell
                                                                            }
                                                                            fallback={
                                                                                <span class="text-neutral-600">
                                                                                    -
                                                                                </span>
                                                                            }
                                                                        >
                                                                            <span
                                                                                title={cellTitle(
                                                                                    column,
                                                                                    cell!
                                                                                        .games,
                                                                                )}
                                                                            >
                                                                                <DeltaText
                                                                                    rating={
                                                                                        cell!
                                                                                            .rating
                                                                                    }
                                                                                    class={cn(
                                                                                        {
                                                                                            "font-bold underline underline-offset-4":
                                                                                                column
                                                                                                    .best
                                                                                                    ?.championKey ===
                                                                                                cell!
                                                                                                    .championKey,
                                                                                            "opacity-50":
                                                                                                cell!
                                                                                                    .games <
                                                                                                LOW_SAMPLE_GAMES,
                                                                                        },
                                                                                    )}
                                                                                />
                                                                            </span>
                                                                        </Show>
                                                                    </td>
                                                                )}
                                                            </For>
                                                        </tr>
                                                    )}
                                                </For>
                                            </tbody>
                                        </table>
                                    </div>
                                </Show>
                            </Panel>
                        </>
                    )}
                </Show>
            </div>
        </Show>
    );
}
