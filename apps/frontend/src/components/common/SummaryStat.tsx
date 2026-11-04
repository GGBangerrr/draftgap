import { JSX, Show } from "solid-js";
import { tooltip } from "../../directives/tooltip";
// eslint-disable-next-line
tooltip;

// Directives only work on native elements, so this mirrors Panel's styling on a div.
export function SummaryStat(props: {
    title: string;
    value: JSX.Element;
    detail?: JSX.Element;
    tooltip: string;
}) {
    return (
        <div
            class="rounded-md bg-primary p-4"
            // @ts-ignore
            use:tooltip={{ content: props.tooltip }}
        >
            <div class="text-lg text-neutral-400 uppercase">{props.title}</div>
            <div class="text-3xl -mt-1">{props.value}</div>
            <Show when={props.detail}>
                <div class="text-sm text-neutral-400 uppercase">
                    {props.detail}
                </div>
            </Show>
        </div>
    );
}
