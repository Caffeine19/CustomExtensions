import { closeMainWindow, LaunchProps, showToast, Toast } from "@raycast/api";
import { getValidatedSpace, makeNewTab } from "./arc";
import { newTabPreferences } from "./preferences";
import { Space, URLArguments } from "./types";
import { validateURL } from "./utils";

const DEFAULT_PAGE = "arc://newtab";

const handleOpenNewTab = async (newTabUrl: string, space?: Space) => {
  try {
    if (await validateURL(newTabUrl)) {
      // Append https:// if protocol is missing
      const openURL = !/^\S+?:\/\//i.test(newTabUrl) ? "https://" + newTabUrl : newTabUrl;
      await closeMainWindow();
      await makeNewTab(openURL, space);
    }
  } catch (e) {
    console.error(e);

    await showToast({
      style: Toast.Style.Failure,
      title: "Failed opening a new tab",
    });
  }
};

export default async function command(props: LaunchProps<{ arguments: URLArguments }>) {
  const { url } = props.arguments;
  const { fallbackText } = props;
  const newTabUrl = url || fallbackText || newTabPreferences.url || DEFAULT_PAGE;

  const space = await getValidatedSpace(props.arguments.space);

  if (newTabUrl.includes(",")) {
    const multileTabs = newTabUrl.split(",").map((url) => handleOpenNewTab(url.trim(), space));

    return Promise.all(multileTabs);
  } else {
    return await handleOpenNewTab(newTabUrl, space);
  }
}
