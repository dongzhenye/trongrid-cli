/**
 * Static mapping from chain transaction types (contract_type) to
 * human-readable display names for the "Type / Method" column.
 *
 * JSON output keeps the raw contract_type unchanged — this mapping
 * is exclusively for human-mode rendering.
 *
 * Adding a new chain type: append an entry here. No rendering logic
 * changes needed.
 */

const TX_TYPE_MAP: Record<string, string> = {
	TransferContract: "Transfer",
	TransferAssetContract: "Token Transfer",
	TriggerSmartContract: "Contract Call", // fallback when no method data
	FreezeBalanceV2Contract: "Freeze",
	UnfreezeBalanceV2Contract: "Unfreeze",
	DelegateResourceContract: "Delegate",
	UndelegateResourceContract: "Undelegate",
	VoteWitnessContract: "Vote",
	AccountCreateContract: "Activate",
};

/**
 * Convert a raw chain contract_type to a human-readable label.
 *
 * Known types return their mapped name (title case). Unknown types
 * strip the `Contract` suffix as a best-effort fallback.
 */
export function humanTxType(contractType: string): string {
	return TX_TYPE_MAP[contractType] ?? contractType.replace(/Contract$/, "");
}
