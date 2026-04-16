import { type ClientOptions, NETWORK_URLS } from "./types.js";

export class TrongridError extends Error {
	constructor(
		message: string,
		public status: number,
		public upstream?: unknown,
	) {
		super(message);
		this.name = "TrongridError";
	}

	/**
	 * Deterministic process exit code, per the four-level scheme documented in
	 * `docs/design/cli-best-practices.md` §4:
	 *   0 — success
	 *   1 — general / unexpected error
	 *   2 — usage error (bad flag / missing argument) — set by commander's exitOverride
	 *   3 — network or auth failure — this getter
	 */
	get exitCode(): number {
		// Network-level failure: fetch itself threw (offline, DNS, refused, timeout).
		if (this.status === 0) return 3;
		// Auth failure from upstream.
		if (this.status === 401 || this.status === 403) return 3;
		return 1;
	}
}

export interface ApiClient {
	get<T = unknown>(path: string): Promise<T>;
	post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
}

export function createClient(options: ClientOptions): ApiClient {
	const baseUrl = NETWORK_URLS[options.network] ?? NETWORK_URLS.mainnet;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (options.apiKey) {
		headers["TRON-PRO-API-KEY"] = options.apiKey;
	}

	async function request<T>(path: string, init: RequestInit): Promise<T> {
		const url = `${baseUrl}${path}`;
		let response: Response;
		try {
			response = await fetch(url, { ...init, headers });
		} catch (err) {
			// Network-level failure (offline, DNS resolution, refused connection,
			// TLS handshake, timeout). fetch throws TypeError with cause; we wrap
			// it in TrongridError with status 0 (no response received) and a
			// friendly message that names the fix. Original error preserved in
			// upstream for --verbose.
			throw new TrongridError(
				`Cannot reach TronGrid API at ${baseUrl}. Check your internet connection or try a different --network. Run with --verbose for details.`,
				0,
				err,
			);
		}

		if (!response.ok) {
			let upstream: unknown;
			try {
				upstream = await response.json();
			} catch {
				// ignore parse failures
			}
			throw new TrongridError(
				`API error: ${response.status} ${response.statusText}`,
				response.status,
				upstream,
			);
		}

		return response.json() as Promise<T>;
	}

	return {
		get: <T = unknown>(path: string) => request<T>(path, { method: "GET" }),
		post: <T = unknown>(path: string, body?: Record<string, unknown>) =>
			request<T>(path, {
				method: "POST",
				body: body ? JSON.stringify(body) : undefined,
			}),
	};
}
