# Terminology Glossary

API-to-CLI field name mapping. All commands reference this doc for consistent user-facing terminology. Entries are grouped by domain.

## Contract

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `origin_address` | Deployer | `deployer` | Contract deployer address |
| `consume_user_resource_percent` | Caller pays | `caller_energy_ratio` | % of energy paid by caller (vs contract subsidy) |
| `origin_energy_limit` | Deployer cap | `deployer_energy_cap` | Max energy the deployer subsidizes per call |
| `trx_hash` | Deploy TX | `deploy_tx` | Hash of the most recent deployment transaction |
| (derived) | Status | `status` | `active` or `destroyed` — derived from getcontract response |

## Account

*Existing commands already use intuitive terms. New entries added as terminology diverges.*

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `balance` | Balance | `balance` / `balance_trx` | S1 unit shape (sun → TRX) |

## Internal Transactions

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `caller_address` | From | `from` | Internal call origin |
| `transferTo_address` | To | `to` | Internal call destination |
| `callValueInfo[0].callValue` | Value | `value` / `value_trx` | TRX transferred (S1 shape) |
| `call_type` | Type | `call_type` | call, delegatecall, staticcall, create |
