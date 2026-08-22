# Purpose: to parse Machines.json from the content folder and keep how long each
# machine takes to produce its output, for estimating long-run machine income.
# Result is saved to data/machines.json, keyed by the machine's big craftable ID.
# { machineID: { name, minutes, byOutput: { outputItemID: minutes } } }
#   minutes  - typical processing time (in-game minutes, 1600 per day), or null
#              when the machine has no timed output rules (e.g. Tapper, Cask)
#   byOutput - processing time for specific outputs where rules differ
#              (Furnace bars, Crystalarium gems, Keg drinks, ...)
#
# Content Files used: Machines.json
# Data Files used: big_craftables.json (run bigcraftables.py first for names)
# Wiki Pages used: None

from collections import defaultdict
from statistics import mean

from tqdm import tqdm

from helpers.models import Machine
from helpers.utils import load_content, load_data, save_json

MACHINES: dict[str, dict] = load_content("Machines.json")
BIG_CRAFTABLES: dict[str, dict] = load_data("big_craftables.json")

MINUTES_PER_DAY = 1600

# FLAVORED_ITEM outputs (wine, jelly, ...) are stored in the save under the
# base item's ID, so map the flavor type to that ID
FLAVORED_ITEM_IDS = {
    "Honey": "340",
    "Wine": "348",
    "Jelly": "344",
    "Pickle": "342",
    "Juice": "350",
    "Roe": "812",
    "AgedRoe": "447",
    "Bait": "SpecificBait",
    "DriedFruit": "DriedFruit",
    "DriedMushroom": "DriedMushrooms",
    "SmokedFish": "SmokedFish",
}


def rule_minutes(rule: dict) -> int | None:
    minutes = rule.get("MinutesUntilReady", -1)
    if minutes > 0:
        return minutes
    days = rule.get("DaysUntilReady", -1)
    if days > 0:
        return days * MINUTES_PER_DAY
    # no duration and produced by code: the machine decides (Cask aging)
    if all(item.get("OutputMethod") for item in rule.get("OutputItem") or []):
        return None
    # rules with no duration fire on the daily update (statues, coffee maker)
    return MINUTES_PER_DAY


def output_id(output: dict) -> str | None:
    item_id = output.get("ItemId")
    if not item_id:
        return None  # produced by code (OutputMethod) or a random pick
    if item_id.startswith("(O)"):
        return item_id[3:]
    if item_id.startswith("FLAVORED_ITEM "):
        flavor = item_id.split(" ")[1]
        return FLAVORED_ITEM_IDS.get(flavor)
    return None  # DROP_IN etc.


def get_machines() -> dict[str, Machine]:
    output: dict[str, Machine] = {}
    for key, value in tqdm(MACHINES.items()):
        machine_id = key[len("(BC)") :]
        name = BIG_CRAFTABLES.get(machine_id, {}).get("name", machine_id)

        rules = value.get("OutputRules") or []
        all_minutes: list[int] = []
        by_output: dict[str, list[int]] = defaultdict(list)
        for rule in rules:
            minutes = rule_minutes(rule)
            if minutes is None:
                continue
            all_minutes.append(minutes)
            for item in rule.get("OutputItem") or []:
                item_id = output_id(item)
                if item_id:
                    by_output[item_id].append(minutes)

        default = round(mean(all_minutes)) if all_minutes else None

        # ReadyTimeModifiers override the time for specific items
        # (Crystalarium: "ITEM_ID Target (O)72" -> Set 5000)
        for modifier in value.get("ReadyTimeModifiers") or []:
            condition = modifier.get("Condition") or ""
            parts = condition.split(" ")
            if len(parts) != 3 or parts[0] != "ITEM_ID" or not parts[2].startswith("(O)"):
                continue
            item_id = parts[2][3:]
            amount = modifier.get("Amount", 0)
            if modifier.get("Modification") == "Set":
                by_output[item_id] = [int(amount)]
            elif modifier.get("Modification") == "Multiply" and default:
                by_output[item_id] = [int(default * amount)]

        output[machine_id] = {
            "name": name,
            "minutes": default,
            # when several rules make the same item in different times (Oil
            # Maker: 60 to 3200 minutes depending on input), use the average
            "byOutput": {
                item_id: round(mean(minutes))
                for item_id, minutes in by_output.items()
            },
        }

    return output


if __name__ == "__main__":
    output = get_machines()
    save_json(output, "machines.json", sort=True)
