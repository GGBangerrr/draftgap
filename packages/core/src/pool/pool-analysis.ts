import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { analyzeDuo, analyzeMatchup } from "../draft/analysis";
import { analyzeBlindRisk, getRolePool } from "../draft/blind-risk";
import { winrateToRating } from "../rating/ratings";

const MAX_BANS = 5;

// A best pick only counts as losing below 49.5%; anything closer to even is fine, since skill decides those games.
export const DEFAULT_LOSING_RATING = winrateToRating(0.495);

export type PoolCell = {
    championKey: string;
    rating: number;
    games: number;
};

// One opponent (or partner) and how every pool champion does against (or with) it.
export type PoolColumn = {
    role: Role;
    championKey: string;
    // Share of that role's games.
    pickRate: number;
    inLane: boolean;
    // In pool order; undefined when the pool champion is the same champion, which a draft can't have.
    cells: (PoolCell | undefined)[];
    best: PoolCell | undefined;
    // Your best pick isn't losing.
    covered: boolean;
};

export type PoolCoverage = {
    total: number;
    covered: number;
    // Pick rate weighted share of columns your best pick isn't losing in.
    weightedCoverage: number;
    // Pick rate weighted mean rating of your best pick per column.
    weightedMeanBestRating: number;
};

export type PoolChampionSummary = {
    championKey: string;
    // Matchup spread against a random enemy team; lower is a safer blind pick.
    blindRiskRating: number;
    // Share of enemy games (pick rate weighted) where this champion is the pool's best answer.
    bestAnswerShare: number;
    // Pool member whose matchups move most like this one's, weighted by pick rate, i.e. the most redundant pairing.
    closestChampionKey: string | undefined;
    closestCorrelation: number | undefined;
};

export type PoolBan = {
    role: Role;
    championKey: string;
    pickRate: number;
    bestRating: number;
    // Expected rating your pool loses to this opponent per game, which a ban takes away.
    value: number;
};

export type PoolAnalysis = {
    matchups: PoolColumn[];
    synergies: PoolColumn[];
    matchupCoverage: PoolCoverage;
    synergyCoverage: PoolCoverage;
    champions: PoolChampionSummary[];
    bans: PoolBan[];
};

export function isInLane(role: Role, otherRole: Role) {
    if (role === otherRole) return true;

    const botLane: Role[] = [Role.Bottom, Role.Support];
    return botLane.includes(role) && botLane.includes(otherRole);
}

function createColumn(
    role: Role,
    otherRole: Role,
    otherChampion: { championKey: string; pickRate: number },
    pool: string[],
    losingRating: number,
    analyze: (championKey: string) => PoolCell,
): PoolColumn {
    const cells = pool.map((championKey) =>
        championKey === otherChampion.championKey
            ? undefined
            : analyze(championKey),
    );

    let best: PoolCell | undefined;
    for (const cell of cells) {
        if (cell && (!best || cell.rating > best.rating)) best = cell;
    }

    return {
        role: otherRole,
        championKey: otherChampion.championKey,
        pickRate: otherChampion.pickRate,
        inLane: isInLane(role, otherRole),
        cells,
        best,
        covered: best !== undefined && best.rating > losingRating,
    };
}

function getCoverage(columns: PoolColumn[]): PoolCoverage {
    let totalWeight = 0;
    let coveredWeight = 0;
    let bestRatingSum = 0;

    for (const column of columns) {
        if (!column.best) continue;

        totalWeight += column.pickRate;
        bestRatingSum += column.pickRate * column.best.rating;
        if (column.covered) coveredWeight += column.pickRate;
    }

    return {
        total: columns.length,
        covered: columns.filter((c) => c.covered).length,
        weightedCoverage: totalWeight === 0 ? 0 : coveredWeight / totalWeight,
        weightedMeanBestRating:
            totalWeight === 0 ? 0 : bestRatingSum / totalWeight,
    };
}

// Pearson correlation where each point counts by its weight, so rarely picked enemies matter less.
function weightedCorrelation(a: number[], b: number[], weights: number[]) {
    if (a.length < 2) return undefined;

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return undefined;

    const meanA =
        a.reduce((sum, x, i) => sum + weights[i] * x, 0) / totalWeight;
    const meanB =
        b.reduce((sum, x, i) => sum + weights[i] * x, 0) / totalWeight;

    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    for (let i = 0; i < a.length; i++) {
        covariance += weights[i] * (a[i] - meanA) * (b[i] - meanB);
        varianceA += weights[i] * (a[i] - meanA) ** 2;
        varianceB += weights[i] * (b[i] - meanB) ** 2;
    }

    if (varianceA === 0 || varianceB === 0) return undefined;
    return covariance / Math.sqrt(varianceA * varianceB);
}

function getChampionSummaries(
    dataset: Dataset,
    role: Role,
    pool: string[],
    matchups: PoolColumn[],
    priorGames: number,
): PoolChampionSummary[] {
    const totalBestWeight = matchups
        .filter((c) => c.best)
        .reduce((sum, c) => sum + c.pickRate, 0);

    return pool.map((championKey, i) => {
        let closestChampionKey: string | undefined;
        let closestCorrelation: number | undefined;

        for (let j = 0; j < pool.length; j++) {
            if (i === j) continue;

            const pairs = matchups.filter((c) => c.cells[i] && c.cells[j]);
            const r = weightedCorrelation(
                pairs.map((c) => c.cells[i]!.rating),
                pairs.map((c) => c.cells[j]!.rating),
                pairs.map((c) => c.pickRate),
            );
            if (
                r !== undefined &&
                (closestCorrelation === undefined || r > closestCorrelation)
            ) {
                closestChampionKey = pool[j];
                closestCorrelation = r;
            }
        }

        return {
            championKey,
            blindRiskRating: analyzeBlindRisk(
                dataset,
                role,
                championKey,
                new Map(),
                new Set(),
                priorGames,
            ).riskRating,
            bestAnswerShare:
                totalBestWeight === 0
                    ? 0
                    : matchups
                          .filter((c) => c.best?.championKey === championKey)
                          .reduce((sum, c) => sum + c.pickRate, 0) /
                      totalBestWeight,
            closestChampionKey,
            closestCorrelation,
        };
    });
}

function getBans(matchups: PoolColumn[]): PoolBan[] {
    return matchups
        .filter((c) => c.best && !c.covered)
        .map((c) => ({
            role: c.role,
            championKey: c.championKey,
            pickRate: c.pickRate,
            bestRating: c.best!.rating,
            value: c.pickRate * -c.best!.rating,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, MAX_BANS);
}

export function analyzePool(
    dataset: Dataset,
    role: Role,
    pool: string[],
    priorGames: number,
    losingRating = DEFAULT_LOSING_RATING,
): PoolAnalysis {
    const matchups: PoolColumn[] = [];
    for (const enemyRole of ROLES) {
        for (const enemy of getRolePool(dataset, enemyRole)) {
            matchups.push(
                createColumn(
                    role,
                    enemyRole,
                    enemy,
                    pool,
                    losingRating,
                    (championKey) => {
                        const { rating, games } = analyzeMatchup(
                            dataset,
                            role,
                            championKey,
                            enemyRole,
                            enemy.championKey,
                            priorGames,
                        );
                        return { championKey, rating, games };
                    },
                ),
            );
        }
    }

    const synergies: PoolColumn[] = [];
    for (const allyRole of ROLES) {
        if (allyRole === role) continue;

        for (const ally of getRolePool(dataset, allyRole)) {
            synergies.push(
                createColumn(
                    role,
                    allyRole,
                    ally,
                    pool,
                    losingRating,
                    (championKey) => {
                        const { rating, games } = analyzeDuo(
                            dataset,
                            role,
                            championKey,
                            allyRole,
                            ally.championKey,
                            priorGames,
                        );
                        return { championKey, rating, games };
                    },
                ),
            );
        }
    }

    return {
        matchups,
        synergies,
        matchupCoverage: getCoverage(matchups),
        synergyCoverage: getCoverage(synergies),
        champions: getChampionSummaries(
            dataset,
            role,
            pool,
            matchups,
            priorGames,
        ),
        bans: getBans(matchups),
    };
}
