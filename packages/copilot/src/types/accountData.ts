import { CopilotUsage, GitHubEmail, GitHubUser } from "../utils/copilot-api";
import { StoredAccount } from "../utils/token-storage";

export interface AccountData {
  account: StoredAccount;
  user: GitHubUser | null;
  email: GitHubEmail | null;
  usage: CopilotUsage | null;
  error: string | null;
}
