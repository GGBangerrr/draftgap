import { Role } from "../models/Role";

export type GameResult = "win" | "loss" | "remake";

export type GameRecordPick = {
    championKey: string;
    role: Role;
};

// One played game: the draft and the prediction at the moment it started, and the result marked afterwards.
export type GameRecord = {
    // The client's game id, so the same game is never recorded twice.
    id: string;
    // When the game started (ISO timestamp).
    date: string;
    // Dataset patch the prediction was made with.
    patch: string;
    queueId: number | undefined;
    queueName: string | undefined;
    allyTeam: GameRecordPick[];
    opponentTeam: GameRecordPick[];
    bans: string[];
    yourPick: GameRecordPick | undefined;
    // Predicted chance your team wins, from the full draft.
    predictedWinrate: number;
    // Your champion's summed matchup rating against its lane opponents.
    laneRating: number | undefined;
    result: GameResult | undefined;
};
