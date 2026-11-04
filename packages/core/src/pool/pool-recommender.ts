import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { analyzeChampion, analyzeDuo, analyzeMatchup } from "../draft/analysis";
import { analyzeBlindRisk, getRolePool } from "../draft/blind-risk";

const DEFAULT_DRAFT_COUNT = 1500;
const MAX_SAMPLE_ATTEMPTS = 20;

export type PoolGoal = "both" | "counterpick" | "blind";

export type PoolCandidate = {
    championKey: string;
    // Current patch strength in this role.
    baseRating: number;
    // Base rating minus the blind-pick penalty: what the Blind column shows in an empty draft.
    blindRating: number;
    // Share of this role's games; low shares mean thin data.
    pickRate: number;
};

export type PoolScore = {
    // Mean value of your best pool pick across simulated drafts, when you pick last and see everyone.
    counterpickRating: number;
    // Your pool's best blind pick.
    blindRating: number;
    // The rating the chosen goal optimizes.
    totalRating: number;
};

// Precomputed draft values for every candidate in a role, so scoring a pool is just a max and a mean.
export type PoolModel = {
    role: Role;
    candidates: Map<string, PoolCandidate>;
    // Per candidate, its rating in each simulated draft; -Infinity when the draft already has that champion.
    draftValues: Map<string, Float64Array>;
    draftCount: number;
};

// Small seeded generator so the simulated drafts, and thus the rankings, are the same every time.
function createRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

type SampledDraft = {
    enemies: [Role, string][];
    allies: [Role, string][];
    champions: Set<string>;
};

function sampleDrafts(
    dataset: Dataset,
    role: Role,
    count: number,
    random: () => number,
): SampledDraft[] {
    const rolePools = new Map(ROLES.map((r) => [r, getRolePool(dataset, r)]));

    const pick = (r: Role, taken: Set<string>) => {
        const pool = rolePools.get(r)!;
        if (!pool.length) return undefined;

        const total = pool.reduce((sum, c) => sum + c.pickRate, 0);
        for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
            let x = random() * total;
            const champion =
                pool.find((c) => (x -= c.pickRate) <= 0) ?? pool.at(-1)!;
            if (!taken.has(champion.championKey)) return champion.championKey;
        }
        return undefined;
    };

    const drafts: SampledDraft[] = [];
    for (let i = 0; i < count; i++) {
        const champions = new Set<string>();
        const enemies: [Role, string][] = [];
        const allies: [Role, string][] = [];

        for (const r of ROLES) {
            const championKey = pick(r, champions);
            if (championKey === undefined) continue;
            champions.add(championKey);
            enemies.push([r, championKey]);
        }
        for (const r of ROLES) {
            if (r === role) continue;
            const championKey = pick(r, champions);
            if (championKey === undefined) continue;
            champions.add(championKey);
            allies.push([r, championKey]);
        }

        drafts.push({ enemies, allies, champions });
    }
    return drafts;
}

export function createPoolModel(
    dataset: Dataset,
    fullDataset: Dataset,
    role: Role,
    pool: string[],
    priorGames: number,
    blindPickDeviations: number,
    draftCount = DEFAULT_DRAFT_COUNT,
    seed = 1,
): PoolModel {
    const rolePool = getRolePool(fullDataset, role);
    const pickRates = new Map(rolePool.map((c) => [c.championKey, c.pickRate]));
    // Your own champions are always candidates, even when they are rare in this role.
    const candidateKeys = [
        ...new Set([...rolePool.map((c) => c.championKey), ...pool]),
    ].filter(
        (key) =>
            dataset.championData[key]?.statsByRole[role] &&
            fullDataset.championData[key],
    );

    const candidates = new Map<string, PoolCandidate>();
    for (const championKey of candidateKeys) {
        const baseRating = analyzeChampion(
            dataset,
            fullDataset,
            role,
            championKey,
            priorGames,
        ).rating;
        const { riskRating } = analyzeBlindRisk(
            fullDataset,
            role,
            championKey,
            new Map(),
            new Set(),
            priorGames,
        );

        candidates.set(championKey, {
            championKey,
            baseRating,
            blindRating: baseRating - blindPickDeviations * riskRating,
            pickRate: pickRates.get(championKey) ?? 0,
        });
    }

    const drafts = sampleDrafts(
        fullDataset,
        role,
        draftCount,
        createRandom(seed),
    );

    const draftValues = new Map<string, Float64Array>();
    for (const candidate of candidates.values()) {
        const { championKey } = candidate;
        const matchupCache = new Map<string, number>();
        const duoCache = new Map<string, number>();
        const values = new Float64Array(drafts.length);

        drafts.forEach((draft, i) => {
            if (draft.champions.has(championKey)) {
                values[i] = -Infinity;
                return;
            }

            let value = candidate.baseRating;
            for (const [enemyRole, enemyKey] of draft.enemies) {
                const cacheKey = `${enemyRole}:${enemyKey}`;
                let rating = matchupCache.get(cacheKey);
                if (rating === undefined) {
                    rating = analyzeMatchup(
                        fullDataset,
                        role,
                        championKey,
                        enemyRole,
                        enemyKey,
                        priorGames,
                    ).rating;
                    matchupCache.set(cacheKey, rating);
                }
                value += rating;
            }
            for (const [allyRole, allyKey] of draft.allies) {
                const cacheKey = `${allyRole}:${allyKey}`;
                let rating = duoCache.get(cacheKey);
                if (rating === undefined) {
                    rating = analyzeDuo(
                        fullDataset,
                        role,
                        championKey,
                        allyRole,
                        allyKey,
                        priorGames,
                    ).rating;
                    duoCache.set(cacheKey, rating);
                }
                value += rating;
            }
            values[i] = value;
        });

        draftValues.set(championKey, values);
    }

    return { role, candidates, draftValues, draftCount: drafts.length };
}

export function scorePool(
    model: PoolModel,
    pool: string[],
    goal: PoolGoal,
): PoolScore {
    const members = pool.filter((key) => model.candidates.has(key));
    if (!members.length) {
        return { counterpickRating: 0, blindRating: 0, totalRating: 0 };
    }

    const memberValues = members.map((key) => model.draftValues.get(key)!);
    let sum = 0;
    let drafts = 0;
    for (let i = 0; i < model.draftCount; i++) {
        let best = -Infinity;
        for (const values of memberValues) {
            if (values[i] > best) best = values[i];
        }
        if (best === -Infinity) continue;
        sum += best;
        drafts++;
    }

    const counterpickRating = drafts ? sum / drafts : 0;
    const blindRating = Math.max(
        ...members.map((key) => model.candidates.get(key)!.blindRating),
    );

    return {
        counterpickRating,
        blindRating,
        totalRating:
            goal === "counterpick"
                ? counterpickRating
                : goal === "blind"
                  ? blindRating
                  : (counterpickRating + blindRating) / 2,
    };
}

export type PoolRecommendation = {
    championKey: string;
    score: PoolScore;
    // Change in the goal's rating compared to the pool before the swap.
    change: number;
};

// Ranks every candidate by how much the pool improves when it takes the removed champion's place (or is added).
export function rankReplacements(
    model: PoolModel,
    pool: string[],
    removed: string | undefined,
    goal: PoolGoal,
): PoolRecommendation[] {
    const remaining = pool.filter((key) => key !== removed);
    const baseline = scorePool(model, pool, goal).totalRating;

    return [...model.candidates.keys()]
        .filter((key) => !pool.includes(key))
        .map((championKey) => {
            const score = scorePool(model, [...remaining, championKey], goal);
            return {
                championKey,
                score,
                change: score.totalRating - baseline,
            };
        })
        .sort((a, b) => b.score.totalRating - a.score.totalRating);
}
