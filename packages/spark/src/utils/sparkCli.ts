import { exec } from "child_process";
import { promisify } from "util";

import { Effect } from "effect";

import { SparkCommandError, SparkNotSetupError } from "@/types/errors";

const execPromisified = promisify(exec);

/** Ensure /usr/local/bin is in PATH so `spark` can be found */
const sparkEnv = { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin` };

const SETUP_MESSAGE =
  "Spark CLI not found. Please make sure Spark Desktop is installed and CLI is enabled:\n" +
  "1. Launch Spark Desktop on your Mac\n" +
  "2. Go to Settings > AI Agents\n" +
  "3. Click Set Up CLI";

/** Run a spark CLI command and return stdout */
export const execSpark = (args: string[]): Effect.Effect<string, SparkNotSetupError | SparkCommandError> =>
  Effect.gen(function* () {
    const command = `spark ${args.join(" ")}`;

    const { stdout } = yield* Effect.tryPromise({
      try: () => execPromisified(command, { env: sparkEnv }),
      catch: (error: unknown): SparkNotSetupError | SparkCommandError => {
        const err = error as { stderr?: string; message?: string };
        const stderr = err.stderr ?? err.message ?? "";

        if (
          stderr.includes("not set up") ||
          stderr.includes("helper") ||
          stderr.includes("not initialized") ||
          stderr.includes("command not found") ||
          stderr.includes("No such file")
        ) {
          return new SparkNotSetupError({ message: SETUP_MESSAGE });
        }

        return new SparkCommandError({ command, message: stderr || `Command failed: ${command}`, stderr });
      },
    });

    return stdout;
  });

/** Run a spark CLI command that returns JSON and parse it */
export const execSparkJson = <T>(args: string[]): Effect.Effect<T, SparkNotSetupError | SparkCommandError> =>
  Effect.gen(function* () {
    const stdout = yield* execSpark(args);
    try {
      return JSON.parse(stdout) as T;
    } catch {
      return stdout as unknown as T;
    }
  });
