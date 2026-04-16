import type { ApiClient } from "./client.js";

export interface Trc20Info {
	contract_address: string;
	name: string;
	symbol: string;
	decimals: number;
	type: string;
	total_supply: string;
}

interface Trc20ApiEntry {
	contract_address?: string;
	name?: string;
	symbol?: string;
	decimals?: string | number;
	type?: string;
	total_supply?: string;
}

interface Trc20InfoResponse {
	data: Trc20ApiEntry[];
}

const CHUNK_SIZE = 20;

function parseEntry(entry: Trc20ApiEntry): Trc20Info {
	return {
		contract_address: entry.contract_address ?? "",
		name: entry.name ?? "",
		symbol: entry.symbol ?? "",
		decimals:
			typeof entry.decimals === "string"
				? parseInt(entry.decimals, 10) || 0
				: (entry.decimals ?? 0),
		type: entry.type ?? "trc20",
		total_supply: entry.total_supply ?? "0",
	};
}

export async function fetchBatchTrc20Info(
	client: ApiClient,
	addresses: string[],
): Promise<Map<string, Trc20Info>> {
	if (addresses.length === 0) {
		return new Map();
	}

	// Chunk into groups of 20 (API limit)
	const chunks: string[][] = [];
	for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
		chunks.push(addresses.slice(i, i + CHUNK_SIZE));
	}

	const results = await Promise.all(
		chunks.map((chunk) => {
			const contractList = chunk.join(",");
			return client.get<Trc20InfoResponse>(`/v1/trc20/info?contract_list=${contractList}`);
		}),
	);

	const map = new Map<string, Trc20Info>();
	for (const res of results) {
		for (const entry of res.data ?? []) {
			if (!entry.contract_address) continue;
			map.set(entry.contract_address, parseEntry(entry));
		}
	}

	return map;
}
