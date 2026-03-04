import { getSelectedFinderItems, showToast, Toast, open, Clipboard } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisifyExec } from "./utils/promisifyExec";
import { tryit } from "radash";

export default async function Command() {
  // Try to get the selected file from Finder first
  let sourceFilePath: string | undefined;

  const [finderErr, selectedItems] = await tryit(getSelectedFinderItems)();
  if (!finderErr && selectedItems.length > 0) {
    sourceFilePath = selectedItems[0].path;
  }

  // Fallback: check clipboard for a file path
  if (!sourceFilePath) {
    const [clipErr, clipContent] = await tryit(Clipboard.read)();
    if (!clipErr) {
      const clipText = clipContent.text?.trim() || clipContent.file?.trim();
      if (clipText && existsSync(clipText)) {
        sourceFilePath = clipText;
      }
    }
  }

  if (!sourceFilePath) {
    return showToast({
      style: Toast.Style.Failure,
      title: "No file found",
      message: "Select a file in Finder or copy a file path to the clipboard.",
    });
  }
  const mdFilePath = `${sourceFilePath}.md`;

  await showToast({
    style: Toast.Style.Animated,
    title: "Converting to Markdown…",
  });

  // Use Microsoft markitdown CLI to convert the file to markdown
  // Extend PATH to include common user-local bin directories that Raycast's shell may not have
  const home = homedir();
  const extraPaths = [join(home, ".local", "bin"), "/opt/homebrew/bin", "/usr/local/bin"].join(":");
  const extendedPath = `${extraPaths}:${process.env.PATH || ""}`;

  const [convertErr, convertRes] = await tryit(promisifyExec)(`markitdown "${sourceFilePath}" > "${mdFilePath}"`, {
    shell: "/bin/zsh",
    env: { ...process.env, PATH: extendedPath },
  });
  if (convertErr) {
    console.error("🚀 ~ mark-it-dowm.ts:43 ~ Command ~ convertErr:", convertErr);
    return showToast({
      style: Toast.Style.Failure,
      title: "Conversion Failed",
      message: convertErr.message,
    });
  }

  if (convertRes.stderr) {
    console.error("🚀 ~ mark-it-dowm.ts:52 ~ Command ~ stderr:", convertRes.stderr);
    return showToast({
      style: Toast.Style.Failure,
      title: "Conversion Error",
      message: String(convertRes.stderr),
    });
  }

  // Open the converted markdown file in VS Code
  const [openErr] = await tryit(open)(mdFilePath, "com.microsoft.VSCode");
  if (openErr) {
    return showToast({
      style: Toast.Style.Failure,
      title: "Failed to open file",
      message: openErr.message,
    });
  }

  return showToast({
    style: Toast.Style.Success,
    title: "Converted successfully",
    message: mdFilePath,
  });
}
