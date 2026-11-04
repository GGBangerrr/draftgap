import { describe, expect, test } from "bun:test";
import { Dataset } from "../models/dataset/Dataset";
import { Role, ROLES } from "../models/Role";
import {
    createPoolModel,
    rankReplacements,
    scorePool,
} from "./pool-recommender";

const GAMES = 100_000;

// Bottom laners A and B each beat one of the two enemy supports and lose to the other;
// C is a good answer to Y, D answers neither. Every champion has a 50% base winrate.
function createDataset(): Dataset {
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

    const bottom = (x: number, y: number) =>
        champion(Role.Bottom, GAMES, Role.Support, { X: x, Y: y });

    return {
        championData: {
            A: bottom(0.65, 0.4),
            B: bottom(0.4, 0.65),
            C: bottom(0.45, 0.62),
            D: bottom(0.45, 0.45),
            X: champion(Role.Support, GAMES, Role.Bottom, {
                A: 0.35,
                B: 0.6,
                C: 0.55,
                D: 0.55,
            }),
            Y: champion(Role.Support, GAMES, Role.Bottom, {
                A: 0.6,
                B: 0.35,
                C: 0.38,
                D: 0.55,
            }),
        },
    } as unknown as Dataset;
}

function createModel() {
    const dataset = createDataset();
    return createPoolModel(
        dataset,
        dataset,
        Role.Bottom,
        ["A", "B"],
        1000,
        1,
        400,
    );
}

describe("pool recommender", () => {
    test("two champions that cover each other beat either alone", () => {
        const model = createModel();
        const both = scorePool(model, ["A", "B"], "counterpick");
        const onlyA = scorePool(model, ["A"], "counterpick");

        // Some drafts put A or B on the enemy team, so the gain is a little under the full matchup swing.
        expect(both.counterpickRating).toBeGreaterThan(
            onlyA.counterpickRating + 25,
        );
    });

    test("ranks the champion that fills the gap first when replacing", () => {
        const ranking = rankReplacements(
            createModel(),
            ["A", "B"],
            "B",
            "counterpick",
        );

        expect(ranking.map((r) => r.championKey)).toEqual(["C", "D"]);
        // B was the perfect partner for A, so any swap costs a little; C costs least.
        expect(ranking[0].change).toBeLessThan(0);
        expect(ranking[0].change).toBeGreaterThan(ranking[1].change);
    });

    test("blind value is the pool's best single blind pick", () => {
        const model = createModel();
        const { blindRating } = scorePool(model, ["A", "D"], "blind");

        expect(blindRating).toBe(
            Math.max(
                model.candidates.get("A")!.blindRating,
                model.candidates.get("D")!.blindRating,
            ),
        );
    });

    test("the same inputs always give the same rankings", () => {
        const first = rankReplacements(createModel(), ["A"], undefined, "both");
        const second = rankReplacements(
            createModel(),
            ["A"],
            undefined,
            "both",
        );

        expect(first).toEqual(second);
    });
});
