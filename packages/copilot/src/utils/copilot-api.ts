const COPILOT_HEADERS = {
  Accept: "application/json",
  "Editor-Version": "vscode/1.96.2",
  "Editor-Plugin-Version": "copilot-chat/0.26.7",
  "User-Agent": "GitHubCopilotChat/0.26.7",
  "X-Github-Api-Version": "2025-04-01",
};

export interface GitHubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface CopilotUsage {
  copilotPlan: string;
  assignedDate: string | null;
  quotaResetDate: string | null;
  premium: QuotaInfo | null;
  chat: QuotaInfo | null;
}

export interface QuotaInfo {
  entitlement: number;
  remaining: number;
  percentRemaining: number;
  quotaId: string;
}

interface CopilotApiResponse {
  copilot_plan: string;
  assigned_date?: string;
  quota_reset_date?: string;
  quota_snapshots?: {
    premium_interactions?: RawQuotaSnapshot;
    chat?: RawQuotaSnapshot;
    [key: string]: RawQuotaSnapshot | undefined;
  };
  monthly_quotas?: Record<string, number | string>;
  limited_user_quotas?: Record<string, number | string>;
}

interface RawQuotaSnapshot {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  quota_id?: string;
}

export async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "User-Agent": "GitHubCopilotChat/0.26.7",
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Authentication failed. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json() as Promise<GitHubUser>;
}

export async function fetchCopilotUsage(token: string): Promise<CopilotUsage> {
  const response = await fetch("https://api.github.com/copilot_internal/user", {
    headers: {
      Authorization: `token ${token}`,
      ...COPILOT_HEADERS,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Authentication failed. Please sign in again.");
  }

  if (!response.ok) {
    throw new Error(`Copilot API error: ${response.status}`);
  }

  const data = (await response.json()) as CopilotApiResponse;
  return parseCopilotResponse(data);
}

function parseQuotaSnapshot(raw: RawQuotaSnapshot | undefined): QuotaInfo | null {
  if (!raw) return null;
  const entitlement = raw.entitlement ?? 0;
  const remaining = raw.remaining ?? 0;
  if (entitlement === 0 && remaining === 0) return null;

  let percentRemaining = raw.percent_remaining ?? 0;
  if (percentRemaining === 0 && entitlement > 0 && raw.remaining !== undefined) {
    percentRemaining = (remaining / entitlement) * 100;
  }

  return {
    entitlement,
    remaining,
    percentRemaining: Math.max(0, Math.min(100, percentRemaining)),
    quotaId: raw.quota_id ?? "",
  };
}

function parseCopilotResponse(data: CopilotApiResponse): CopilotUsage {
  let premium: QuotaInfo | null = null;
  let chat: QuotaInfo | null = null;

  // Try direct quota_snapshots first
  if (data.quota_snapshots) {
    premium = parseQuotaSnapshot(data.quota_snapshots.premium_interactions);
    chat = parseQuotaSnapshot(data.quota_snapshots.chat);

    // Fallback: scan unknown keys
    if (!premium && !chat) {
      for (const [key, value] of Object.entries(data.quota_snapshots)) {
        if (key === "premium_interactions" || key === "chat") continue;
        const parsed = parseQuotaSnapshot(value);
        if (parsed) {
          const lower = key.toLowerCase();
          if (lower.includes("premium") || lower.includes("completion") || lower.includes("code")) {
            premium = premium ?? parsed;
          } else {
            chat = chat ?? parsed;
          }
        }
      }
    }
  }

  // Fallback to monthly_quotas + limited_user_quotas
  if (!premium && !chat && data.monthly_quotas && data.limited_user_quotas) {
    const monthlyCompletions = Number(data.monthly_quotas.completions ?? 0);
    const limitedCompletions = Number(data.limited_user_quotas.completions ?? 0);
    if (monthlyCompletions > 0 && limitedCompletions > 0) {
      premium = {
        entitlement: monthlyCompletions,
        remaining: limitedCompletions,
        percentRemaining: (limitedCompletions / monthlyCompletions) * 100,
        quotaId: "completions",
      };
    }

    const monthlyChat = Number(data.monthly_quotas.chat ?? 0);
    const limitedChat = Number(data.limited_user_quotas.chat ?? 0);
    if (monthlyChat > 0 && limitedChat > 0) {
      chat = {
        entitlement: monthlyChat,
        remaining: limitedChat,
        percentRemaining: (limitedChat / monthlyChat) * 100,
        quotaId: "chat",
      };
    }
  }

  return {
    copilotPlan: data.copilot_plan ?? "unknown",
    assignedDate: data.assigned_date ?? null,
    quotaResetDate: data.quota_reset_date ?? null,
    premium,
    chat,
  };
}
