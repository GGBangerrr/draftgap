import { GameRecord } from "./game-record";

export const RANKED_QUEUE_IDS = [420, 440];

// Predictions cluster near 50%, so the buckets are narrow in the middle.
const BUCKET_EDGES = [0, 0.45, 0.48, 0.5, 0.52, 0.55, 1];

export type CalibrationBucket = {
    from: number;
    to: number;
    games: number;
    meanPredicted: number;
    actualWinrate: number;
};

export type AccuracyStats = {
    // Games with a win or loss marked; remakes and unmarked games are left out.
    games: number;
    wins: number;
    meanPredicted: number;
    // Games where the prediction picked a side, and how often that side won.
    favouriteGames: number;
    favouriteWins: number;
    favouriteAccuracy: number;
    // 95% margin of error on favouriteAccuracy.
    favouriteMargin: number;
    // Mean squared error of the predicted winrate; always guessing 50% scores 0.25, lower is better.
    brierScore: number;
    buckets: CalibrationBucket[];
};

export function getAccuracyStats(records: GameRecord[]): AccuracyStats {
    const decided = records.filter(
        (r) => r.result === "win" || r.result === "loss",
    );
    const won = (r: GameRecord) => (r.result === "win" ? 1 : 0);

    const favourites = decided.filter((r) => r.predictedWinrate !== 0.5);
    const favouriteWins = favourites.filter(
        (r) => r.predictedWinrate > 0.5 === (r.result === "win"),
    ).length;
    const favouriteAccuracy = favourites.length
        ? favouriteWins / favourites.length
        : 0;

    const buckets: CalibrationBucket[] = [];
    for (let i = 0; i < BUCKET_EDGES.length - 1; i++) {
        const from = BUCKET_EDGES[i];
        const to = BUCKET_EDGES[i + 1];
        const games = decided.filter(
            (r) =>
                r.predictedWinrate >= from &&
                (r.predictedWinrate < to ||
                    (to === 1 && r.predictedWinrate === 1)),
        );

        buckets.push({
            from,
            to,
            games: games.length,
            meanPredicted: mean(games.map((r) => r.predictedWinrate)),
            actualWinrate: mean(games.map(won)),
        });
    }

    return {
        games: decided.length,
        wins: decided.filter((r) => r.result === "win").length,
        meanPredicted: mean(decided.map((r) => r.predictedWinrate)),
        favouriteGames: favourites.length,
        favouriteWins,
        favouriteAccuracy,
        favouriteMargin: favourites.length
            ? 1.96 *
              Math.sqrt(
                  (favouriteAccuracy * (1 - favouriteAccuracy)) /
                      favourites.length,
              )
            : 0,
        brierScore: mean(
            decided.map((r) => (r.predictedWinrate - won(r)) ** 2),
        ),
        buckets,
    };
}

function mean(values: number[]) {
    return values.length
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : 0;
}
