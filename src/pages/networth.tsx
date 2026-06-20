import Head from "next/head";

import { usePlayers } from "@/contexts/players-context";
import { useMemo, useState } from "react";

import { HoldingCard } from "@/components/cards/holding-card";
import { InfoCard } from "@/components/cards/info-card";
import { Card } from "@/components/ui/card";
import { Command, CommandInput } from "@/components/ui/command";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { computeHoldings } from "@/lib/networth";

import {
	ArchiveBoxIcon,
	BanknotesIcon,
	CurrencyDollarIcon,
	TrophyIcon,
} from "@heroicons/react/24/solid";

const gold = (n: number) => `${n.toLocaleString()}g`;

export default function NetWorth() {
	const { activePlayer } = usePlayers();

	const [search, setSearch] = useState("");
	const [sort, setSort] = useState("value");

	const money = activePlayer?.general?.money ?? 0;

	const breakdown = useMemo(
		() => computeHoldings(activePlayer?.items),
		[activePlayer],
	);

	const netWorth = money + breakdown.itemsValue;

	// Prices live in objects.json / big_craftables.json and are only populated
	// once those data files are regenerated with sell prices. Until then every
	// holding resolves to 0g, so net worth reflects gold on hand only.
	const pricesMissing =
		breakdown.distinctCount > 0 && breakdown.pricedCount === 0;

	const holdings = useMemo(() => {
		let list = breakdown.holdings;

		if (search) {
			const q = search.toLowerCase();
			list = list.filter((h) => h.name.toLowerCase().includes(q));
		}

		if (sort === "quantity") {
			list = [...list].sort((a, b) => b.quantity - a.quantity);
		} else if (sort === "name") {
			list = [...list].sort((a, b) => a.name.localeCompare(b.name));
		}
		// "value" is the order computeHoldings already returns

		return list;
	}, [breakdown, search, sort]);

	return (
		<>
			<Head>
				<title>Stardew Valley Net Worth Tracker | stardew.app</title>
				<meta
					name="title"
					content="Stardew Valley Net Worth Tracker | stardew.app"
				/>
				<meta
					name="description"
					content="Track your net worth in Stardew Valley. Add up your gold on hand and the sell value of every item in your inventory and chests to see what your farm is really worth."
				/>
				<meta
					name="og:description"
					content="Track your net worth in Stardew Valley. Add up your gold on hand and the sell value of every item in your inventory and chests to see what your farm is really worth."
				/>
				<meta
					name="twitter:description"
					content="Track your net worth in Stardew Valley. Add up your gold on hand and the sell value of every item in your inventory and chests to see what your farm is really worth."
				/>
				<meta
					name="keywords"
					content="stardew valley net worth, stardew valley money tracker, stardew valley gold, stardew valley item value, stardew valley inventory value, stardew valley gameplay tracker, stardew valley, stardew, net worth tracker"
				/>
			</Head>
			<main
				className={`flex min-h-screen border-neutral-200 px-5 pb-8 pt-2 dark:border-neutral-800 md:border-l md:px-8`}
			>
				<div className="mx-auto mt-4 w-full space-y-4">
					<h1 className="ml-1 text-2xl font-semibold text-gray-900 dark:text-white">
						Net Worth
					</h1>

					{/* Hero: the headline figure */}
					<Card className="overflow-hidden">
						<div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
							<p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
								Estimated net worth
							</p>
							<p className="flex items-baseline justify-center font-semibold tabular-nums">
								<span className="text-4xl md:text-5xl">
									{netWorth.toLocaleString()}
								</span>
								<span className="ml-1 text-2xl text-yellow-600 dark:text-yellow-500 md:text-3xl">
									g
								</span>
							</p>
							<p className="text-sm text-neutral-500 dark:text-neutral-400">
								{gold(money)} on hand · {gold(breakdown.itemsValue)} in items
							</p>
						</div>
					</Card>

					{/* Overview */}
					<section className="space-y-3">
						<h2 className="ml-1 text-xl font-semibold text-gray-900 dark:text-white">
							Overview
						</h2>
						<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
							<InfoCard
								title="Gold on Hand"
								description={activePlayer ? gold(money) : "No Info Found"}
								Icon={CurrencyDollarIcon}
							/>
							<InfoCard
								title="Items Value"
								description={
									activePlayer ? gold(breakdown.itemsValue) : "No Info Found"
								}
								Icon={BanknotesIcon}
							/>
							<InfoCard
								title="Items Held"
								description={
									activePlayer
										? breakdown.totalQuantity.toLocaleString()
										: "No Info Found"
								}
								Icon={ArchiveBoxIcon}
							/>
							<InfoCard
								title="Total Earned"
								description={
									activePlayer?.general?.totalMoneyEarned != null
										? gold(activePlayer.general.totalMoneyEarned)
										: "No Info Found"
								}
								Icon={TrophyIcon}
							/>
						</div>
					</section>

					{/* Holdings */}
					<section className="space-y-3">
						<h2 className="ml-1 text-xl font-semibold text-gray-900 dark:text-white">
							Holdings
						</h2>

						{pricesMissing && (
							<div className="rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-500/10 dark:text-yellow-200">
								Item sell prices aren&apos;t loaded yet, so item values show as
								0g. Net worth currently reflects the gold on hand.
							</div>
						)}

						{/* Sort + Search */}
						<div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between">
							<ToggleGroup
								variant="outline"
								type="single"
								value={sort}
								onValueChange={(val) => val && setSort(val)}
								className="gap-2"
							>
								<ToggleGroupItem value="value" aria-label="Sort by value">
									Value
								</ToggleGroupItem>
								<ToggleGroupItem value="quantity" aria-label="Sort by quantity">
									Quantity
								</ToggleGroupItem>
								<ToggleGroupItem value="name" aria-label="Sort by name">
									Name
								</ToggleGroupItem>
							</ToggleGroup>
							<div className="w-full md:max-w-xs">
								<Command className="w-full border dark:border-neutral-800">
									<CommandInput
										onValueChange={(v) => setSearch(v)}
										placeholder="Search Items"
									/>
								</Command>
							</div>
						</div>

						{/* Items */}
						{holdings.length > 0 ? (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
								{holdings.map((h) => (
									<HoldingCard
										key={`${h.itemID}_${h.quality}_${h.name}`}
										holding={h}
									/>
								))}
							</div>
						) : (
							<div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-200 px-5 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
								{!activePlayer
									? "Upload a save to see your inventory and chest holdings."
									: search
										? "No items match your search."
										: "No items found in this farmer's inventory or chests."}
							</div>
						)}
					</section>
				</div>
			</main>
		</>
	);
}
