/**
 * The toggle action being performed. Only connecting and disconnecting involve
 * companion-client side effects; other outcomes (already transitioning, several
 * profiles, cancelling a pending attempt) return early without concerns.
 */
export type TogglePhase = "connect" | "disconnect";

/** Mutable state shared with concerns around a single toggle. */
export interface ToggleContext {
  /** Whether Kerio is being connected or disconnected. */
  phase: TogglePhase;
  /** Base message produced by the Kerio action. A concern may rewrite it. */
  message: string;
  /** Extra notes appended to the final message. */
  notes: string[];
  /**
   * Wait (once) for Kerio to reach a stable connection. Memoized so several
   * concerns can share a single wait.
   */
  ensureStable(): Promise<boolean>;
}

/**
 * A side effect that customizes the toggle for a companion VPN client, e.g.
 * quitting/reopening SecoClient or pausing/restoring Tailscale. Concerns run
 * around the core Kerio connect/disconnect action.
 */
export interface ToggleConcern {
  /** Human-readable name, useful for debugging. */
  name: string;
  /** Runs before the core Kerio action. */
  before?(ctx: ToggleContext): Promise<void> | void;
  /** Runs after the core Kerio action. */
  after?(ctx: ToggleContext): Promise<void> | void;
}
