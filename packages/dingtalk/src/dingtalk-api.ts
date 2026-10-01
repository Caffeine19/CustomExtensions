import type { DingTalkApiError, DingTalkSearchResult } from "./types";

const API_BASE = "https://api.dingtalk.com/v1.0";

export async function searchUsers(
  query: string,
  token: string,
): Promise<DingTalkSearchResult> {
  const res = await fetch(`${API_BASE}/contact/users/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: JSON.stringify({ query, offset: 0, size: 20 }),
  });

  if (!res.ok) {
    throw new Error(`Search users failed: ${res.status}`);
  }

  const data = await res.json();

  if ("errcode" in data && data.errcode !== 0) {
    throw new Error(`DingTalk API error: ${(data as DingTalkApiError).errmsg}`);
  }

  const users = (data.users || data.result || []).map(
    (u: Record<string, unknown>) => ({
      userid: u.userid as string,
      name: u.name as string,
      avatar: u.avatar as string | undefined,
      mobile: u.mobile as string | undefined,
      email: u.email as string | undefined,
      dept_id_list: u.dept_id_list as number[] | undefined,
      title: u.title as string | undefined,
      job_number: u.job_number as string | undefined,
    }),
  );

  return {
    has_more: data.has_more ?? false,
    next_cursor: data.next_cursor,
    users,
  };
}
