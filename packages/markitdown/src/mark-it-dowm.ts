import { getSelectedFinderItems, showToast, Toast, open, Clipboard } from "@raycast/api";
import { existsSync } from "fs";
import { homedir } from "os";
import { join, parse } from "path";
import { promisifyExec } from "./utils/promisifyExec";
import { tryit } from "radash";

/**
 * 把单个文件转换成同目录下的 markdown，并用默认应用打开
 *
 * @param sourceFilePath - 源文件路径
 * @returns 转换生成的 markdown 路径；失败时返回错误信息
 */
async function convertFile(sourceFilePath: string): Promise<{ mdFilePath?: string; error?: string }> {
  const { dir, name } = parse(sourceFilePath);
  const mdFilePath = join(dir, `${name}.md`);

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
    return { error: convertErr.message };
  }

  if (convertRes.stderr) {
    return { error: String(convertRes.stderr) };
  }

  // Open the converted markdown file in VS Code
  const [openErr] = await tryit(open)(mdFilePath);
  if (openErr) {
    return { error: openErr.message };
  }

  return { mdFilePath };
}

export default async function Command() {
  // Try to get the selected files from Finder first (支持多选)
  const sourceFilePaths: string[] = [];

  const [finderErr, selectedItems] = await tryit(getSelectedFinderItems)();
  if (!finderErr && selectedItems.length > 0) {
    sourceFilePaths.push(...selectedItems.map((item) => item.path));
  }

  // Fallback: check clipboard for a file path
  // Useful when in editor like VS Code
  if (sourceFilePaths.length === 0) {
    const [clipErr, clipContent] = await tryit(Clipboard.read)();
    if (!clipErr) {
      const clipText = clipContent.text?.trim() || clipContent.file?.trim();
      if (clipText && existsSync(clipText)) {
        sourceFilePaths.push(clipText);
      }
    }
  }

  if (sourceFilePaths.length === 0) {
    return showToast({
      style: Toast.Style.Failure,
      title: "No file found",
      message: "Select files in Finder or copy a file path to the clipboard.",
    });
  }

  await showToast({
    style: Toast.Style.Animated,
    title: sourceFilePaths.length > 1 ? `Converting ${sourceFilePaths.length} files…` : "Converting to Markdown…",
  });

  // 逐个转换，收集成功与失败的结果
  const results = await Promise.all(sourceFilePaths.map((path) => convertFile(path)));
  const failures = results
    .map((result, index) => ({ path: sourceFilePaths[index], error: result.error }))
    .filter((item): item is { path: string; error: string } => Boolean(item.error));
  const succeeded = sourceFilePaths.length - failures.length;

  if (failures.length > 0) {
    const first = failures[0];
    return showToast({
      style: Toast.Style.Failure,
      title:
        failures.length === sourceFilePaths.length
          ? "Conversion Failed"
          : `Converted ${succeeded} of ${sourceFilePaths.length}`,
      message:
        failures.length === 1
          ? `${first.path}: ${first.error}`
          : `${first.path}: ${first.error} (and ${failures.length - 1} more)`,
    });
  }

  return showToast({
    style: Toast.Style.Success,
    title: sourceFilePaths.length > 1 ? `Converted ${succeeded} files` : "Converted successfully",
    message: sourceFilePaths.length > 1 ? "Opened all markdown files" : results[0].mdFilePath,
  });
}
