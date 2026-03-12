import { LocalStorage } from "@raycast/api";

const TOKENS_KEY = "github-tokens";

export interface StoredAccount {
  token: string;
  login: string;
  addedAt: string;
}

export async function getStoredAccounts(): Promise<StoredAccount[]> {
  const raw = await LocalStorage.getItem<string>(TOKENS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as StoredAccount[];
  } catch {
    return [];
  }
}

export async function addAccount(account: StoredAccount): Promise<void> {
  const accounts = await getStoredAccounts();
  const existing = accounts.findIndex((a) => a.login === account.login);
  if (existing >= 0) {
    accounts[existing] = account;
  } else {
    accounts.push(account);
  }
  await LocalStorage.setItem(TOKENS_KEY, JSON.stringify(accounts));
}

export async function removeAccount(login: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const filtered = accounts.filter((a) => a.login !== login);
  await LocalStorage.setItem(TOKENS_KEY, JSON.stringify(filtered));
}
