import { JSXElement, createContext, createMemo, useContext } from "solid-js";
import { getSuggestions } from "@draftgap/core/src/draft/suggestions";
import { deviationsByBlindPickCaution } from "@draftgap/core/src/risk/blind-pick-caution";
import { useDraftAnalysis } from "./DraftAnalysisContext";
import { useDataset } from "./DatasetContext";
import { useDraft } from "./DraftContext";
import { useUser } from "./UserContext";

export function createDraftSuggestionsContext() {
    const { isLoaded, dataset, dataset30Days } = useDataset();
    const { draftAnalysisConfig, allyTeamComp, opponentTeamComp } =
        useDraftAnalysis();
    const { bans } = useDraft();
    const { config } = useUser();

    const suggestionsConfig = () => ({
        ...draftAnalysisConfig(),
        blindPickDeviations:
            deviationsByBlindPickCaution[config.blindPickCaution],
    });

    const allySuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            allyTeamComp(),
            opponentTeamComp(),
            suggestionsConfig(),
            [...bans],
        );
    });

    const opponentSuggestions = createMemo(() => {
        if (!isLoaded()) return [];

        return getSuggestions(
            dataset()!,
            dataset30Days()!,
            opponentTeamComp(),
            allyTeamComp(),
            suggestionsConfig(),
            [...bans],
        );
    });

    return { allySuggestions, opponentSuggestions };
}

export const DraftSuggestionsContext =
    createContext<ReturnType<typeof createDraftSuggestionsContext>>();

export function DraftSuggestionsProvider(props: { children: JSXElement }) {
    return (
        <DraftSuggestionsContext.Provider
            value={createDraftSuggestionsContext()}
        >
            {props.children}
        </DraftSuggestionsContext.Provider>
    );
}

export function useDraftSuggestions() {
    const useCtx = useContext(DraftSuggestionsContext);
    if (!useCtx) throw new Error("No DraftSuggestionsContext found");

    return useCtx;
}
