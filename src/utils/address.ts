const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

export function isValidAddress(address: string): boolean {
	if (!address) return false;
	return BASE58_REGEX.test(address) || HEX_REGEX.test(address);
}

export function validateAddress(address: string): string {
	if (!isValidAddress(address)) {
		throw new Error(
			`Invalid TRON address format: "${address}". Expected Base58 (T...) or Hex (41...).`,
		);
	}
	return address;
}
