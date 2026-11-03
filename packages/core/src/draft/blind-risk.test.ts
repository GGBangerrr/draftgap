import { describe, expect, test } from "bun:test";
import { Dataset } from "../models/dataset/Dataset";
import { Role } from "../models/Role";
import { analyzeBlindRisk } from "./blind-risk";

type Stats = { wins: number; games: number };

const GAMES = 100_000;

// Bottom laner A is polarized (crushes support X, loses to support Y), bottom laner B is even into both.
// All champions have a 50% base winrate, so every rating is a pure matchup effect.
function createDataset(): Dataset {
    const matchups: Record<string, Record<string, number>> = {
        A: { X: 0.7, Y: 0.3 },
        B: { X: 0.5, Y: 0.5 },
    };

    const roleData = (matchupRole: Role, matchup: Record<string, Stats>) => ({
        wins: GAMES / 2,
        games: GAMES,
        matchup: { [matchupRole]: matchup },
        synergy: {},
    });

    const championData: Record<string, unknown> = {};
    for (const [ally, enemies] of Object.entries(matchups)) {
        championData[ally] = {
            statsByRole: {
                [Role.Bottom]: roleData(
                    Role.Support,
                    Object.fromEntries(
                        Object.entries(enemies).map(([enemy, winrate]) => [
                            enemy,
                            { wins: GAMES * winrate, games: GAMES },
                        ]),
                    ),
                ),
            },
        };
    }
    for (const enemy of ["X", "Y"]) {
        championData[enemy] = {
            statsByRole: {
                [Role.Support]: roleData(
                    Role.Bottom,
                    Object.fromEntries(
                        Object.entries(matchups).map(([ally, enemies]) => [
                            ally,
                            {
                                wins: GAMES * (1 - enemies[enemy]),
                                games: GAMES,
                            },
                        ]),
                    ),
                ),
            },
        };
    }

    return { championData } as unknown as Dataset;
}

// Every role but support is already revealed.
const enemyWithOpenSupport = new Map<Role, string>([
    [Role.Top, "T"],
    [Role.Jungle, "J"],
    [Role.Middle, "M"],
    [Role.Bottom, "BOT"],
]);

describe("analyzeBlindRisk", () => {
    test("is zero when every enemy role is revealed", () => {
        const enemy = new Map(enemyWithOpenSupport).set(Role.Support, "X");
        const result = analyzeBlindRisk(
            createDataset(),
            Role.Bottom,
            "A",
            enemy,
            new Set(),
            1000,
        );

        expect(result).toEqual({ expectedRating: 0, riskRating: 0 });
    });

    test("polarized champion is riskier than a consistent one", () => {
        const dataset = createDataset();
        const polarized = analyzeBlindRisk(
            dataset,
            Role.Bottom,
            "A",
            enemyWithOpenSupport,
            new Set(),
            1000,
        );
        const consistent = analyzeBlindRisk(
            dataset,
            Role.Bottom,
            "B",
            enemyWithOpenSupport,
            new Set(),
            1000,
        );

        expect(polarized.riskRating).toBeGreaterThan(100);
        expect(consistent.riskRating).toBeCloseTo(0, 5);
        // The 70% and 30% matchups are symmetric in rating space, so they cancel out.
        expect(polarized.expectedRating).toBeCloseTo(0, 5);
    });

    test("banned or picked counters are not considered", () => {
        const result = analyzeBlindRisk(
            createDataset(),
            Role.Bottom,
            "A",
            enemyWithOpenSupport,
            new Set(["Y"]),
            1000,
        );

        expect(result.riskRating).toBeCloseTo(0, 5);
        expect(result.expectedRating).toBeGreaterThan(100);
    });
});
