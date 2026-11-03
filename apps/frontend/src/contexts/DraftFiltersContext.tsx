import {
    JSXElement,
    batch,
    createContext,
    createEffect,
    createSignal,
    on,
    useContext,
} from "solid-js";
import { Role } from "@draftgap/core/src/models/Role";
import { useUser } from "./UserContext";

export function createDraftFiltersContext() {
    const { config } = useUser();

    const [search, setSearch] = createSignal("");
    const [roleFilter, setRoleFilter] = createSignal<Role>();

    // In pool-only mode the favourite filter starts on and resets back to on.
    const [favouriteFilter, setFavouriteFilter] = createSignal(
        config.poolOnlyMode,
    );
    createEffect(
        on(
            () => config.poolOnlyMode,
            (poolOnlyMode) => setFavouriteFilter(poolOnlyMode),
            { defer: true },
        ),
    );

    function resetDraftFilters() {
        batch(() => {
            setSearch("");
            setRoleFilter(undefined);
            setFavouriteFilter(config.poolOnlyMode);
        });
    }

    return {
        search,
        setSearch,
        roleFilter,
        setRoleFilter,
        favouriteFilter,
        setFavouriteFilter,
        resetDraftFilters,
    };
}

export const DraftFiltersContext =
    createContext<ReturnType<typeof createDraftFiltersContext>>(undefined);

export function DraftFiltersProvider(props: { children: JSXElement }) {
    const ctx = createDraftFiltersContext();

    return (
        <DraftFiltersContext.Provider value={ctx}>
            {props.children}
        </DraftFiltersContext.Provider>
    );
}

export function useDraftFilters() {
    const useCtx = useContext(DraftFiltersContext);
    if (!useCtx) throw new Error("No DraftFiltersContext found");

    return useCtx;
}
