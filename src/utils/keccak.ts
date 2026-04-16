/**
 * Minimal Keccak-256 implementation (NOT NIST SHA-3).
 *
 * Keccak-256 uses padding byte 0x01 (not 0x06 as in SHA-3).
 * This is the hash function used by Ethereum/TRON for function selectors,
 * address derivation, and other on-chain operations.
 *
 * Zero external dependencies — uses BigInt for 64-bit lane math.
 */

// --- Keccak-f[1600] round constants ---

const RC: bigint[] = [
	0x0000000000000001n,
	0x0000000000008082n,
	0x800000000000808an,
	0x8000000080008000n,
	0x000000000000808bn,
	0x0000000080000001n,
	0x8000000080008081n,
	0x8000000000008009n,
	0x000000000000008an,
	0x0000000000000088n,
	0x0000000080008009n,
	0x000000008000000an,
	0x000000008000808bn,
	0x800000000000008bn,
	0x8000000000008089n,
	0x8000000000008003n,
	0x8000000000008002n,
	0x8000000000000080n,
	0x000000000000800an,
	0x800000008000000an,
	0x8000000080008081n,
	0x8000000000008080n,
	0x0000000080000001n,
	0x8000000080008008n,
];

// Rotation offsets for the rho step (indexed by lane [x][y] linearized as x*5+y)
const ROT: number[] = [
	0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14,
];

const MASK64 = 0xffffffffffffffffn;

/** Rotate left a 64-bit BigInt value. */
function rotl64(x: bigint, n: number): bigint {
	return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64;
}

/**
 * Keccak-f[1600] permutation — 24 rounds on a 5x5 state of 64-bit lanes.
 * State is modified in-place.
 */
function keccakF(state: bigint[]): void {
	for (let round = 0; round < 24; round++) {
		// --- theta ---
		const c: bigint[] = new Array(5);
		for (let x = 0; x < 5; x++) {
			c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
		}
		for (let x = 0; x < 5; x++) {
			const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
			for (let y = 0; y < 25; y += 5) {
				state[x + y] = (state[x + y] ^ d) & MASK64;
			}
		}

		// --- rho + pi (combined) ---
		const temp: bigint[] = new Array(25);
		for (let x = 0; x < 5; x++) {
			for (let y = 0; y < 5; y++) {
				const src = x + y * 5;
				const dst = y + ((2 * x + 3 * y) % 5) * 5;
				temp[dst] = rotl64(state[src], ROT[src]);
			}
		}

		// --- chi ---
		for (let y = 0; y < 25; y += 5) {
			for (let x = 0; x < 5; x++) {
				state[x + y] =
					(temp[x + y] ^ (~temp[((x + 1) % 5) + y] & temp[((x + 2) % 5) + y])) & MASK64;
			}
		}

		// --- iota ---
		state[0] = (state[0] ^ RC[round]) & MASK64;
	}
}

/**
 * Compute Keccak-256 hash of input data.
 *
 * @param data - Input bytes to hash
 * @returns 32-byte hash as Uint8Array
 */
export function keccak256(data: Uint8Array): Uint8Array {
	const rate = 136; // 1088 bits / 8 = 136 bytes
	const outputLen = 32;

	// Initialize 5x5 state (25 lanes of 64 bits each = 200 bytes)
	const state: bigint[] = new Array(25).fill(0n);

	// Absorb: XOR data into state, rate bytes at a time
	let offset = 0;
	while (offset + rate <= data.length) {
		xorBlock(state, data, offset, rate);
		keccakF(state);
		offset += rate;
	}

	// Pad the final block (Keccak padding: 0x01 || 0x00...00 || 0x80)
	const remaining = data.length - offset;
	const padded = new Uint8Array(rate);
	padded.set(data.subarray(offset, offset + remaining));
	padded[remaining] = 0x01; // Keccak domain separator (NOT 0x06 for SHA-3)
	padded[rate - 1] |= 0x80; // Final bit of multi-rate padding

	xorBlock(state, padded, 0, rate);
	keccakF(state);

	// Squeeze: extract output bytes from state
	const output = new Uint8Array(outputLen);
	for (let i = 0; i < outputLen; i++) {
		const lane = Math.floor(i / 8);
		const byteInLane = i % 8;
		output[i] = Number((state[lane] >> BigInt(byteInLane * 8)) & 0xffn);
	}

	return output;
}

/** XOR `len` bytes from `src` (starting at `srcOffset`) into the state lanes. */
function xorBlock(state: bigint[], src: Uint8Array, srcOffset: number, len: number): void {
	for (let i = 0; i < len; i++) {
		const lane = Math.floor(i / 8);
		const byteInLane = i % 8;
		state[lane] = (state[lane] ^ (BigInt(src[srcOffset + i]) << BigInt(byteInLane * 8))) & MASK64;
	}
}

/**
 * Compute the 4-byte function selector for a Solidity function signature.
 *
 * @param signature - Function signature, e.g. "transfer(address,uint256)"
 * @returns "0x"-prefixed 8-char hex string, e.g. "0xa9059cbb"
 */
export function functionSelector(signature: string): string {
	const hash = keccak256(new TextEncoder().encode(signature));
	const hex = Array.from(hash.subarray(0, 4))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `0x${hex}`;
}
