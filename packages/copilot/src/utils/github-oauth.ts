import { Clipboard, open } from "@raycast/api";
import { async as asyncEffect, gen, fail, succeed, tryPromise } from "effect/Effect";
import { OAuthDeviceFlowError } from "../types/errors";

const CLIENT_ID = "178c6fc778ccc68e1d6a"; // GitHub CLI OAuth App (supports scopes properly)
const SCOPES = "read:user user:email";

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

export const requestDeviceCode = tryPromise({
  try: async () => {
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
  },
  catch: (e) => new OAuthDeviceFlowError({ message: e instanceof Error ? e.message : String(e) }),
});

export const pollForToken = (deviceCode: string, interval: number) =>
  asyncEffect<string, OAuthDeviceFlowError>((resume) => {
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    const poll = async () => {
      let currentInterval = interval;
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, currentInterval * 1000));

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
            currentInterval += 5;
            continue;
          }
          resume(fail(new OAuthDeviceFlowError({ message: data.error_description || data.error })));
          return;
        }

        if ("access_token" in data) {
          resume(succeed(data.access_token));
          return;
        }
      }
    };

    poll().catch((e) =>
      resume(fail(new OAuthDeviceFlowError({ message: e instanceof Error ? e.message : String(e) }))),
    );
  });

export const startDeviceFlow = gen(function* () {
  const code = yield* requestDeviceCode;
  yield* tryPromise({
    try: () => Clipboard.copy(code.user_code),
    catch: () => new OAuthDeviceFlowError({ message: "Failed to copy code to clipboard" }),
  });
  yield* tryPromise({
    try: () => open(code.verification_uri),
    catch: () => new OAuthDeviceFlowError({ message: "Failed to open browser" }),
  });

  return {
    userCode: code.user_code,
    token: pollForToken(code.device_code, code.interval),
  };
});
