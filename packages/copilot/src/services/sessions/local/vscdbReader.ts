import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { Effect, Result } from "effect";
import { DatabaseSync } from "node:sqlite";

import type { ChatSessionIndex } from "../../../types/sessions/localSession";
import { parseJson } from "../../../utils/parseJson";

// Session metadata comes from `chat.ChatSessionStore.index` in each workspace's `state.vscdb`, so
// listing needs no JSONL parsing (1000+ files / seconds). Never spawn one `sqlite3` per workspace —
// Raycast kills the extension ("connection closed"); read in-process via drizzle (node:sqlite).

const CHAT_INDEX_KEY = "chat.ChatSessionStore.index";

/** `ItemTable` is state.vscdb's key/value store (VS Code storage service). */
const ItemTable = sqliteTable("ItemTable", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export function readSessionIndexes(
  databases: Record<string, string>,
): Effect.Effect<Map<string, ChatSessionIndex>, unknown> {
  return Effect.gen(function* () {
    const indexes = new Map<string, ChatSessionIndex>();
    for (const [hash, dbPath] of Object.entries(databases)) {
      // unreadable DB — skip this workspace
      const raw = readIndexValue(dbPath);
      if (raw === undefined) continue;

      // A malformed index payload is a schema/data bug — surface it instead of silently dropping the workspace.
      const parsed = parseJson<ChatSessionIndex>(raw);
      if (Result.isFailure(parsed)) return yield* Effect.fail(parsed.failure);
      indexes.set(hash, parsed.success);
    }
    return indexes;
  });
}

/** One workspace's index payload; undefined when its DB is unreadable or the key is absent. */
function readIndexValue(dbPath: string): string | undefined {
  let sqlite: DatabaseSync | undefined;
  try {
    sqlite = new DatabaseSync(dbPath, { readOnly: true });
    return (
      drizzle({ client: sqlite }).select().from(ItemTable).where(eq(ItemTable.key, CHAT_INDEX_KEY)).get()?.value ??
      undefined
    );
  } catch {
    return undefined;
  } finally {
    sqlite?.close();
  }
}
