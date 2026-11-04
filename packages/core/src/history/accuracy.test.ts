import { describe, expect, test } from "bun:test";
import { getAccuracyStats } from "./accuracy";
import { GameRecord, GameResult } from "./game-record";

function record(predictedWinrate: number, result: GameResult | undefined) {
    return {
        id: `${predictedWinrate}-${result}-${Math.random()}`,
        date: "2026-11-04T00:00:00.000Z",
        patch: "16.21",
        queueId: 420,
        queueName: "Ranked Solo/Duo",
        allyTeam: [],
        opponentTeam: [],
        bans: [],
        yourPick: undefined,
        predictedWinrate,
        laneRating: undefined,
        result,
    } satisfies GameRecord;
}

describe("getAccuracyStats", () => {
    test("leaves out remakes and unmarked games", () => {
        const stats = getAccuracyStats([
            record(0.6, "win"),
            record(0.6, "remake"),
            record(0.6, undefined),
        ]);

        expect(stats.games).toBe(1);
        expect(stats.wins).toBe(1);
    });

    test("counts how often the predicted favourite won", () => {
        const stats = getAccuracyStats([
            record(0.55, "win"), // favourite won
            record(0.45, "loss"), // favourite (enemy) won
            record(0.55, "loss"), // favourite lost
            record(0.5, "win"), // no favourite
        ]);

        expect(stats.favouriteGames).toBe(3);
        expect(stats.favouriteWins).toBe(2);
        expect(stats.favouriteAccuracy).toBeCloseTo(2 / 3);
    });

    test("always predicting 50% scores the coin flip Brier score", () => {
        const stats = getAccuracyStats([
            record(0.5, "win"),
            record(0.5, "loss"),
        ]);

        expect(stats.brierScore).toBeCloseTo(0.25);
    });

    test("puts games in calibration buckets by predicted winrate", () => {
        const stats = getAccuracyStats([
            record(0.53, "win"),
            record(0.54, "loss"),
            record(0.6, "win"),
        ]);
        const bucket = stats.buckets.find((b) => b.from === 0.52)!;

        expect(bucket.games).toBe(2);
        expect(bucket.meanPredicted).toBeCloseTo(0.535);
        expect(bucket.actualWinrate).toBeCloseTo(0.5);
        expect(stats.buckets.at(-1)!.games).toBe(1);
    });
});
