import big_craftables from "@/data/big_craftables.json";
import objects from "@/data/objects.json";

import type { ItemsRet } from "./parsers/items";
import { deweaponize } from "./utils";

/*
	Net worth helper.

	Consumes the aggregated owned-items map produced by `parseItems` (keyed by
	`${itemID}_${quality}`) plus the player's current gold and returns a single
	gold value.

	Item base prices come from objects.json / big_craftables.json. These are only
	populated once those data files are regenerated with the `price` field (see
	scripts/objects.py + scripts/bigcraftables.py); until then prices resolve to 0
	and net worth is effectively just the current gold, so this stays safe to use.
*/

// price is optional because the data files may predate the price regeneration
const OBJECTS = objects as Record<string, { price?: number }>;
const BIG_CRAFTABLES = big_craftables as Record<string, { price?: number }>;

// Sell-price multipliers by quality: normal / silver / gold / iridium.
// Matches the quality codes used in src/components/ui/item-with-overlay.tsx.
const QUALITY_MULTIPLIERS: Record<string, number> = {
	"0": 1,
	"1": 1.25,
	"2": 1.5,
	"4": 2,
};

/**
 * Base (normal-quality) sell price for an owned item id. Item ids are plain
 * numeric strings for objects and `(BC)<id>` for big craftables, matching the
 * keys produced by `parseItems`.
 */
export function getItemBasePrice(itemID: string): number {
	const { key, value } = deweaponize(itemID);
	if (key === "BC") return BIG_CRAFTABLES[value]?.price ?? 0;
	return OBJECTS[itemID]?.price ?? 0;
}

/** A single owned-item line in the holdings breakdown. */
export interface Holding {
	itemID: string; // "(BC)<id>" for big craftables, plain numeric string otherwise
	name: string; // display name from the save (already flavored, e.g. "Starfruit Wine")
	quality: string; // "0" | "1" | "2" | "4"
	quantity: number;
	unitValue: number; // sell value of one item at this quality (0 if price unknown)
	value: number; // unitValue * quantity
}

export interface NetWorthBreakdown {
	holdings: Holding[]; // sorted by value desc, then quantity desc
	itemsValue: number; // total sell value of all owned items
	totalQuantity: number; // total number of items held
	distinctCount: number; // number of distinct item+quality stacks
	pricedCount: number; // how many holdings have a known (> 0) price
}

/**
 * Break an owned-items map into per-item holdings plus rolled-up totals. Used by
 * both the net worth figure and the holdings list.
 */
export function computeHoldings(
	items: ItemsRet | undefined,
): NetWorthBreakdown {
	const holdings: Holding[] = [];
	let itemsValue = 0;
	let totalQuantity = 0;
	let pricedCount = 0;

	if (items?.items) {
		for (const stack of Object.values(items.items)) {
			const { itemID, name, quality, quantity, price } = stack;
			if (!quantity || quantity <= 0) continue;

			const multiplier = QUALITY_MULTIPLIERS[quality] ?? 1;
			const unitValue = price > 0 ? Math.floor(price * multiplier) : 0;
			const value = unitValue * quantity;

			if (unitValue > 0) pricedCount++;
			itemsValue += value;
			totalQuantity += quantity;

			holdings.push({ itemID, name, quality, quantity, unitValue, value });
		}
	}

	holdings.sort((a, b) => b.value - a.value || b.quantity - a.quantity);

	return {
		holdings,
		itemsValue,
		totalQuantity,
		distinctCount: holdings.length,
		pricedCount,
	};
}

/**
 * Compute a player's net worth: current gold plus the sell value of every owned
 * item (inventory + storage), accounting for quality multipliers.
 */
export function computeNetWorth(
	items: ItemsRet | undefined,
	money: number = 0,
): number {
	return (money || 0) + computeHoldings(items).itemsValue;
}
