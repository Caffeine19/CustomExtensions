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

  // Try `-b` or `--cookie` flag first
  const bMatch = trimmed.match(/(?:^|\s)(?:-b|--cookie)\s+['"](.+?)['"]/);
  if (bMatch) {
    return bMatch[1];
  }

  // Try `-H 'cookie: ...'` header style
  const hMatch = trimmed.match(/-H\s+['"]cookie:\s*(.+?)['"]/i);
  if (hMatch) {
    return hMatch[1];
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
