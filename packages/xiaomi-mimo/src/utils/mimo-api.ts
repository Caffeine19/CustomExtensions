import { getPreferenceValues, LocalStorage } from "@raycast/api";
import { MiMoApiResponse, MiMoUsageData } from "../types/mimo-usage";
import { AuthenticationError, MiMoApiError } from "../types/errors";
import dns from "dns/promises";

const API_HOST = "platform.xiaomimimo.com";
const API_PATH = "/api/v1/tokenPlan/usage";

// Raycast's sandboxed Node.js runtime may block getaddrinfo (macOS mDNSResponder socket),
// causing ENOTFOUND even when the domain is valid. Use c-ares (dns.resolve4) as fallback.
async function resolveApiUrl(): Promise<string> {
  try {
    // Try normal resolution first (fast path when DNS works)
    const addrs = await dns.resolve4(API_HOST);
    if (addrs.length > 0) {
      return `https://${addrs[0]}${API_PATH}`;
    }
  } catch {
    // c-ares resolution failed too, fall back to hostname (may work in some envs)
  }
  return `https://${API_HOST}${API_PATH}`;
}

async function getCookie(): Promise<string> {
  const stored = await LocalStorage.getItem<string>("cookie");
  const raw = stored ?? getPreferenceValues<{ cookie: string }>().cookie;
  // Strip "Cookie: " prefix if user copied the full header line
  return raw.replace(/^Cookie:\s*/i, "").trim();
}

export async function fetchMiMoUsage(): Promise<MiMoUsageData> {
  const cookie = await getCookie();
  const url = await resolveApiUrl();

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      cookie,
      host: API_HOST,
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0",
    },
  });
  console.log("API Response:", response);

  if (response.status === 401 || response.status === 403) {
    throw new AuthenticationError({
      message:
        "Authentication failed. Please update your cookie in extension preferences.",
    });
  }

  if (!response.ok) {
    throw new MiMoApiError({
      message: `API error: ${response.status}`,
      status: response.status,
    });
  }

  const json = (await response.json()) as MiMoApiResponse;

  if (json.code !== 0) {
    throw new MiMoApiError({
      message: json.message || "Unknown API error",
      status: json.code,
    });
  }

  return json.data;
}
