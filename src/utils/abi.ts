/**
 * ABI parser for TronGrid contract ABI responses.
 *
 * Parses the ABI JSON returned by TronGrid's `getcontract` endpoint into
 * structured method and event definitions with computed selectors.
 */

import { functionSelector } from "./keccak.js";

// --- Public types ---

export interface AbiMethod {
	/** 4-byte selector, e.g. "0xa9059cbb" */
	selector: string;
	name: string;
	/** Canonical signature, e.g. "transfer(address,uint256)" */
	signature: string;
	/** read = view|pure, write = nonpayable|payable */
	type: "read" | "write";
	/** Raw mutability: "view" | "pure" | "nonpayable" | "payable" */
	mutability: string;
	inputs: Array<{ name: string; type: string }>;
	outputs: Array<{ name: string; type: string }>;
}

export interface AbiEvent {
	name: string;
	/** Canonical signature, e.g. "Transfer(address,address,uint256)" */
	signature: string;
	inputs: Array<{ name: string; type: string; indexed: boolean }>;
}

export interface AbiSummary {
	method_count: number;
	event_count: number;
	methods: AbiMethod[];
	events: AbiEvent[];
}

// --- Helpers ---

/** Check if value is a non-null object (not array). */
function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Build a canonical signature from a name and input types.
 * e.g. ("transfer", [{type: "address"}, {type: "uint256"}]) => "transfer(address,uint256)"
 */
function buildSignature(name: string, inputs: Array<{ type: string }>): string {
	const types = inputs.map((i) => i.type).join(",");
	return `${name}(${types})`;
}

// --- Public API ---

/**
 * Normalize TronGrid's capitalized ABI entries to lowercase conventions.
 *
 * TronGrid returns "Function"/"Event" (capitalized) for `type` and
 * "View"/"Nonpayable" for `stateMutability`. This function lowercases
 * those fields to match the standard ABI convention.
 *
 * Non-object entries are silently dropped.
 */
export function normalizeAbiEntries(entrys: unknown[]): unknown[] {
	const result: unknown[] = [];
	for (const entry of entrys) {
		if (!isRecord(entry)) continue;
		const normalized: Record<string, unknown> = { ...entry };
		if (typeof normalized.type === "string") {
			normalized.type = normalized.type.toLowerCase();
		}
		if (typeof normalized.stateMutability === "string") {
			normalized.stateMutability = normalized.stateMutability.toLowerCase();
		}
		result.push(normalized);
	}
	return result;
}

/**
 * Parse an ABI JSON array into a structured summary of methods and events.
 *
 * Skips constructor, fallback, and receive entries (no user-callable name).
 * Gracefully skips malformed entries missing required fields (name, inputs).
 *
 * @param abiJson - Array of ABI entries (should be normalized first via normalizeAbiEntries)
 */
export function parseAbi(abiJson: unknown[]): AbiSummary {
	const methods: AbiMethod[] = [];
	const events: AbiEvent[] = [];

	for (const entry of abiJson) {
		if (!isRecord(entry)) continue;

		const entryType = entry.type as string | undefined;
		const name = entry.name as string | undefined;

		// Skip entries without a callable name (constructor, fallback, receive)
		if (!name || typeof name !== "string") continue;

		if (entryType === "function") {
			const inputs = entry.inputs;
			if (!Array.isArray(inputs)) continue;

			const outputs = Array.isArray(entry.outputs) ? entry.outputs : [];
			const mutability =
				typeof entry.stateMutability === "string" ? entry.stateMutability : "nonpayable";

			const sig = buildSignature(name, inputs as Array<{ type: string }>);

			methods.push({
				selector: functionSelector(sig),
				name,
				signature: sig,
				type: mutability === "view" || mutability === "pure" ? "read" : "write",
				mutability,
				inputs: (inputs as Array<{ name: string; type: string }>).map((i) => ({
					name: i.name,
					type: i.type,
				})),
				outputs: (outputs as Array<{ name: string; type: string }>).map((o) => ({
					name: o.name,
					type: o.type,
				})),
			});
		} else if (entryType === "event") {
			const inputs = entry.inputs;
			if (!Array.isArray(inputs)) continue;

			const sig = buildSignature(name, inputs as Array<{ type: string }>);

			events.push({
				name,
				signature: sig,
				inputs: (
					inputs as Array<{
						name: string;
						type: string;
						indexed: boolean;
					}>
				).map((i) => ({
					name: i.name,
					type: i.type,
					indexed: !!i.indexed,
				})),
			});
		}
		// Skip constructor, fallback, receive — they have no user-callable name
	}

	return {
		method_count: methods.length,
		event_count: events.length,
		methods,
		events,
	};
}
