import { randomBytes, randomUUID } from "crypto";
import { readFileSync, readdirSync } from "fs";
import { type Socket, connect as netConnect } from "net";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

import {
  ActionType,
  ChatInteractivity,
  ChatSourceKind,
  type CreateChatParams,
  type ForkChatSource,
  type SessionChatSummary,
  type SessionSummary,
  type StateAction,
} from "@microsoft/agent-host-protocol";
import {
  AhpClient,
  type AhpTransport,
  type JsonRpcMessage,
  type TransportFrame,
} from "@microsoft/agent-host-protocol/client";
import { WebSocketTransport } from "@microsoft/agent-host-protocol/ws";
import dayjs from "dayjs";
import { Effect, Result } from "effect";
import { group, mapValues, unique } from "radash";

import { AgentHostError, AgentHostUnavailableError, type AhpError } from "../../../types/errors";
import type { CopilotSession } from "../../../types/sessions/copilotSession";
import type { WorkspaceJson } from "../../../types/sessions/localSession";
import { parseJson } from "../../../utils/parseJson";
import { uriToSessionId } from "../../../utils/sessionDisplay";
import {
  VSCODE_VARIANTS,
  getAppSupportDir,
  getVariant,
  getWorkspaceStorageDir,
  uriToFsPath,
  workspaceDisplayName,
} from "../../../utils/vscode";

// ── Endpoint discovery ───────────────────────────────────────────────────────
// Spec: microsoft/vscode src/vs/platform/agentHost/LOCAL_ENDPOINT.md —
// each running host publishes a schema-v2 entry under
// <userData>/agent-host/local-endpoint/entries/<hash>.json. Validate entries
// independently, drop dead PIDs, and never reconstruct endpoint addresses.

interface EndpointEntry {
  schemaVersion?: number;
  pid?: number;
  instanceId?: string;
  connectionToken?: string;
  endpoint?: { type: "socket"; path: string } | { type: "tcp"; host: string; port: number };
}

/** An endpoint entry validated by `findLiveEndpoint` (usable endpoint + token present). */
type LiveEndpointEntry = EndpointEntry & {
  endpoint: NonNullable<EndpointEntry["endpoint"]>;
  connectionToken: string;
};

function registryDirs(): string[] {
  // Only the preferred variant's host — a second running install must not win by pid.
  return [join(getAppSupportDir(getVariant()), "agent-host/local-endpoint/entries")];
}

function isPidAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function findLiveEndpoint(): LiveEndpointEntry {
  const seen = new Set<string>();
  const entries: EndpointEntry[] = [];

  for (const dir of registryDirs()) {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const file of files) {
      let entry: EndpointEntry | undefined;
      try {
        const parsed = parseJson<EndpointEntry>(readFileSync(join(dir, file), "utf-8"));
        if (Result.isSuccess(parsed)) entry = parsed.success;
      } catch {
        // unreadable file — ignore this entry
        continue;
      }
      if (!entry?.endpoint || !entry.connectionToken) continue;
      // Schema v2 only — v1 flat entries must be ignored
      if (entry.schemaVersion !== undefined && entry.schemaVersion < 2) continue;
      if (!isPidAlive(entry.pid)) continue;
      const key = `${entry.endpoint.type}:${entry.pid}:${entry.instanceId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
  }

  // Prefer unix sockets (the common local case); newest host first
  entries.sort((a, b) => {
    const socketA = a.endpoint?.type === "socket" ? 1 : 0;
    const socketB = b.endpoint?.type === "socket" ? 1 : 0;
    return socketB - socketA || (b.pid ?? 0) - (a.pid ?? 0);
  });

  const entry = entries[0];
  if (!entry?.endpoint || !entry.connectionToken) {
    throw new AgentHostUnavailableError({ message: "No live VS Code Agent Host endpoint found. Is VS Code running?" });
  }
  return entry as LiveEndpointEntry;
}

// ── WebSocket client over a unix socket (RFC 6455, client-masked) ────────────
// The SDK's bundled WebSocketTransport dials with the global WebSocket, which
// cannot reach unix sockets in Node, so we speak the framing ourselves and
// adapt to the SDK's 3-method AhpTransport interface.

class UnixSocketWebSocketTransport implements AhpTransport {
  private readonly socket: Socket;
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  private readonly queue: TransportFrame[] = [];
  private waiters: Array<(frame: TransportFrame | null) => void> = [];
  private closed = false;

  private constructor(socket: Socket) {
    this.socket = socket;
  }

  static async open(socketPath: string, token: string): Promise<UnixSocketWebSocketTransport> {
    const socket = netConnect(socketPath);
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.removeListener("error", onError);
        socket.write(
          `GET /?tkn=${encodeURIComponent(token)} HTTP/1.1\r\n` +
            `Host: localhost\r\n` +
            `Upgrade: websocket\r\n` +
            `Connection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n` +
            `Sec-WebSocket-Version: 13\r\n\r\n`,
        );
        resolve();
      });
    });

    const transport = new UnixSocketWebSocketTransport(socket);
    await transport.awaitUpgrade();
    transport.startFraming();
    return transport;
  }

  /** Attach frame handlers only after the upgrade completes, then parse any leftover bytes. */
  private startFraming(): void {
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", () => this.onClose());
    this.socket.on("close", () => this.onClose());
    if (this.buffer.length > 0) this.onData(Buffer.alloc(0));
  }

  private awaitUpgrade(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) return;
        this.socket.removeListener("data", onData);
        const status = this.buffer.slice(0, headerEnd).toString("utf-8").split("\r\n")[0];
        if (!status.includes("101")) {
          reject(new Error(`Agent Host WebSocket handshake failed: ${status}`));
          return;
        }
        this.buffer = this.buffer.slice(headerEnd + 4);
        resolve();
      };
      this.socket.on("data", onData);
    });
  }

  /** Write a single masked client frame (client-to-server frames MUST be masked). */
  private sendFrame(opcode: number, payload: Buffer): void {
    const mask = randomBytes(4);
    const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
    const header =
      payload.length < 126
        ? Buffer.from([0x80 | opcode, 0x80 | payload.length])
        : payload.length < 65536
          ? Buffer.from([0x80 | opcode, 0x80 | 126, payload.length >> 8, payload.length & 0xff])
          : (() => {
              const h = Buffer.alloc(10);
              h[0] = 0x80 | opcode;
              h[1] = 0x80 | 127;
              h.writeBigUInt64BE(BigInt(payload.length), 2);
              return h;
            })();
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  send(message: JsonRpcMessage | string): void {
    const payload = Buffer.from(typeof message === "string" ? message : JSON.stringify(message), "utf-8");
    this.sendFrame(0x1, payload);
  }

  recv(): Promise<TransportFrame | null> {
    const frame = this.queue.shift();
    if (frame !== undefined) return Promise.resolve(frame);
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  close(): void {
    try {
      this.sendFrame(0x8, Buffer.alloc(0));
      this.socket.end();
    } catch {
      // already gone
    }
    this.onClose();
  }

  private onClose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.splice(0)) waiter(null);
  }

  private emit(frame: TransportFrame): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(frame);
    else this.queue.push(frame);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];
      const fin = (byte0 & 0x80) !== 0;
      const opcode = byte0 & 0x0f;
      const masked = (byte1 & 0x80) !== 0;
      let len = byte1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this.buffer.length < 4) return;
        len = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) return;
        len = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      let mask: Buffer | undefined;
      if (masked) {
        if (this.buffer.length < offset + 4) return;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (this.buffer.length < offset + len) return;
      let payload = this.buffer.slice(offset, offset + len);
      if (mask) payload = Buffer.from(payload.map((b, i) => b ^ mask![i % 4]));
      this.buffer = this.buffer.slice(offset + len);

      switch (opcode) {
        case 0x0: // continuation
          this.fragments.push(payload);
          if (fin) this.deliverFragmented();
          break;
        case 0x1: // text
        case 0x2: // binary
          if (fin) {
            this.emit(
              opcode === 0x1 ? { kind: "text", text: payload.toString("utf-8") } : { kind: "binary", data: payload },
            );
          } else {
            this.fragmentOpcode = opcode;
            this.fragments = [payload];
          }
          break;
        case 0x8: // close
          this.close();
          break;
        case 0x9: // ping → pong
          this.sendFrame(0xa, payload);
          break;
        default:
          break; // pong and reserved opcodes ignored
      }
    }
  }

  private deliverFragmented(): void {
    const payload = Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.fragmentOpcode === 0x1) this.emit({ kind: "text", text: payload.toString("utf-8") });
    else this.emit({ kind: "binary", data: payload });
    this.fragmentOpcode = 0;
  }
}

// ── Client lifecycle ─────────────────────────────────────────────────────────

const CLIENT_ID = "raycast-copilot";

// The SDK negotiates the version from what we offer; 1.0.0/0.9.0 are the versions this SDK release supports (hosts
// accept client-offered versions).
const PROTOCOL_VERSIONS = ["1.0.0", "0.9.0"];

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Typed AHP errors raised inside `fn` pass through; everything else is wrapped.
function toAhpError(cause: unknown): AhpError {
  return cause instanceof AgentHostError || cause instanceof AgentHostUnavailableError
    ? cause
    : new AgentHostError({ message: toErrorMessage(cause), cause });
}

/**
 * Open a short-lived connection to the agent host, run `fn` on it and shut it down. All failures — connection,
 * handshake, protocol — surface in the Effect's error channel: `AgentHostUnavailableError` when no host is running,
 * `AgentHostError` for anything else.
 */
function withAhp<T>(fn: (client: AhpClient) => Promise<T>): Effect.Effect<T, AhpError> {
  return Effect.acquireUseRelease(
    Effect.tryPromise({
      try: async () => {
        const entry = findLiveEndpoint();

        let transport: AhpTransport;
        if (entry.endpoint.type === "socket") {
          transport = await UnixSocketWebSocketTransport.open(entry.endpoint.path, entry.connectionToken);
        } else {
          transport = await WebSocketTransport.connect(
            `ws://${entry.endpoint.host}:${entry.endpoint.port}/?tkn=${encodeURIComponent(entry.connectionToken)}`,
          );
        }

        const client = new AhpClient(transport);
        client.connect();
        return client;
      },
      catch: toAhpError,
    }),
    (client) =>
      Effect.tryPromise({
        try: async () => {
          await client.initialize({ clientId: CLIENT_ID, protocolVersions: PROTOCOL_VERSIONS });
          return fn(client);
        },
        catch: toAhpError,
      }),
    (client) => Effect.tryPromise({ try: () => client.shutdown(), catch: () => undefined }).pipe(Effect.ignore),
  );
}

// ── Session listing → CopilotSession rows ───────────────────────────────────

// ── Multi-root workspace resolution ──────────────────────────────────────────
// A session created in a `.code-workspace` window must open in that workspace,
// not in one of its folders. Two sources, in order of authority:
//   1. `_meta.multiRoot.workspaceFile` — provenance attached by the creating client;
//   2. for older sessions without it, a folder-set match against the workspaces VS Code
//      knows (workspaceStorage), mirroring windowsMainService's
//      `doGetWorkspaceMatchingFoldersFromLastSession` (same folder count + set equality).

function normalizeDirKey(dir: string): string {
  return dir.replace(/\/+$/, "").toLowerCase();
}

function folderSetKey(dirs: Iterable<string>): string {
  return [...dirs].map(normalizeDirKey).sort().join("\n");
}

function readMultiRootWorkspaceFile(meta: Record<string, unknown> | undefined): string | undefined {
  const multiRoot = meta?.multiRoot as { workspaceFile?: unknown } | undefined;
  return typeof multiRoot?.workspaceFile === "string" && multiRoot.workspaceFile
    ? uriToFsPath(multiRoot.workspaceFile)
    : undefined;
}

function readScratchFolders(meta: Record<string, unknown> | undefined): Set<string> {
  const raw = meta?.["vscode.scratchFolders"];
  return new Set(
    Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string").map(uriToFsPath) : [],
  );
}

/** Resolves a code-workspace file's folder paths (relative to the file itself). */
function readWorkspaceFileFolders(workspaceFilePath: string): string[] | undefined {
  try {
    const parsed = parseJson<{ folders?: Array<{ path?: string }> }>(readFileSync(workspaceFilePath, "utf-8"));
    if (Result.isFailure(parsed)) return undefined;
    const folders = parsed.success.folders;
    if (!Array.isArray(folders)) return undefined;
    const dirs = folders
      .map((folder) =>
        typeof folder?.path === "string" ? resolve(dirname(workspaceFilePath), folder.path) : undefined,
      )
      .filter((dir): dir is string => dir !== undefined);
    return dirs.length > 0 ? dirs : undefined;
  } catch {
    return undefined;
  }
}

/** Indexes the code-workspaces known to VS Code (both variants) by their folder set. */
function buildWorkspaceFileIndex(): Record<string, string[]> {
  const entries: Array<{ key: string; path: string }> = [];
  for (const storageRoot of VSCODE_VARIANTS.map(getWorkspaceStorageDir)) {
    let hashes: string[];
    try {
      hashes = readdirSync(storageRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const hash of hashes) {
      try {
        const meta = parseJson<WorkspaceJson>(readFileSync(join(storageRoot, hash, "workspace.json"), "utf-8"));
        if (Result.isFailure(meta)) continue;
        const workspace = meta.success.workspace;
        if (typeof workspace !== "string" || !workspace) continue;
        const workspaceFilePath = uriToFsPath(workspace);
        const folders = readWorkspaceFileFolders(workspaceFilePath);
        if (!folders) continue;
        entries.push({ key: folderSetKey(folders), path: workspaceFilePath });
      } catch {
        // Not a readable workspace entry — skip.
      }
    }
  }
  // Several storage hashes can point at the same workspace file — dedupe within each group.
  return mapValues(
    group(entries, (entry) => entry.key),
    (hits) => unique(hits ?? [], (hit) => hit.path).map((hit) => hit.path),
  );
}

/** Lazily built per load: matches a session's folder set to a code-workspace file, when exactly one matches. */
function makeWorkspaceFileResolver(): (dirs: string[]) => string | undefined {
  let index: Record<string, string[]> | undefined;
  return (dirs) => {
    index ??= buildWorkspaceFileIndex();
    return index[folderSetKey(dirs)]?.[0];
  };
}

function mapSummaryToRows(
  summary: SessionSummary,
  resolveWorkspaceFile: (dirs: string[]) => string | undefined,
): CopilotSession[] {
  const meta = summary._meta as Record<string, unknown> | undefined;
  const scratchPath = summary.workingDirectories?.[0] ? uriToFsPath(summary.workingDirectories[0]) : "";
  // Sessions created from the Agents window may run without any workspace; their only
  // working directory is a `~/.copilot` scratch folder whose UUID basename would leak
  // into the UI as a fake workspace name. The host marks these via `_meta.workspaceless`.
  const isWorkspaceless =
    Boolean(meta?.workspaceless) || (!summary.project && scratchPath.startsWith(join(homedir(), ".copilot")));
  const projectPath = summary.project ? uriToFsPath(summary.project.uri) : undefined;

  // Sessions created in a `.code-workspace` window open in that workspace — the creating
  // client's provenance first, then a folder-set match against VS Code's known workspaces.
  const scratchFolders = readScratchFolders(meta);
  const sessionDirs = (summary.workingDirectories ?? [])
    .map(uriToFsPath)
    .filter((dir) => !scratchFolders.has(normalizeDirKey(dir)));
  const workspaceFile =
    readMultiRootWorkspaceFile(meta) ?? (sessionDirs.length > 1 ? resolveWorkspaceFile(sessionDirs) : undefined);

  let workspacePath: string;
  let workspaceName: string;
  if (isWorkspaceless) {
    workspacePath = "";
    workspaceName = "Chats";
  } else if (workspaceFile) {
    workspacePath = workspaceFile;
    // Match the label local sessions get for the same workspace.
    workspaceName = workspaceDisplayName(workspaceFile);
  } else {
    workspacePath = projectPath ?? scratchPath;
    workspaceName = summary.project?.displayName ?? (workspacePath ? workspaceDisplayName(workspacePath) : "Chats");
  }

  const base = {
    source: "copilot" as const,
    summary,
    workspace: { path: workspacePath, name: workspaceName, ...(workspaceFile ? { workspaceFile } : {}) },
    workspaceless: isWorkspaceless,
    sessionFilePath: join(homedir(), ".copilot/session-state", uriToSessionId(summary.resource), "events.jsonl"),
  };

  const chats = (summary.chats ?? []).filter((chat) => chat.interactivity !== ChatInteractivity.Hidden);
  const rows: SessionChatSummary[] =
    chats.length > 0
      ? chats
      : [{ resource: summary.defaultChat ?? summary.resource, title: summary.title, status: summary.status }];

  return rows.map((chat) => ({ ...base, chat }));
}

async function listAllSummaries(client: AhpClient): Promise<SessionSummary[]> {
  const items: SessionSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.request("listSessions", { channel: "ahp-root://", limit: 200, cursor });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

/**
 * Load all Copilot Harness sessions over AHP.
 *
 * Fails with `AgentHostUnavailableError` when no live agent host is running (a designed state), or `AgentHostError` for
 * transport/protocol failures.
 */
export const loadCopilotSessions = (): Effect.Effect<CopilotSession[], AhpError> =>
  withAhp(async (client) => {
    const summaries = await listAllSummaries(client);
    const resolveWorkspaceFile = makeWorkspaceFileResolver();
    return summaries
      .flatMap((summary) => mapSummaryToRows(summary, resolveWorkspaceFile))
      .sort((a, b) => dayjs(b.summary.modifiedAt).valueOf() - dayjs(a.summary.modifiedAt).valueOf());
  });

// ── Mutations ────────────────────────────────────────────────────────────────

function dispatchAction(client: AhpClient, channel: string, action: StateAction): void {
  client.dispatch(channel, action);
}

/** Rename the session owning `sessionUri` (`session/titleChanged`). */
export const renameCopilotSession = (sessionUri: string, title: string): Effect.Effect<void, AhpError> =>
  withAhp(async (client) => {
    dispatchAction(client, sessionUri, { type: ActionType.SessionTitleChanged, title });
    await client.ping(); // flush the fire-and-forget notification before closing
  });

/**
 * Archive or unarchive a chat (`chat/isArchivedChanged`), or — for a session's default (main) chat — the whole session
 * (`session/isArchivedChanged`). This mirrors the host's own semantics ("archives a chat, or the whole session for its
 * main session"): a default chat is not independently archivable and the dispatch would be rejected.
 */
export const setCopilotChatArchived = (
  sessionUri: string,
  chatUri: string | undefined,
  isDefaultChat: boolean,
  isArchived: boolean,
): Effect.Effect<void, AhpError> =>
  withAhp(async (client) => {
    if (isDefaultChat || !chatUri) {
      dispatchAction(client, sessionUri, { type: ActionType.SessionIsArchivedChanged, isArchived });
    } else {
      dispatchAction(client, chatUri, { type: ActionType.ChatIsArchivedChanged, isArchived });
    }
    await client.ping();
  });

/**
 * Delete a single chat (`disposeChat`). Never touches the owning session. The session's default (main) chat is refused:
 * it backs the whole session and deleting it would orphan it.
 */
export const deleteCopilotChat = (chatUri: string | undefined, isDefaultChat: boolean): Effect.Effect<void, AhpError> =>
  Effect.gen(function* () {
    if (isDefaultChat || !chatUri) {
      return yield* new AgentHostError({ message: "The session's main chat cannot be deleted." });
    }
    yield* withAhp((client) => client.request("disposeChat", { channel: chatUri }).then(() => undefined));
  });

/**
 * Fork a new chat from the source chat's latest completed turn (`createChat` with a fork source). The new chat lives in
 * the same session. Yields the new chat's channel URI.
 */
export const forkCopilotChat = (sessionUri: string, chatUri: string): Effect.Effect<string, AhpError> =>
  withAhp(async (client) => {
    const { result } = await client.subscribe(chatUri);
    try {
      const state = result.snapshot?.state;
      const turns = state && "turns" in state ? state.turns : [];
      const latestTurn = turns[turns.length - 1];
      if (!latestTurn) {
        throw new AgentHostError({ message: "This chat has no completed turn to fork from." });
      }
      const newChatUri = `ahp-chat:/${randomUUID()}`;
      const source: ForkChatSource = { kind: ChatSourceKind.Fork, chat: chatUri, turnId: latestTurn.id };
      const params: CreateChatParams = { channel: sessionUri, chat: newChatUri, source };
      await client.request("createChat", params);
      return newChatUri;
    } finally {
      await client.unsubscribe(chatUri);
    }
  });
