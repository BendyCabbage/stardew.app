import { GetListOrEmpty, deweaponize } from "@/lib/utils";

/**
 * Where an item was found in the save file. This lets a future net worth
 * feature decide which sources count (e.g. exclude "placed" machines, or
 * discount in-progress "machine" contents).
 */
export type ItemSourceType =
	| "inventory" // player.items slots
	| "equipment" // hat/boots/rings/shirt/pants (+ 1.6 trinket)
	| "chest" // placed Chest contents (incl. Big Chest, Junimo Chest)
	| "fridge" // kitchen fridge contents + Mini-Fridge contents
	| "autoGrabber" // items collected by an Auto-Grabber
	| "machine" // in-progress product held by a machine (Keg, Cask, ...)
	| "buildingChest" // Mill/Junimo Hut input/output chests
	| "fishPond" // accumulated FishPond output
	| "dresser" // StorageFurniture (dresser) contents
	| "fishTank" // FishTankFurniture contents
	| "placed"; // the placed world object/furniture itself (keg, sprinkler, forage, table)

export type EquipmentSlot =
	| "hat"
	| "boots"
	| "leftRing"
	| "rightRing"
	| "shirt"
	| "pants"
	| "trinket";

export interface ItemRecord {
	itemId: string; // unqualified item ID ("613"), or "" when the save has none (1.5 tools)
	name: string;
	type: string; // xsi:type of the item ("Object", "Cask", "Ring", "Furniture", ...)
	stack: number;
	quality: number; // 0 = normal, 1 = silver, 2 = gold, 4 = iridium
	category?: number;
	basePrice?: number; // the save's <price> — base price only, NOT the quality-adjusted sell value
	bigCraftable?: boolean; // only set when true
	source: ItemSourceType;
	location: string; // "Farm", "FarmHouse", "Farm > Shed", "player", ...
	container?: string; // enclosing container/machine name: "Chest", "Keg", "Auto-Grabber"
	slot?: EquipmentSlot; // only for source === "equipment"
	// timing fields from the parent machine, only on source === "machine".
	// Casks use daysToMature/agingRate (their minutesUntilReady is a 999999
	// sentinel while aging); other machines count down minutesUntilReady.
	minutesUntilReady?: number;
	readyForHarvest?: boolean; // only set when true
	daysToMature?: number;
	agingRate?: number;
}

export interface MoneyRet {
	current: number; // this farmer's wallet (host wallet when wallets are shared)
	totalEarned: number;
	useSeparateWallets: boolean;
}

export interface ItemsRet {
	money: MoneyRet;
	player: ItemRecord[]; // this farmer's inventory + equipment
	world: ItemRecord[]; // shared world items — identical on every player, like walnuts
}

/** Context applied to every record a walker emits. */
interface ItemContext {
	source: ItemSourceType;
	location: string;
	container?: string;
	slot?: EquipmentSlot;
	defaultType?: string; // xsi:type fallback for tag-named elements (<Furniture>, <hat>, ...)
}

// fast-xml-parser sometimes yields booleans as the string "true"/"false"
function isTrue(value: any): boolean {
	return value === true || value === "true";
}

/**
 * The single choke point that turns a raw save-file element into an ItemRecord.
 * Returns null for empty slots (`<Item xsi:nil="true" />` parses to an object
 * with no `name`) and for the `[undefined]` entries GetListOrEmpty can yield.
 */
function readItem(
	raw: any,
	prefix: string,
	ctx: ItemContext,
): ItemRecord | null {
	if (!raw || typeof raw !== "object") return null;
	if (raw.name === undefined || raw.name === null) return null;

	// 1.6 items carry a string <itemId> (sometimes qualified like "(O)613");
	// 1.5 items only have <parentSheetIndex>. 1.5 tools have neither.
	let itemId = "";
	if (raw.itemId !== undefined && raw.itemId !== null) {
		itemId = deweaponize(raw.itemId.toString()).value;
	} else if (raw.parentSheetIndex !== undefined) {
		itemId = raw.parentSheetIndex.toString();
	}

	const record: ItemRecord = {
		itemId,
		name: raw.name.toString(),
		type: raw[`@_${prefix}:type`]?.toString() ?? ctx.defaultType ?? "Object",
		stack: Number(raw.stack) || 1,
		quality: Number(raw.quality) || 0,
		source: ctx.source,
		location: ctx.location,
	};

	if (typeof raw.category === "number") record.category = raw.category;
	if (typeof raw.price === "number") record.basePrice = raw.price;
	if (isTrue(raw.bigCraftable)) record.bigCraftable = true;
	if (ctx.container) record.container = ctx.container;
	if (ctx.slot) record.slot = ctx.slot;

	return record;
}

/** Reads a serialized item list like `<items><Item .../><Item .../></items>`. */
function walkItemList(
	wrapper: any, // the element containing <Item> children (e.g. a chest's `items`)
	prefix: string,
	ctx: ItemContext,
): ItemRecord[] {
	const records: ItemRecord[] = [];
	for (const raw of GetListOrEmpty(wrapper, "Item")) {
		const record = readItem(raw, prefix, ctx);
		if (record) records.push(record);
	}
	return records;
}

/** A placed world object: the object itself, chest contents, machine output. */
function walkObject(obj: any, prefix: string, location: string): ItemRecord[] {
	if (!obj || typeof obj !== "object") return [];

	const records: ItemRecord[] = [];
	const type = obj[`@_${prefix}:type`]?.toString() ?? "Object";

	const placed = readItem(obj, prefix, { source: "placed", location });
	if (placed) records.push(placed);

	if (type === "Chest") {
		// Mini-Fridges are Chests flagged with <fridge>true</fridge>
		records.push(
			...walkItemList(obj.items, prefix, {
				source: isTrue(obj.fridge) ? "fridge" : "chest",
				location,
				container: obj.name?.toString(),
			}),
		);
	} else if (obj.heldObject && typeof obj.heldObject === "object") {
		const heldType = obj.heldObject[`@_${prefix}:type`]?.toString();
		if (heldType === "Chest") {
			// Auto-Grabbers hold a Chest of collected items
			records.push(
				...walkItemList(obj.heldObject.items, prefix, {
					source: "autoGrabber",
					location,
					container: obj.name?.toString(),
				}),
			);
		} else {
			// machines (Keg, Cask, Preserves Jar, ...) hold their in-progress product
			const held = readItem(obj.heldObject, prefix, {
				source: "machine",
				location,
				container: obj.name?.toString(),
			});
			if (held) {
				if (typeof obj.minutesUntilReady === "number")
					held.minutesUntilReady = obj.minutesUntilReady;
				if (isTrue(obj.readyForHarvest)) held.readyForHarvest = true;
				if (typeof obj.daysToMature === "number")
					held.daysToMature = obj.daysToMature;
				if (typeof obj.agingRate === "number")
					held.agingRate = obj.agingRate;
				records.push(held);
			}
		}
	}

	return records;
}

/** A placed furniture piece: the piece itself plus dresser/fish tank contents. */
function walkFurniture(
	furn: any,
	prefix: string,
	location: string,
): ItemRecord[] {
	if (!furn || typeof furn !== "object") return [];

	const records: ItemRecord[] = [];
	const type = furn[`@_${prefix}:type`]?.toString() ?? "Furniture";

	const placed = readItem(furn, prefix, {
		source: "placed",
		location,
		defaultType: "Furniture",
	});
	if (placed) records.push(placed);

	const heldCtx: ItemContext = {
		source: type === "FishTankFurniture" ? "fishTank" : "dresser",
		location,
		container: furn.name?.toString(),
	};

	// heldItems serializes two ways: StorageFurniture (dressers) wrap a list
	// (`heldItems.Item[]`), FishTankFurniture repeats sibling <heldItems> elements
	// that each ARE an item.
	for (const entry of GetListOrEmpty(furn, "heldItems")) {
		if (!entry || typeof entry !== "object") continue;
		if (entry.Item !== undefined) {
			records.push(...walkItemList(entry, prefix, heldCtx));
		} else {
			const record = readItem(entry, prefix, heldCtx);
			if (record) records.push(record);
		}
	}

	// items sitting on top of furniture (e.g. on a table)
	if (furn.heldObject && typeof furn.heldObject === "object") {
		const held = readItem(furn.heldObject, prefix, {
			source: "placed",
			location,
			container: furn.name?.toString(),
		});
		if (held) records.push(held);
	}

	return records;
}

/** A farm building: its interior location, input/output chests, fish pond output. */
function walkBuilding(
	building: any,
	prefix: string,
	parentLocation: string,
): ItemRecord[] {
	if (!building || typeof building !== "object") return [];

	const records: ItemRecord[] = [];
	const type = building[`@_${prefix}:type`]?.toString();

	// instanced interiors (sheds, barns, coops, cabins). FarmHouse/Greenhouse
	// have no <indoors> (their interiors are top-level GameLocations), so this
	// never double counts.
	if (building.indoors && typeof building.indoors === "object") {
		const label = `${parentLocation} > ${
			building.buildingType?.toString() ?? "Building"
		}`;
		records.push(...walkLocation(building.indoors, prefix, label));
	}

	// 1.6: Mill/Junimo Hut chests live in <buildingChests>
	for (const chest of GetListOrEmpty(building.buildingChests, "Chest")) {
		if (!chest || typeof chest !== "object") continue;
		records.push(
			...walkItemList(chest.items, prefix, {
				source: "buildingChest",
				location: parentLocation,
				container: chest.name?.toString(),
			}),
		);
	}

	// 1.5: the same chests were <input>/<output> on the building
	for (const key of ["input", "output"]) {
		const chest = building[key];
		if (chest && typeof chest === "object" && chest.items !== undefined) {
			records.push(
				...walkItemList(chest.items, prefix, {
					source: "buildingChest",
					location: parentLocation,
					container: key,
				}),
			);
		}
	}

	if (type === "FishPond" && building.output) {
		const output = readItem(building.output.Item, prefix, {
			source: "fishPond",
			location: parentLocation,
			container: "Fish Pond",
		});
		if (output) records.push(output);
	}

	return records;
}

/** One GameLocation: placed objects, furniture, kitchen fridge, and buildings. */
function walkLocation(loc: any, prefix: string, label: string): ItemRecord[] {
	if (!loc || typeof loc !== "object") return [];

	const records: ItemRecord[] = [];

	// objects are a serialized dictionary: objects.item[].value.Object
	for (const entry of GetListOrEmpty(loc.objects, "item")) {
		records.push(...walkObject(entry?.value?.Object, prefix, label));
	}

	for (const furn of GetListOrEmpty(loc.furniture, "Furniture")) {
		records.push(...walkFurniture(furn, prefix, label));
	}

	// FarmHouse/IslandFarmHouse/Cabins have a kitchen fridge (a full Chest)
	if (loc.fridge && typeof loc.fridge === "object") {
		records.push(
			...walkItemList(loc.fridge.items, prefix, {
				source: "fridge",
				location: label,
				container: "Fridge",
			}),
		);
	}

	for (const building of GetListOrEmpty(loc.buildings, "Building")) {
		records.push(...walkBuilding(building, prefix, label));
	}

	return records;
}

/** This farmer's inventory and equipped items. */
function walkPlayer(player: any, prefix: string): ItemRecord[] {
	const records: ItemRecord[] = [];

	records.push(
		...walkItemList(player.items, prefix, {
			source: "inventory",
			location: "player",
		}),
	);

	// equipment elements are typed by tag name and usually carry no xsi:type,
	// so each slot supplies its own default. CombinedRing is emitted as a
	// single record; expanding its nested combinedRings is a possible later
	// enhancement.
	const equipment: [string, EquipmentSlot, string][] = [
		["hat", "hat", "Hat"],
		["boots", "boots", "Boots"],
		["leftRing", "leftRing", "Ring"],
		["rightRing", "rightRing", "Ring"],
		["shirtItem", "shirt", "Clothing"],
		["pantsItem", "pants", "Clothing"],
		["trinketItem", "trinket", "Trinket"], // 1.6 only
	];
	for (const [key, slot, defaultType] of equipment) {
		const record = readItem(player[key], prefix, {
			source: "equipment",
			location: "player",
			slot,
			defaultType,
		});
		if (record) records.push(record);
	}

	return records;
}

function parseMoney(player: any, hostPlayer: any): MoneyRet {
	// only the host's <player> element carries useSeparateWallets, and
	// farmhands only carry their own <money> when wallets are separate
	return {
		current: Number(player.money ?? hostPlayer.money ?? 0),
		totalEarned: Number(player.totalMoneyEarned ?? 0),
		useSeparateWallets: isTrue(hostPlayer.useSeparateWallets),
	};
}

/**
 * Walks every GameLocation in the save for items in the world: placed objects,
 * chests, fridges, machines, building chests, fish ponds, and furniture.
 * Called once per save; the result is shared across all players.
 */
export function parseWorldItems(prefix: string, SaveGame: any): ItemRecord[] {
	try {
		const records: ItemRecord[] = [];

		for (const loc of GetListOrEmpty(SaveGame.locations, "GameLocation")) {
			if (!loc || typeof loc !== "object") continue;
			const label =
				loc.name?.toString() ??
				loc[`@_${prefix}:type`]?.toString() ??
				"Unknown";
			records.push(...walkLocation(loc, prefix, label));
		}

		return records;
	} catch (err) {
		if (err instanceof Error)
			throw new Error(`Error in parseWorldItems: ${err.message}`);
		throw new Error(`Error in parseWorldItems: ${err}`);
	}
}

/**
 * Assembles the items category for one farmer: their money, their inventory
 * and equipment, plus the shared world items from parseWorldItems.
 *
 * NOTE: this is extraction only — no valuation. basePrice is the save's raw
 * <price> (absent for weapons, 0 for tools/chests); computing real sell values
 * (quality multipliers, professions, game data for missing prices) lives in
 * net-worth.ts / weekly-income.ts on top of these records.
 */
export function parseItems(
	player: any,
	worldItems: ItemRecord[],
	hostPlayer: any,
	prefix: string,
): ItemsRet {
	try {
		return {
			money: parseMoney(player, hostPlayer),
			player: walkPlayer(player, prefix),
			world: worldItems,
		};
	} catch (err) {
		if (err instanceof Error)
			throw new Error(`Error in parseItems: ${err.message}`);
		throw new Error(`Error in parseItems: ${err}`);
	}
}
