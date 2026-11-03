export const BlindPickCaution = ["off", "low", "medium", "high"] as const;

export type BlindPickCaution = (typeof BlindPickCaution)[number];

export const displayNameByBlindPickCaution: Record<BlindPickCaution, string> = {
    off: "Off",
    low: "Low",
    medium: "Medium",
    high: "High",
};

// How many standard deviations of the unrevealed matchups are subtracted from the safe rating.
export const deviationsByBlindPickCaution: Record<BlindPickCaution, number> = {
    off: 0,
    low: 0.5,
    medium: 1,
    high: 1.5,
};
