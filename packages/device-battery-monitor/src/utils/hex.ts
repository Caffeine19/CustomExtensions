/**
 * 将 hex 字符串解析为字节数组。
 * 允许空格 / 冒号 / 逗号分隔；非法输入抛错。
 */
export const hexToBytes = (hex: string): number[] => {
  const normalized = hex.replace(/[\s:,]/g, "");
  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error(`invalid hex string: ${hex}`);
  }

  const bytes: number[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(parseInt(normalized.slice(i, i + 2), 16));
  }
  return bytes;
};

/** 将 hex 字符串格式化为每行 16 字节的转储样式 */
export const formatHexDump = (hex: string): string =>
  (hex.match(/.{1,32}/g) ?? [])
    .map((line) => (line.match(/.{2}/g) ?? []).join(" "))
    .join("\n");
