import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LocalStorage,
  open,
  showToast,
  Toast,
} from "@raycast/api";

const MIMO_CONSOLE_URL = "https://platform.xiaomimimo.com/console/plan-manage";

/**
 * Try to extract cookie string from a curl command copied via Chrome DevTools.
 * Supports both `-b '...'` and `-H 'cookie: ...'` styles.
 * Returns the cookie string if found, or null if the input is not a curl command.
 */
function parseCookieFromCurl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("curl ") && !trimmed.startsWith("curl\t")) {
    return null;
  }

  // Collapse multi-line curl commands (Chrome DevTools copies with `\` line continuations)
  const oneline = trimmed.replace(/\\\n/g, " ").replace(/\\\r\n/g, " ");

  // Try `-b` or `--cookie` flag first
  // Use a non-greedy match that terminates at the correct closing quote
  // (quote followed by space, end of string, or another flag)
  const bMatch = oneline.match(/(?:^|\s)(?:-b|--cookie)\s+'((?:[^'\\]|\\.)*)'/);
  if (bMatch) {
    return bMatch[1].replace(/\\'/g, "'");
  }

  // Try double-quoted variant
  const bMatchDq = oneline.match(
    /(?:^|\s)(?:-b|--cookie)\s+"((?:[^"\\]|\\.)*)"/,
  );
  if (bMatchDq) {
    return bMatchDq[1].replace(/\\"/g, '"');
  }

  // Try `-H 'cookie: ...'` header style
  const hMatch = oneline.match(/-H\s+'cookie:\s*((?:[^'\\]|\\.)*)'/i);
  if (hMatch) {
    return hMatch[1].replace(/\\'/g, "'");
  }

  return null;
}

export default function Command() {
  async function handleSubmit(values: { cookie: string }) {
    const raw = values.cookie.trim();
    if (!raw) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cookie is empty",
      });
      return;
    }

    const cookie = parseCookieFromCurl(raw) ?? raw;
    await LocalStorage.setItem("cookie", cookie);
    await showToast({
      style: Toast.Style.Success,
      title: "Cookie updated",
      message: parseCookieFromCurl(raw)
        ? "Extracted cookie from curl command"
        : "Refresh to load new data",
    });
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Cookie"
            icon={Icon.Check}
            onSubmit={handleSubmit}
          />
          <Action
            title="Open MiMo Console"
            icon={Icon.Globe}
            onAction={() => open(MIMO_CONSOLE_URL)}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="Paste a cookie string or a curl command (copy as cURL from Chrome DevTools). The cookie will be extracted automatically from curl if detected." />
      <Form.TextArea
        id="cookie"
        title="Cookie"
        placeholder="Paste your cookie here..."
        storeValue
      />
    </Form>
  );
}
