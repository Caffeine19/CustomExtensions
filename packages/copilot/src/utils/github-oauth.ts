import { Clipboard, open } from "@raycast/api";

const CLIENT_ID = "Iv1.b507a08c87ecfe98"; // VS Code Client ID
const SCOPES = "read:user";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface DeviceFlowError {
  error: string;
  error_description?: string;
}

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to request device code: ${response.status}`);
  }

  return response.json() as Promise<DeviceCodeResponse>;
}

export async function pollForToken(deviceCode: string, interval: number): Promise<string> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    device_code: deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const data = (await response.json()) as AccessTokenResponse | DeviceFlowError;

    if ("error" in data) {
      if (data.error === "authorization_pending") {
        continue;
      }
      if (data.error === "slow_down") {
        interval += 5;
        continue;
      }
      throw new Error(data.error_description || data.error);
    }

    if ("access_token" in data) {
      return data.access_token;
    }
  }
}

export async function startDeviceFlow(): Promise<{ userCode: string; token: Promise<string> }> {
  const code = await requestDeviceCode();
  await Clipboard.copy(code.user_code);
  await open(code.verification_uri);

  const tokenPromise = pollForToken(code.device_code, code.interval);

  return {
    userCode: code.user_code,
    token: tokenPromise,
  };
}
