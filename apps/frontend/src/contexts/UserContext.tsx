import {
    JSXElement,
    batch,
    createContext,
    createEffect,
    createSignal,
    onMount,
    useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { Role } from "@draftgap/core/src/models/Role";
import { DraftGapConfig } from "@draftgap/core/src/models/user/Config";

type FavouritePick = `${string}:${Role}`;

const DEFAULT_CONFIG: DraftGapConfig = {
    // DRAFT CONFIG
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 1000,
    blindPickCaution: "medium",

    // UI
    showFavouritesAtTop: false,
    poolOnlyMode: false,
    banPlacement: "bottom",
    unownedPlacement: "bottom",
    showAdvancedWinrates: false,
    language: "en_US",

    // MISC
    defaultStatsSite: "lolalytics",
    enableBetaFeatures: false,

    // LOL CLIENT
    disableLeagueClientIntegration: false,
};

const FAVOURITE_PICKS_KEY = "draftgap-favourite-picks";
const CORE_PICKS_KEY = "draftgap-core-picks";
const PRIME_PICKS_KEY = "draftgap-prime-picks";
const SWAPS_KEY = "draftgap-pool-swaps";
const CONFIG_KEY = "draftgap-config";

function createConfig() {
    const partialInitialConfig = JSON.parse(
        localStorage.getItem(CONFIG_KEY) || "{}",
    );

    const [config, setConfig] = createStore<DraftGapConfig>({
        ...DEFAULT_CONFIG,
        ...partialInitialConfig,
    });
    createEffect(() => {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    });

    return [config, setConfig] as const;
}

function createPickSet(key: string) {
    const initial = JSON.parse(localStorage.getItem(key) || "[]");

    const [picks, setPicks] = createSignal<Set<FavouritePick>>(
        new Set(initial),
    );
    createEffect(() => {
        localStorage.setItem(key, JSON.stringify([...picks()]));
    });

    return [picks, setPicks] as const;
}

type PickSet = ReturnType<typeof createPickSet>;

// Substitute pick -> the prime pick it replaced for the current patch.
type SwapMap = Record<FavouritePick, FavouritePick>;

function createSwapMap(key: string) {
    const initial = JSON.parse(localStorage.getItem(key) || "{}");

    const [swaps, setSwaps] = createSignal<SwapMap>(initial);
    createEffect(() => {
        localStorage.setItem(key, JSON.stringify(swaps()));
    });

    return [swaps, setSwaps] as const;
}

type UserSettingsFile = {
    config?: Partial<DraftGapConfig>;
    favouritePicks?: FavouritePick[];
    corePicks?: FavouritePick[];
    primePicks?: FavouritePick[];
    swaps?: SwapMap;
};

type UserStores = {
    config: DraftGapConfig;
    setConfig: (config: DraftGapConfig) => void;
    favourites: PickSet;
    core: PickSet;
    prime: PickSet;
    swaps: ReturnType<typeof createSwapMap>;
};

// WebView2 can drop recent localStorage writes when the app closes, so the desktop app
// also keeps favourites and config in a file. The first run copies localStorage into it.
function syncWithSettingsFile(stores: UserStores) {
    if (!isTauri()) return;

    // Saving waits for a successful load, so a failed read can never overwrite the file.
    const [isLoaded, setIsLoaded] = createSignal(false);

    onMount(async () => {
        try {
            const contents = await invoke<string | null>("load_user_settings");
            if (contents) {
                const saved = JSON.parse(contents) as UserSettingsFile;
                batch(() => {
                    if (saved.config) {
                        stores.setConfig({
                            ...DEFAULT_CONFIG,
                            ...saved.config,
                        });
                    }
                    if (saved.favouritePicks) {
                        stores.favourites[1](new Set(saved.favouritePicks));
                    }
                    if (saved.corePicks) {
                        stores.core[1](new Set(saved.corePicks));
                    }
                    if (saved.primePicks) {
                        stores.prime[1](new Set(saved.primePicks));
                    }
                    if (saved.swaps) {
                        stores.swaps[1](saved.swaps);
                    }
                });
            }
            setIsLoaded(true);
        } catch (e) {
            console.error("Could not load user settings", e);
        }
    });

    createEffect(() => {
        const contents = JSON.stringify({
            config: stores.config,
            favouritePicks: [...stores.favourites[0]()],
            corePicks: [...stores.core[0]()],
            primePicks: [...stores.prime[0]()],
            swaps: stores.swaps[0](),
        } satisfies UserSettingsFile);
        if (!isLoaded()) return;

        invoke("save_user_settings", { contents }).catch((e) =>
            console.error("Could not save user settings", e),
        );
    });
}

const pickOf = (championKey: string, role: Role): FavouritePick =>
    `${championKey}:${role}`;
const championOf = (pick: FavouritePick) => pick.split(":")[0];
const isRole = (pick: FavouritePick, role: Role) => pick.endsWith(`:${role}`);

function createUserContext() {
    const [config, setConfig] = createConfig();
    // The pool you play right now (the patch pool); pool-only mode and the Pool tab use it.
    const favourites = createPickSet(FAVOURITE_PICKS_KEY);
    // Locked picks are never suggested for replacement.
    const core = createPickSet(CORE_PICKS_KEY);
    // The long-term pool that patch swaps are measured against and can return to.
    const prime = createPickSet(PRIME_PICKS_KEY);
    const swaps = createSwapMap(SWAPS_KEY);
    syncWithSettingsFile({ config, setConfig, favourites, core, prime, swaps });

    const [favouritePicks, setFavouritePicks] = favourites;
    const [corePicks, setCorePicks] = core;
    const [primePicks, setPrimePicks] = prime;
    const [swapMap, setSwapMap] = swaps;

    const withoutRole = (picks: Set<FavouritePick>, role: Role) =>
        [...picks].filter((pick) => !isRole(pick, role));

    function updatePickSet(
        [picks, setPicks]: PickSet,
        championKey: string,
        role: Role,
        value: boolean,
    ) {
        const pick: FavouritePick = `${championKey}:${role}`;
        const next = new Set(picks());

        if (value) {
            next.add(pick);
        } else {
            next.delete(pick);
        }

        setPicks(next);
    }

    function removeSwap(pick: FavouritePick) {
        if (!(pick in swapMap())) return;
        const next = { ...swapMap() };
        delete next[pick];
        setSwapMap(next);
    }

    function setFavourite(championKey: string, role: Role, value: boolean) {
        batch(() => {
            updatePickSet(favourites, championKey, role, value);
            // A champion leaving the pool stops being locked or a substitute too.
            if (!value) {
                updatePickSet(core, championKey, role, false);
                removeSwap(pickOf(championKey, role));
            }
        });
    }

    function setCore(championKey: string, role: Role, value: boolean) {
        updatePickSet(core, championKey, role, value);
    }

    const isFavourite = (championKey: string, role: Role) =>
        favouritePicks().has(pickOf(championKey, role));

    const isCore = (championKey: string, role: Role) =>
        corePicks().has(pickOf(championKey, role));

    const primePool = (role: Role) =>
        [...primePicks()].filter((p) => isRole(p, role)).map(championOf);

    // The prime champion a patch pick stands in for, if it is a substitute.
    const swapFor = (championKey: string, role: Role) => {
        const replaced = swapMap()[pickOf(championKey, role)];
        return replaced ? championOf(replaced) : undefined;
    };

    // Replaces a pool champion and remembers which prime champion the newcomer stands in for.
    function substitute(outKey: string, inKey: string, role: Role) {
        const out = pickOf(outKey, role);
        const incoming = pickOf(inKey, role);
        const replacedPrime =
            swapMap()[out] ?? (primePicks().has(out) ? out : undefined);

        batch(() => {
            const next = { ...swapMap() };
            delete next[out];
            // Swapping the prime champion itself back in needs no link.
            if (replacedPrime && replacedPrime !== incoming) {
                next[incoming] = replacedPrime;
            }
            setSwapMap(next);

            updatePickSet(favourites, outKey, role, false);
            updatePickSet(core, outKey, role, false);
            updatePickSet(favourites, inKey, role, true);
        });
    }

    function swapBack(substituteKey: string, role: Role) {
        const primeKey = swapFor(substituteKey, role);
        if (primeKey) substitute(substituteKey, primeKey, role);
    }

    function clearSwaps(role: Role) {
        setSwapMap(
            Object.fromEntries(
                Object.entries(swapMap()).filter(
                    ([pick]) => !isRole(pick as FavouritePick, role),
                ),
            ) as SwapMap,
        );
    }

    // Makes the current pool for this role the new prime pool.
    function savePrime(role: Role) {
        batch(() => {
            setPrimePicks(
                new Set([
                    ...withoutRole(primePicks(), role),
                    ...[...favouritePicks()].filter((p) => isRole(p, role)),
                ]),
            );
            clearSwaps(role);
        });
    }

    // Puts the prime pool for this role back, undoing every patch swap.
    function resetToPrime(role: Role) {
        const rolePrime = [...primePicks()].filter((p) => isRole(p, role));
        batch(() => {
            setFavouritePicks(
                new Set([...withoutRole(favouritePicks(), role), ...rolePrime]),
            );
            setCorePicks(
                new Set(
                    [...corePicks()].filter(
                        (p) => !isRole(p, role) || rolePrime.includes(p),
                    ),
                ),
            );
            clearSwaps(role);
        });
    }

    return {
        config,
        setConfig,
        favouritePicks,
        setFavourite,
        isFavourite,
        setCore,
        isCore,
        primePool,
        swapFor,
        substitute,
        swapBack,
        savePrime,
        resetToPrime,
    };
}

const UserContext =
    createContext<ReturnType<typeof createUserContext>>(undefined);

export function UserProvider(props: { children: JSXElement }) {
    const ctx = createUserContext();

    return (
        <UserContext.Provider value={ctx}>
            {props.children}
        </UserContext.Provider>
    );
}

export function useUser() {
    const useCtx = useContext(UserContext);
    if (!useCtx) throw new Error("No UserContext found");

    return useCtx;
}
