/**
 * Static mapping from chain transaction types (contract_type) to
 * human-readable display names for the "Type / Method" column.
 *
 * JSON output keeps the raw contract_type unchanged — this mapping
 * is exclusively for human-mode rendering.
 *
 * Adding a new chain type: append an entry here. No rendering logic
 * changes needed. Keep display names short (≤14 chars) to preserve
 * column width.
 *
 * Source of truth for chain type names: TronGrid API responses.
 * Note capitalization quirks (e.g., `UnDelegateResourceContract`
 * with capital D).
 */

const TX_TYPE_MAP: Record<string, string> = {
	// Value transfer
	TransferContract: "Transfer",
	TransferAssetContract: "TRC-10 Send",

	// Smart contract
	TriggerSmartContract: "Contract Call", // fallback when no method data
	CreateSmartContract: "Deploy",
	ClearABIContract: "Clear ABI",
	UpdateSettingContract: "Update Setting",
	UpdateEnergyLimitContract: "Update Energy",

	// Stake 2.0
	FreezeBalanceV2Contract: "Freeze",
	UnfreezeBalanceV2Contract: "Unfreeze",
	DelegateResourceContract: "Delegate",
	UnDelegateResourceContract: "Undelegate",
	WithdrawExpireUnfreezeContract: "Withdraw",
	CancelAllUnfreezeV2Contract: "Cancel Unfreeze",

	// Stake 1.0 (legacy)
	FreezeBalanceContract: "Freeze (v1)",
	UnfreezeBalanceContract: "Unfreeze (v1)",

	// Governance
	VoteWitnessContract: "Vote",
	WithdrawBalanceContract: "Claim Reward",
	ProposalCreateContract: "Proposal",
	ProposalApproveContract: "Approve Prop.",

	// Account
	AccountCreateContract: "Activate",
	AccountUpdateContract: "Update Acct",
	AccountPermissionUpdateContract: "Update Perms",

	// TRC-10 asset
	AssetIssueContract: "Issue Asset",
	UpdateAssetContract: "Update Asset",
	ParticipateAssetIssueContract: "Buy Asset",

	// DEX (built-in exchange)
	ExchangeCreateContract: "Create Pair",
	ExchangeInjectContract: "Add Liquidity",
	ExchangeWithdrawContract: "Remove Liq.",
	ExchangeTransactionContract: "Swap",

	// Market
	MarketSellAssetContract: "Market Sell",
	MarketCancelOrderContract: "Market Cancel",
};

/**
 * Convert a raw chain contract_type to a human-readable label.
 *
 * Known types return their mapped name. Unknown types strip the
 * `Contract` suffix as a best-effort fallback.
 */
export function humanTxType(contractType: string): string {
	return TX_TYPE_MAP[contractType] ?? contractType.replace(/Contract$/, "");
}
