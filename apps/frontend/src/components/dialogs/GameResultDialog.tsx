import { Component, Show } from "solid-js";
import { useGameHistory } from "../../contexts/GameHistoryContext";
import { formatPercentage } from "../../utils/rating";
import { Button } from "../common/Button";
import { ChampionIcon } from "../icons/ChampionIcon";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../common/Dialog";

// Asks for the result as soon as the client reaches the end of game screen.
export const GameResultDialog: Component = () => {
    const { promptRecord, setResult, dismissPrompt } = useGameHistory();

    return (
        <Dialog
            open={promptRecord() !== undefined}
            onOpenChange={(open) => !open && dismissPrompt()}
        >
            <Show when={promptRecord()}>
                {(record) => (
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>How did the game go?</DialogTitle>
                        </DialogHeader>
                        <div class="flex items-center gap-3">
                            <Show when={record().yourPick}>
                                <ChampionIcon
                                    championKey={record().yourPick!.championKey}
                                    size={48}
                                />
                            </Show>
                            <p class="text-xl uppercase text-neutral-300">
                                Predicted{" "}
                                {formatPercentage(record().predictedWinrate, 1)}
                                % to win
                            </p>
                        </div>
                        <p class="text-neutral-400">
                            Marking results builds up the accuracy stats in the
                            Games tab. You can also mark it there later.
                        </p>
                        <DialogFooter>
                            <Button
                                variant="transparent"
                                onClick={dismissPrompt}
                            >
                                Later
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setResult(record().id, "remake")}
                            >
                                Remake
                            </Button>
                            <Button
                                variant="secondary"
                                onClick={() => setResult(record().id, "loss")}
                            >
                                Loss
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => setResult(record().id, "win")}
                            >
                                Win
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                )}
            </Show>
        </Dialog>
    );
};
