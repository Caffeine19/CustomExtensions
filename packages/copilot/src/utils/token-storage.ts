import { LocalStorage } from "@raycast/api";
import { gen, tryPromise } from "effect/Effect";
import { StorageError } from "../types/errors";

const TOKENS_KEY = "github-tokens";

export interface StoredAccount {
  token: string;
  login: string;
  addedAt: string;
}

export const getStoredAccounts = gen(function* () {
  const raw = yield* tryPromise({
    try: () => LocalStorage.getItem<string>(TOKENS_KEY),
    catch: () => new StorageError({ message: "Failed to read stored accounts" }),
  });
  if (!raw) return [] as StoredAccount[];
  return yield* tryPromise({
    try: async () => JSON.parse(raw) as StoredAccount[],
    catch: () => new StorageError({ message: "Failed to parse stored accounts" }),
  });
});

export const addAccount = (account: StoredAccount) =>
  gen(function* () {
    const accounts = yield* getStoredAccounts;
    const existing = accounts.findIndex((a) => a.login === account.login);
    if (existing >= 0) {
      accounts[existing] = account;
    } else {
      accounts.push(account);
    }
    yield* tryPromise({
      try: () => LocalStorage.setItem(TOKENS_KEY, JSON.stringify(accounts)),
      catch: () => new StorageError({ message: "Failed to save account" }),
    });
  });

export const removeAccount = (login: string) =>
  gen(function* () {
    const accounts = yield* getStoredAccounts;
    const filtered = accounts.filter((a) => a.login !== login);
    yield* tryPromise({
      try: () => LocalStorage.setItem(TOKENS_KEY, JSON.stringify(filtered)),
      catch: () => new StorageError({ message: "Failed to remove account" }),
    });
  });
