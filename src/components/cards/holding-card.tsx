import type { ItemQuality } from "@/types/bundles";
import type { Holding } from "@/lib/networth";

import ItemWithOverlay from "@/components/ui/item-with-overlay";
import { deweaponize } from "@/lib/utils";

interface Props {
	holding: Holding;
}

const qualityLabels: Record<string, string> = {
	"1": "Silver",
	"2": "Gold",
	"4": "Iridium",
};

// The save stores iridium quality as 4, but the quality-star overlay keys it as
// "3" (common → iridium = 0 → 3). Translate for display.
function toOverlayQuality(quality: string): ItemQuality {
	if (quality === "4") return "3";
	if (quality === "1" || quality === "2") return quality;
	return "0";
}

export const HoldingCard = ({ holding }: Props) => {
	const { itemID, name, quality, quantity, unitValue, value } = holding;

	const dw = deweaponize(itemID);
	const iconURL =
		dw.key === "BC"
			? `https://cdn.stardew.app/images/(BC)${dw.value}.webp`
			: `https://cdn.stardew.app/images/(O)${itemID}.webp`;

	const qualityLabel = qualityLabels[quality];
	const priced = unitValue > 0;

	const subtitle = priced
		? `${quantity.toLocaleString()} × ${unitValue.toLocaleString()}g`
		: `${quantity.toLocaleString()} held`;

	return (
		<div className="relative flex select-none items-center justify-between rounded-lg border border-neutral-200 bg-white px-5 py-4 text-left text-neutral-950 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50">
			<div className="flex min-w-0 items-center space-x-3 truncate text-left">
				<ItemWithOverlay
					src={iconURL}
					alt={name}
					quality={toOverlayQuality(quality)}
					width={32}
					height={32}
				/>
				<div className="min-w-0 flex-1 pr-3">
					<p className="truncate font-medium">
						{name}
						{qualityLabel ? (
							<span className="text-neutral-500 dark:text-neutral-400">
								{" "}
								· {qualityLabel}
							</span>
						) : null}
					</p>
					<p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
						{subtitle}
					</p>
				</div>
			</div>
			<p className="flex-shrink-0 font-semibold tabular-nums">
				{priced ? (
					<>
						{value.toLocaleString()}
						<span className="text-yellow-600 dark:text-yellow-500">g</span>
					</>
				) : (
					<span className="text-neutral-400 dark:text-neutral-600">—</span>
				)}
			</p>
		</div>
	);
};
