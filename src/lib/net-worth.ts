import type {
	ItemRecord,
	ItemSourceType,
	ItemsRet,
} from "@/lib/parsers/items";

// sell price = floor(basePrice * multiplier), per StardewValley.Object.sellToStorePrice
const QUALITY_MULTIPLIERS: Record<number, number> = {
	0: 1, // normal
	1: 1.25, // silver
	2: 1.5, // gold
	4: 2, // iridium
};

export interface NetWorthBreakdown {
	total: number; // wallet + itemsValue
	wallet: number;
	itemsValue: number;
	bySource: Partial<Record<ItemSourceType, number>>;
	pricedCount: number; // item records that contributed value
	unpricedCount: number; // records with no usable price (tools, weapons, hats...)
}

/**
 * Value of a single item record based on the save file's base price.
 * Items whose price isn't stored in the save (tools, weapons, most equipment)
 * count as 0 until valuation falls back to the game data price tables.
 */
export function itemValue(item: ItemRecord): number {
	if (typeof item.basePrice !== "number" || item.basePrice <= 0) return 0;
	const multiplier = QUALITY_MULTIPLIERS[item.quality] ?? 1;
	return Math.floor(item.basePrice * multiplier) * item.stack;
}

/**
 * Net worth of the save: current gold plus the sell value of every item
 * found anywhere — inventory, chests, fridges, in-progress machine contents,
 * placed objects, the lot.
 */
export function calculateNetWorth(items: ItemsRet): NetWorthBreakdown {
	const bySource: Partial<Record<ItemSourceType, number>> = {};
	let itemsValue = 0;
	let pricedCount = 0;
	let unpricedCount = 0;

	for (const record of [...items.player, ...items.world]) {
		const value = itemValue(record);
		if (value > 0) {
			itemsValue += value;
			bySource[record.source] = (bySource[record.source] ?? 0) + value;
			pricedCount++;
		} else {
			unpricedCount++;
		}
	}

	return {
		total: items.money.current + itemsValue,
		wallet: items.money.current,
		itemsValue,
		bySource,
		pricedCount,
		unpricedCount,
	};
}
