import { Role, ROLES } from "../models/Role";
import { Dataset } from "../models/dataset/Dataset";
import { priorGamesByRiskLevel } from "../risk/risk-level";
import { DraftResult, AnalyzeDraftConfig, analyzeDraft } from "./analysis";
import { BlindRiskResult, analyzeBlindRisk } from "./blind-risk";
import { isInLane } from "./lane";
import { getStats } from "./utils";

export interface Suggestion {
    championKey: string;
    role: Role;
    draftResult: DraftResult;
    blindRisk: BlindRiskResult;
    // Matchups against the enemies already picked in your lane, plus synergy with your bot lane partner; undefined until either is picked.
    laneRating: number | undefined;
    // Draft rating adjusted for champions removed from the open enemy roles, minus a penalty for how polarized those matchups are.
    safeRating: number;
}

export type SuggestionsConfig = AnalyzeDraftConfig & {
    // Standard deviations of unrevealed matchup risk to subtract from the safe rating.
    blindPickDeviations: number;
};

export function getLaneRating(
    draftResult: DraftResult,
    role: Role,
    championKey: string,
) {
    const laneMatchups = draftResult.matchupRating.matchupResults.filter(
        (m) =>
            m.championKeyA === championKey &&
            m.roleA === role &&
            isInLane(role, m.roleB),
    );
    // Only bot lane has an ally in the same lane; duos list each pair once, in either order.
    const laneDuos = draftResult.allyDuoRating.duoResults.filter(
        (d) =>
            (d.championKeyA === championKey &&
                d.roleA === role &&
                isInLane(role, d.roleB)) ||
            (d.championKeyB === championKey &&
                d.roleB === role &&
                isInLane(role, d.roleA)),
    );
    if (!laneMatchups.length && !laneDuos.length) return undefined;

    return [...laneMatchups, ...laneDuos].reduce(
        (sum, result) => sum + result.rating,
        0,
    );
}

export function getSuggestions(
    dataset: Dataset,
    synergyMatchupDataset: Dataset,
    team: Map<Role, string>,
    enemy: Map<Role, string>,
    config: SuggestionsConfig,
    bans: string[] = [],
) {
    const remainingRoles = ROLES.filter((role) => !team.has(role));
    const enemyChampions = new Set(enemy.values());
    const allyChampions = new Set(team.values());
    const unavailableChampions = new Set([
        ...enemyChampions,
        ...allyChampions,
        ...bans,
    ]);
    const priorGames = priorGamesByRiskLevel[config.riskLevel];

    const suggestions: Suggestion[] = [];

    for (const championKey of Object.keys(dataset.championData)) {
        if (enemyChampions.has(championKey) || allyChampions.has(championKey))
            continue;

        for (const role of remainingRoles) {
            if (team.has(role)) continue;
            if (
                (getStats(synergyMatchupDataset, championKey, role).games /
                    30) *
                    7 <
                config.minGames
            )
                continue;

            team.set(role, championKey);
            const draftResult = analyzeDraft(
                dataset,
                synergyMatchupDataset,
                team,
                enemy,
                config,
            );
            team.delete(role);

            const blindRisk = analyzeBlindRisk(
                synergyMatchupDataset,
                role,
                championKey,
                enemy,
                unavailableChampions,
                priorGames,
            );

            suggestions.push({
                championKey,
                role,
                draftResult,
                blindRisk,
                laneRating: getLaneRating(draftResult, role, championKey),
                safeRating:
                    draftResult.totalRating +
                    blindRisk.expectedRating -
                    config.blindPickDeviations * blindRisk.riskRating,
            });
        }
    }

    return suggestions.sort(
        (a, b) => b.draftResult.winrate - a.draftResult.winrate,
    );
}
