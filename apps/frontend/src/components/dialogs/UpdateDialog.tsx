import { Component, createSignal, onMount } from "solid-js";
import { check, Update } from "@tauri-apps/plugin-updater";
import { Button } from "../common/Button";
import { useMedia } from "../../hooks/useMedia";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../common/Dialog";

const DISMISSED_UPDATE_KEY = "draftgap-dismissed-upstream-version";

// This is a fork, so official updates are never installed: that would replace the fork's features.
// It still checks the official release feed and says when upstream has a new version worth merging.
export const UpdateDialog: Component = () => {
    const { isDesktop } = useMedia();
    const [isOpen, setIsOpen] = createSignal(false);
    const [update, setUpdate] = createSignal<Update | null>(null);

    onMount(async () => {
        if (!isDesktop) return;

        try {
            const update = await check();
            if (
                update &&
                localStorage.getItem(DISMISSED_UPDATE_KEY) !== update.version
            ) {
                console.log("Upstream update available:", update);
                setUpdate(update);
                setIsOpen(true);
            }
        } catch (e) {
            console.warn("Could not check for upstream updates", e);
        }
    });

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISSED_UPDATE_KEY, update()!.version);
        } catch {
            // Not remembering the dismissal only means the notice shows again.
        }
        setIsOpen(false);
    };

    return (
        <Dialog open={isOpen()} onOpenChange={(open) => !open && dismiss()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New DraftGap version</DialogTitle>
                </DialogHeader>
                <p class="text-xl uppercase text-neutral-300">
                    DraftGap {update()?.version} is out. This fork is based on{" "}
                    {update()?.currentVersion}.
                </p>
                <p class="text-neutral-400">
                    Updates are not installed automatically, since that would
                    replace this fork. Merge the new upstream main into the fork
                    and rebuild to get it.
                </p>
                <DialogFooter>
                    <Button variant="primary" onClick={dismiss}>
                        Got it
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
