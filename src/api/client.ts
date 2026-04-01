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
		const response = await fetch(url, { ...init, headers });

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
