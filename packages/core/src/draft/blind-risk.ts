import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { analyzeMatchup } from "./analysis";
import { getStats } from "./utils";

// Champions below this share of a role's games are not considered likely enemies.
const MIN_ROLE_PICK_RATE = 0.005;

export type BlindRiskResult = {
    // How much the open enemy roles' expected matchups improve because picks and bans removed champions.
    // A champion's base winrate already covers the full field, so only the change from removed champions is added.
    expectedRating: number;
    // Standard deviation of that matchup rating; open roles are treated as independent, so variances add.
    riskRating: number;
};

type RolePool = { championKey: string; games: number; pickRate: number }[];

const rolePoolsByDataset = new WeakMap<Dataset, Map<Role, RolePool>>();

// Champions commonly played in a role, with their share of that role's games.
export function getRolePool(dataset: Dataset, role: Role) {
    let rolePools = rolePoolsByDataset.get(dataset);
    if (!rolePools) {
        rolePools = new Map();
        rolePoolsByDataset.set(dataset, rolePools);
    }

    const cached = rolePools.get(role);
    if (cached) return cached;

    const champions = Object.keys(dataset.championData).map((championKey) => ({
        championKey,
        games: getStats(dataset, championKey, role).games,
    }));
    const totalGames = champions.reduce((sum, c) => sum + c.games, 0);
    const pool = champions
        .filter(
            (c) => c.games > 0 && c.games >= totalGames * MIN_ROLE_PICK_RATE,
        )
        .map((c) => ({ ...c, pickRate: c.games / totalGames }));

    rolePools.set(role, pool);
    return pool;
}

export function analyzeBlindRisk(
    dataset: Dataset,
    role: Role,
    championKey: string,
    enemy: Map<Role, string>,
    unavailableChampions: Set<string>,
    priorGames: number,
): BlindRiskResult {
    let expectedRating = 0;
    let variance = 0;

    for (const enemyRole of ROLES) {
        if (enemy.has(enemyRole)) continue;

        let fieldWeight = 0;
        let fieldSum = 0;
        let totalWeight = 0;
        let weightedSum = 0;
        let weightedSquareSum = 0;

        for (const { championKey: enemyChampionKey, games } of getRolePool(
            dataset,
            enemyRole,
        )) {
            if (enemyChampionKey === championKey) continue;

            const { rating } = analyzeMatchup(
                dataset,
                role,
                championKey,
                enemyRole,
                enemyChampionKey,
                priorGames,
            );

            fieldWeight += games;
            fieldSum += games * rating;

            if (unavailableChampions.has(enemyChampionKey)) continue;

            totalWeight += games;
            weightedSum += games * rating;
            weightedSquareSum += games * rating * rating;
        }

        if (totalWeight === 0) continue;

        const mean = weightedSum / totalWeight;
        expectedRating += mean - fieldSum / fieldWeight;
        variance += Math.max(0, weightedSquareSum / totalWeight - mean * mean);
    }

    return {
        expectedRating,
        riskRating: Math.sqrt(variance),
    };
}
