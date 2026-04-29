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

export default function Command() {
  async function handleSubmit(values: { cookie: string }) {
    const cookie = values.cookie.trim();
    if (!cookie) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Cookie is empty",
      });
      return;
    }

    await LocalStorage.setItem("cookie", cookie);
    await showToast({
      style: Toast.Style.Success,
      title: "Cookie updated",
      message: "Refresh to load new data",
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
      <Form.Description text="Paste your new cookie from the MiMo platform. Open the console in your browser, copy the cookie from DevTools (Network tab → any request → Cookie header), and paste it below." />
      <Form.TextArea
        id="cookie"
        title="Cookie"
        placeholder="Paste your cookie here..."
        storeValue
      />
    </Form>
  );
}
