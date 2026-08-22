# Purpose: to parse Crops.json from the content folder and keep the growth and
# yield information needed to value crops in the ground and estimate their income.
# Result is saved to data/crops.json, keyed by HARVEST item ID (what the save
# file's Crop.indexOfHarvest refers to), not by seed ID.
# { harvestItemID: { name, seedId, growthDays, regrowDays, minHarvest, maxHarvest, extraHarvestChance } }
#
# Content Files used: Crops.json
# Data Files used: objects.json (run objects.py first for harvest item names)
# Wiki Pages used: None

from tqdm import tqdm

from helpers.models import Crop
from helpers.utils import load_content, load_data, save_json

CROPS: dict[str, dict] = load_content("Crops.json")
OBJECTS: dict[str, dict] = load_data("objects.json")


def get_crops() -> dict[str, Crop]:
    output: dict[str, Crop] = {}
    for seed_id, value in tqdm(CROPS.items()):
        harvest_id = str(value["HarvestItemId"])
        if harvest_id in output:
            continue  # first seed wins if several seeds share a harvest item

        obj = OBJECTS.get(harvest_id)
        name = obj["name"] if obj else harvest_id

        output[harvest_id] = {
            "name": name,
            "seedId": seed_id,
            # days from planting to first harvest (before fertilizer/profession)
            "growthDays": sum(value["DaysInPhase"]),
            # -1 when the crop is destroyed on harvest
            "regrowDays": value.get("RegrowDays", -1),
            "minHarvest": value.get("HarvestMinStack", 1),
            "maxHarvest": value.get("HarvestMaxStack", 1),
            # chance of each additional item, rolled repeatedly (max 0.9)
            "extraHarvestChance": value.get("ExtraHarvestChance", 0.0),
        }

    return output


if __name__ == "__main__":
    output = get_crops()
    save_json(output, "crops.json", sort=True)
