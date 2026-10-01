import { OAuth, getPreferenceValues } from "@raycast/api";

interface Preferences {
  clientId: string;
  clientSecret: string;
}

export const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "DingTalk",
  providerIcon: "extension-icon.png",
  providerId: "dingtalk",
  description: "Connect your DingTalk account",
});

export async function authorize(): Promise<void> {
  const tokenSet = await client.getTokens();
  if (tokenSet?.accessToken) {
    if (tokenSet.refreshToken && tokenSet.isExpired()) {
      await client.setTokens(await refreshTokens(tokenSet.refreshToken));
    }
    return;
  }

  const { clientId } = getPreferenceValues<Preferences>();

  // Create auth request to get redirectURI and state
  const authRequest = await client.authorizationRequest({
    endpoint: "https://login.dingtalk.com/oauth2/auth",
    clientId,
    scope: "openid",
  });

  // Build authorize URL manually (DingTalk doesn't support PKCE)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "openid",
    redirect_uri: authRequest.redirectURI,
    state: authRequest.state,
    prompt: "consent",
  });

  const authUrl = `https://login.dingtalk.com/oauth2/auth?${params.toString()}`;

  // This shows the Raycast OAuth overlay
  const { authorizationCode } = await client.authorize({ url: authUrl });

  // Exchange code for tokens (no PKCE code_verifier)
  const tokenResponse = await fetchTokens(clientId, authorizationCode);
  await client.setTokens(tokenResponse);
}

async function fetchTokens(
  clientId: string,
  authCode: string,
): Promise<OAuth.TokenResponse> {
  const { clientSecret } = getPreferenceValues<Preferences>();

  const response = await fetch(
    "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        code: authCode,
        grantType: "authorization_code",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
    expireIn: number;
  };

  return {
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
    expires_in: data.expireIn,
  } as OAuth.TokenResponse;
}

async function refreshTokens(
  refreshToken: string,
): Promise<OAuth.TokenResponse> {
  const { clientId, clientSecret } = getPreferenceValues<Preferences>();

  const response = await fetch(
    "https://api.dingtalk.com/v1.0/oauth2/refreshAccessToken",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        refreshToken,
        grantType: "refresh_token",
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
    expireIn: number;
  };

  return {
    access_token: data.accessToken,
    refresh_token: data.refreshToken ?? refreshToken,
    expires_in: data.expireIn,
  } as OAuth.TokenResponse;
}
