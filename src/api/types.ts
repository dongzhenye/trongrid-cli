export interface ClientOptions {
  network: string;
  apiKey?: string;
}

export const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://api.trongrid.io",
  shasta: "https://api.shasta.trongrid.io",
  nile: "https://nile.trongrid.io",
};
