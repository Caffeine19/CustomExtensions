import { getPreferenceValues } from "@raycast/api";
import { MiMoApiResponse, MiMoUsageData } from "../types/mimo-usage";
import { AuthenticationError, MiMoApiError } from "../types/errors";

const API_URL = "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage";

function getCookie(): string {
  const prefs = getPreferenceValues<{ cookie: string }>();
  return prefs.cookie;
}

export async function fetchMiMoUsage(): Promise<MiMoUsageData> {
  const cookie = getCookie();

  const response = await fetch(API_URL, {
    method: "GET",
    headers: {
      accept: "*/*",
      "accept-language": "zh",
      "content-type": "application/json",
      cookie,
      referer: "https://platform.xiaomimimo.com/console/plan-manage",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0",
      "x-timezone": "Asia/Shanghai",
    },
  });

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
