import { itemValue } from "@/lib/net-worth";
import { weeklyContribution } from "@/lib/weekly-income";
import type { ItemRecord, ItemsRet } from "@/lib/parsers/items";

export interface BreakdownRow {
	name: string;
	count: number; // total units across all stacks
	location: string; // specific spot inside the region ("Cellar", "Big Shed", "Inventory")
	value: number; // contribution to net worth
	weekly: number; // contribution to estimated weekly income
}

export interface RegionBreakdown {
	region: string; // "The Farm", "Ginger Island", "The Valley", "On your person"
	value: number;
	weekly: number;
	rows: BreakdownRow[]; // sorted by value, largest first
}

const FARM_LOCATIONS = new Set([
	"Farm",
	"FarmHouse",
	"Greenhouse",
	"Cellar",
	"FarmCave",
]);

function regionOf(record: ItemRecord): string {
	const loc = record.location;
	if (loc === "player") return "On your person";
	if (loc.startsWith("Island") || loc === "Caldera" || loc === "CaptainRoom")
		return "Ginger Island";
	if (FARM_LOCATIONS.has(loc) || loc.startsWith("Farm > ")) return "The Farm";
	return "The Valley";
}

function locationLabel(record: ItemRecord): string {
	if (record.location === "player") {
		return record.source === "equipment" ? "Equipped" : "Inventory";
	}
	// inside The Farm region the "Farm > " prefix is redundant
	if (record.location.startsWith("Farm > ")) {
		return record.location.slice("Farm > ".length);
	}
	return record.location;
}

/**
 * Everything contributing to net worth or weekly income, aggregated per item
 * per spot and grouped into the game's broad regions. Records contributing
 * nothing (unpriced tools, idle machines) are left out.
 */
export function buildBreakdown(items: ItemsRet): RegionBreakdown[] {
	const regions = new Map<
		string,
		{ value: number; weekly: number; rows: Map<string, BreakdownRow> }
	>();

	for (const record of [...items.player, ...items.world]) {
		const value = itemValue(record);
		const weekly = weeklyContribution(record);
		if (value === 0 && weekly === 0) continue;

		const regionName = regionOf(record);
		let region = regions.get(regionName);
		if (!region) {
			region = { value: 0, weekly: 0, rows: new Map() };
			regions.set(regionName, region);
		}

		region.value += value;
		region.weekly += weekly;

		const location = locationLabel(record);
		const key = `${record.name}|${location}`;
		const row = region.rows.get(key);
		if (row) {
			row.count += record.stack;
			row.value += value;
			row.weekly += weekly;
		} else {
			region.rows.set(key, {
				name: record.name,
				count: record.stack,
				location,
				value,
				weekly,
			});
		}
	}

	return Array.from(regions.entries())
		.map(([region, data]) => ({
			region,
			value: data.value,
			weekly: data.weekly,
			rows: Array.from(data.rows.values()).sort(
				(a, b) => b.value - a.value || b.weekly - a.weekly,
			),
		}))
		.sort((a, b) => b.value - a.value);
}
