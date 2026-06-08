import { Effect } from "effect";

import { SparkAccount } from "@/types/account";
import { SparkCommandError, SparkNotSetupError, SparkParseError } from "@/types/errors";
import { execSpark } from "@/utils/sparkCli";

type SparkCliError = SparkNotSetupError | SparkCommandError | SparkParseError;

/**
 * Parse output from `spark accounts`.
 *
 * Expected format (one block per account, separated by blank lines):
 *   Email Account: caffeinecat18@gmail.com "Google" (Access: read-only)
 *   Email Account: 939597201@qq.com "QQ939" (Access: read-only)
 */
const parseAccountsOutput = (output: string): SparkAccount[] => {
  const accounts: SparkAccount[] = [];
  const regex = /Email Account:\s+(\S+)\s+"([^"]+)"\s+\(Access:\s+(\S+)\)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    const [, email, name, access] = match;
    accounts.push({
      id: email,
      email,
      name,
      type: access,
    });
  }

  return accounts;
};

/** Fetch all Spark accounts via CLI */
export const listAccounts = (): Effect.Effect<SparkAccount[], SparkCliError> =>
  Effect.gen(function* () {
    const stdout = yield* execSpark(["accounts"]);

    const accounts = parseAccountsOutput(stdout);
    if (accounts.length === 0) {
      return yield* new SparkParseError({
        message: "No accounts found in spark accounts output",
        raw: stdout,
      });
    }

    return accounts;
  });
