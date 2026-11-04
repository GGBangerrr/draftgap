import { formatRatingDelta, getRatingClass } from "../../utils/rating";
import { cn } from "../../utils/style";

// A rating difference shown as signed winrate points, coloured like winrates.
export function DeltaText(props: { rating: number; class?: string }) {
    return (
        <span
            class={cn(getRatingClass(props.rating), props.class)}
            style={{ "font-variant-numeric": "tabular-nums" }}
        >
            {formatRatingDelta(props.rating)}
        </span>
    );
}
