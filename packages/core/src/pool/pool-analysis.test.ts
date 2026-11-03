import { describe, expect, test } from "bun:test";
import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import { winrateToRating } from "../rating/ratings";
import { analyzePool, isInLane } from "./pool-analysis";

const GAMES = 100_000;

// Bottom laners A and B form the pool. Support X is picked three times as often as support Y.
// A crushes X but loses to Y; B is slightly behind into both.
function createDataset(): Dataset {
    // Like real datasets, every champion has (possibly empty) data for every role.
    const emptyByRole = () =>
        Object.fromEntries(ROLES.map((r) => [r, {}])) as Record<
            Role,
            Record<string, unknown>
        >;

    const champion = (
        role: Role,
        games: number,
        matchupRole: Role,
        matchups: Record<string, number>,
    ) => ({
        statsByRole: Object.fromEntries(
            ROLES.map((r) => [
                r,
                {
                    wins: r === role ? games / 2 : 0,
                    games: r === role ? games : 0,
                    matchup: {
                        ...emptyByRole(),
                        ...(r === role && {
                            [matchupRole]: Object.fromEntries(
                                Object.entries(matchups).map(
                                    ([key, winrate]) => [
                                        key,
                                        { wins: GAMES * winrate, games: GAMES },
                                    ],
                                ),
                            ),
                        }),
                    },
                    synergy: emptyByRole(),
                },
            ]),
        ),
    });

    return {
        championData: {
            A: champion(Role.Bottom, GAMES, Role.Support, { X: 0.7, Y: 0.3 }),
            B: champion(Role.Bottom, GAMES, Role.Support, {
                X: 0.48,
                Y: 0.45,
            }),
            X: champion(Role.Support, GAMES * 0.75, Role.Bottom, {
                A: 0.3,
                B: 0.52,
            }),
            Y: champion(Role.Support, GAMES * 0.25, Role.Bottom, {
                A: 0.7,
                B: 0.55,
            }),
        },
    } as unknown as Dataset;
}

function analyze() {
    return analyzePool(createDataset(), Role.Bottom, ["A", "B"], 1000);
}

function column(role: Role, championKey: string) {
    return analyze().matchups.find(
        (c) => c.role === role && c.championKey === championKey,
    )!;
}

describe("analyzePool", () => {
    test("picks the pool's best answer to each opponent", () => {
        expect(column(Role.Support, "X").best?.championKey).toBe("A");
        expect(column(Role.Support, "X").covered).toBe(true);

        expect(column(Role.Support, "Y").best?.championKey).toBe("B");
        expect(column(Role.Support, "Y").covered).toBe(false);
    });

    test("weights opponents by pick rate within their role", () => {
        expect(column(Role.Support, "X").pickRate).toBeCloseTo(0.75);
        expect(column(Role.Support, "Y").pickRate).toBeCloseTo(0.25);
    });

    test("skips mirror cells, since one champion can't be on both teams", () => {
        const mirror = column(Role.Bottom, "A");

        expect(mirror.cells[0]).toBeUndefined();
        expect(mirror.best?.championKey).toBe("B");
    });

    test("slightly losing matchups still count as covered", () => {
        // B's 45% into Y is losing by the default rule, but fine if only below 40% counts as losing.
        const { matchups, bans } = analyzePool(
            createDataset(),
            Role.Bottom,
            ["A", "B"],
            1000,
            winrateToRating(0.4),
        );
        const y = matchups.find(
            (c) => c.role === Role.Support && c.championKey === "Y",
        )!;

        expect(y.covered).toBe(true);
        expect(bans).toEqual([]);
    });

    test("suggests banning only opponents the pool loses to", () => {
        const { bans } = analyze();

        expect(bans.map((b) => b.championKey)).toEqual(["Y"]);
        expect(bans[0].value).toBeGreaterThan(0);
    });

    test("weights best answers by how often each enemy is picked", () => {
        // A is best into X (75% of supports) and into bottom laner B (50% of bottoms); B takes the rest.
        const [a, b] = analyze().champions;

        expect(a.bestAnswerShare).toBeCloseTo(0.625);
        expect(b.bestAnswerShare).toBeCloseTo(0.375);
    });

    test("finds the most similar pool member", () => {
        const [a] = analyze().champions;

        expect(a.closestChampionKey).toBe("B");
        expect(a.closestCorrelation).toBeCloseTo(1);
    });

    test("bot lane counts as one lane", () => {
        expect(isInLane(Role.Support, Role.Bottom)).toBe(true);
        expect(isInLane(Role.Support, Role.Middle)).toBe(false);
        expect(isInLane(Role.Top, Role.Top)).toBe(true);
    });
});
