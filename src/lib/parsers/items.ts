import big_craftables from "@/data/big_craftables.json";
import objects from "@/data/objects.json";

import { deweaponize } from "../utils";

/*
	Scans a player's inventory and all storage containers (chests, fridges,
	auto-grabbers, etc.) on the farm and returns an aggregated count of every
	owned item.

	This is the shared foundation used to compute a player's net worth and to
	power the "in storage" option of the ingredient tracker.

	Each stack keeps the save's own name and price so that flavored artisan goods
	(e.g. Starfruit Wine vs generic Wine) are valued and labelled correctly rather
	than collapsed onto their base item. Item IDs follow the convention used
	elsewhere in the app: plain numeric strings for regular objects (matching the
	keys of objects.json) and a `(BC)` prefix for big craftables (matching
	big_craftables.json keys, and how the ingredient cards reference them).
*/

export interface OwnedStack {
	itemID: string; // base id: "(BC)<id>" for big craftables, plain numeric otherwise
	name: string; // the item's in-save name (already flavored, e.g. "Starfruit Wine")
	quality: string; // "0" | "1" | "2" | "4"
	quantity: number;
	price: number; // per-item base sell price from the save (flavored-aware), pre-quality
}

export interface ItemsRet {
	// keyed by a stack signature so differently-flavored/valued items stay separate
	items: { [key: string]: OwnedStack };
}

const OBJECTS = objects as Record<string, { price?: number; name?: string }>;
const BIG_CRAFTABLES = big_craftables as Record<
	string,
	{ price?: number; name?: string }
>;

/**
 * Resolve a single inventory/storage node to a normalized item id, or null if
 * it isn't a sellable object/big-craftable we track (tools, furniture, weapons,
 * hats, etc. are skipped).
 */
function resolveItem(node: any): OwnedStack | null {
	if (!node || typeof node !== "object") return null;

	const quality = String(Number(node.quality ?? 0) || 0);
	const quantity = Number(node.stack ?? 1) || 1;

	let itemID: string | null = null;
	let isBigCraftable = false;

	// 1.6 stores a qualified item id like "(O)24" or "(BC)10".
	if (node.itemId !== undefined && node.itemId !== null) {
		const { key, value } = deweaponize(node.itemId.toString());
		if (key === "BC" && value in BIG_CRAFTABLES) {
			itemID = `(BC)${value}`;
			isBigCraftable = true;
		} else if ((key === "O" || key === "") && value in OBJECTS) {
			itemID = value;
		}
	}

	// 1.5 (and as a fallback) uses parentSheetIndex + a bigCraftable flag.
	if (itemID === null && node.parentSheetIndex !== undefined) {
		const psi = node.parentSheetIndex.toString();
		const isBC =
			node.bigCraftable === true ||
			node.bigCraftable === "true" ||
			node.isBigCraftable === true ||
			node.isBigCraftable === "true";

		if (isBC && psi in BIG_CRAFTABLES) {
			itemID = `(BC)${psi}`;
			isBigCraftable = true;
		} else if (psi in OBJECTS) {
			itemID = psi;
		}
	}

	if (itemID === null) return null;

	// Prefer the save's own per-item price: it already accounts for flavored
	// goods (e.g. Starfruit Wine = 2250, not generic Wine). Fall back to the
	// static data price only when the save omits it.
	const dataEntry = isBigCraftable
		? BIG_CRAFTABLES[itemID.slice(4)]
		: OBJECTS[itemID];
	const savedPrice = Number(node.price);
	const price =
		Number.isFinite(savedPrice) && savedPrice > 0
			? savedPrice
			: (dataEntry?.price ?? 0);

	// The save's name is already flavored; fall back to the static data name.
	const name =
		(typeof node.name === "string" && node.name) || dataEntry?.name || itemID;

	return { itemID, name, quality, quantity, price };
}

/**
 * Recursively walk a subtree of the save, collecting items held inside
 * containers (chest `items.Item`, machine `heldObject`, etc.). Placed objects
 * themselves (machines, fences, the chest object) are intentionally not counted
 * — only their contents.
 */
function collectContainedItems(obj: any, acc: OwnedStack[]): void {
	if (!obj || typeof obj !== "object") return;

	if (Array.isArray(obj)) {
		for (const entry of obj) collectContainedItems(entry, acc);
		return;
	}

	// Chests / fridges / auto-grabbers store their contents under `items.Item`.
	if (obj.items && obj.items.Item) {
		const contents = Array.isArray(obj.items.Item)
			? obj.items.Item
			: [obj.items.Item];
		for (const item of contents) {
			const resolved = resolveItem(item);
			if (resolved) acc.push(resolved);
			// chests can contain chests (Junimo chests, etc.)
			collectContainedItems(item, acc);
		}
	}

	// Machines (kegs, furnaces, ...) keep their output in `heldObject`.
	if (obj.heldObject) {
		const resolved = resolveItem(obj.heldObject);
		if (resolved) acc.push(resolved);
		collectContainedItems(obj.heldObject, acc);
	}

	for (const [key, value] of Object.entries(obj)) {
		// already handled above; avoid re-descending into them here
		if (key === "items" || key === "heldObject") continue;
		if (value && typeof value === "object") {
			collectContainedItems(value, acc);
		}
	}
}

/**
 * Collect every item held in storage containers across all game locations.
 *
 * Storage is shared between all players on a farm, so this is computed once and
 * merged into each player's items (mirroring how rarecrows/perfection are
 * precomputed and shared in `file.ts`).
 */
export function parseStorageItems(SaveGame: any): OwnedStack[] {
	const collected: OwnedStack[] = [];

	if (SaveGame?.locations?.GameLocation) {
		const locations = Array.isArray(SaveGame.locations.GameLocation)
			? SaveGame.locations.GameLocation
			: [SaveGame.locations.GameLocation];
		for (const location of locations) {
			// handles nested locations such as cabins/sheds via recursion
			collectContainedItems(location, collected);
		}
	}

	return collected;
}

/**
 * Aggregate a single player's owned items: their personal inventory plus the
 * (precomputed, shared) farm storage.
 */
export function parseItems(player: any, storageItems: OwnedStack[]): ItemsRet {
	try {
		const collected: OwnedStack[] = [...storageItems];

		if (player?.items?.item) {
			const inventory = Array.isArray(player.items.item)
				? player.items.item
				: [player.items.item];
			for (const item of inventory) {
				const resolved = resolveItem(item);
				if (resolved) collected.push(resolved);
			}
		}

		// Aggregate identical stacks. The key includes name + price so that
		// differently-flavored goods (Starfruit Wine vs Blueberry Wine) stay
		// separate while true duplicates across chests merge.
		const items: { [key: string]: OwnedStack } = {};
		for (const stack of collected) {
			const key = `${stack.itemID}|${stack.quality}|${stack.name}|${stack.price}`;
			if (items[key]) {
				items[key].quantity += stack.quantity;
			} else {
				items[key] = { ...stack };
			}
		}

		return { items };
	} catch (err) {
		if (err instanceof Error)
			throw new Error(`Error in parseItems: ${err.message}`);
		throw new Error(`Error in parseItems: ${err}`);
	}
}
