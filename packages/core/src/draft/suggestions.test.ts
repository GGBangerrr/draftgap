import { describe, expect, test } from "bun:test";
import { Role } from "../models/Role";
import { DraftResult } from "./analysis";
import { getLaneRating } from "./suggestions";

type Pair = [Role, string, Role, string, number];

// Only the parts of a draft result getLaneRating reads.
function draftResult(matchups: Pair[], duos: Pair[]) {
    const toResult = ([
        roleA,
        championKeyA,
        roleB,
        championKeyB,
        rating,
    ]: Pair) => ({
        roleA,
        championKeyA,
        roleB,
        championKeyB,
        rating,
        wins: 0,
        games: 0,
    });

    return {
        matchupRating: {
            matchupResults: matchups.map(toResult),
            totalRating: 0,
        },
        allyDuoRating: { duoResults: duos.map(toResult), totalRating: 0 },
    } as unknown as DraftResult;
}

describe("getLaneRating", () => {
    test("is undefined until a lane opponent or lane partner is picked", () => {
        const result = draftResult(
            [[Role.Bottom, "ADC", Role.Middle, "MID", 10]],
            [[Role.Jungle, "JNG", Role.Bottom, "ADC", 5]],
        );

        expect(getLaneRating(result, Role.Bottom, "ADC")).toBeUndefined();
    });

    test("adds bot lane partner synergy to the lane matchups", () => {
        const result = draftResult(
            [
                [Role.Bottom, "ADC", Role.Bottom, "ENEMY_ADC", 10],
                [Role.Bottom, "ADC", Role.Support, "ENEMY_SUP", -4],
                [Role.Bottom, "ADC", Role.Middle, "ENEMY_MID", 100],
            ],
            [
                // Duos list each pair once, so the ADC can be on either side.
                [Role.Bottom, "ADC", Role.Support, "SUP", 6],
                [Role.Jungle, "JNG", Role.Bottom, "ADC", 100],
            ],
        );

        expect(getLaneRating(result, Role.Bottom, "ADC")).toBe(12);
        expect(getLaneRating(result, Role.Support, "SUP")).toBe(6);
    });

    test("solo lanes have no lane partner", () => {
        const result = draftResult(
            [[Role.Middle, "MID", Role.Middle, "ENEMY_MID", 7]],
            [[Role.Middle, "MID", Role.Jungle, "JNG", 50]],
        );

        expect(getLaneRating(result, Role.Middle, "MID")).toBe(7);
    });
});
