import { itemValue } from "@/lib/net-worth";
import type { ItemRecord, ItemsRet } from "@/lib/parsers/items";

// the game quotes machine processing in in-game minutes; 1600 minutes = 1 day
const MINUTES_PER_DAY = 1600;
const DAYS_PER_WEEK = 7;

// aging casks park minutesUntilReady at 999999 and count daysToMature instead
const CASK_SENTINEL_MINUTES = 999999;

export interface WeeklyIncomeEstimate {
	total: number; // average gold per in-game week from everything currently producing
	hasTimingData: boolean; // false when machine records predate timing capture (re-upload needed)
}

/**
 * Average weekly income one record represents. Output that is ready (or ready
 * within the week) counts in full; longer-running production is amortized, so
 * a cask 21 days from maturity contributes a third of its finished value per
 * week. Casks are valued at the iridium price they finish at.
 */
export function weeklyContribution(record: ItemRecord): number {
	// collected output waiting to be picked up
	if (record.source === "autoGrabber" || record.source === "fishPond") {
		return itemValue(record);
	}

	if (record.source !== "machine") return 0;

	// casks: amortize toward the iridium (2x base) value they mature at
	if (record.daysToMature !== undefined) {
		if (record.readyForHarvest || record.daysToMature <= 0) {
			return itemValue(record);
		}
		if (typeof record.basePrice !== "number" || record.basePrice <= 0) return 0;
		const rate =
			record.agingRate && record.agingRate > 0 ? record.agingRate : 1;
		const daysRemaining = record.daysToMature / rate;
		const iridiumValue = Math.floor(record.basePrice * 2) * record.stack;
		return Math.floor(iridiumValue * Math.min(1, DAYS_PER_WEEK / daysRemaining));
	}

	if (record.readyForHarvest) return itemValue(record);

	if (
		record.minutesUntilReady === undefined ||
		record.minutesUntilReady === CASK_SENTINEL_MINUTES
	) {
		return 0;
	}

	if (record.minutesUntilReady <= 0) return itemValue(record);

	const daysRemaining = record.minutesUntilReady / MINUTES_PER_DAY;
	return Math.floor(
		itemValue(record) * Math.min(1, DAYS_PER_WEEK / daysRemaining),
	);
}

/**
 * Estimated weekly income of the save: the per-week rate implied by everything
 * currently in production — machine output, aging casks, auto-grabbers, fish
 * ponds. Crops in the ground and animal produce need game data the save
 * doesn't store, so they aren't estimated yet.
 */
export function estimateWeeklyIncome(items: ItemsRet): WeeklyIncomeEstimate {
	let total = 0;
	let machineRecords = 0;
	let timedRecords = 0;

	for (const record of items.world) {
		total += weeklyContribution(record);

		if (record.source === "machine") {
			machineRecords++;
			if (
				record.minutesUntilReady !== undefined ||
				record.daysToMature !== undefined ||
				record.readyForHarvest
			) {
				timedRecords++;
			}
		}
	}

	return {
		total,
		hasTimingData: machineRecords === 0 || timedRecords > 0,
	};
}
