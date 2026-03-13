import { getPreferenceValues } from "@raycast/api";
import { Effect } from "effect";

import { logger } from "./logger";

/**
 * 将HTTP图片转换为base64数据URL
 *
 * @param imageUrl - 图片URL
 * @returns Effect 包含 base64 数据URL 或降级链接（内部错误已被处理）
 */
const convertImageToBase64 = (imageUrl: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoSid, username } = preferences;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(imageUrl, {
          method: "GET",
          headers: {
            Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
            Connection: "keep-alive",
            Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
          },
        }),
      catch: (e) => e,
    });

    if (!response.ok) {
      logger.warn(`Failed to fetch image: ${imageUrl}, status: ${response.status}`);
      return yield* Effect.fail(`[📷 图片链接](${imageUrl})`);
    }

    // 检查响应的content-type，确保是图片而不是HTML
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      logger.warn(`Response is not an image: ${imageUrl}, content-type: ${contentType}`);
      return yield* Effect.fail(`[📷 图片链接](${imageUrl})`);
    }

    const arrayBuffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (e) => e,
    });

    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  }).pipe(
    Effect.catchAll((fallback) => {
      if (typeof fallback === "string") {
        return Effect.succeed(fallback);
      }
      logger.error(
        `Error converting image to base64: ${imageUrl}`,
        fallback instanceof Error ? fallback : String(fallback),
      );
      return Effect.succeed(`[📷 图片链接](${imageUrl})`);
    }),
  );

/**
 * 批量处理图片，将HTTP图片转换为base64，HTTPS图片保持原样
 *
 * @param images - 图片URL数组
 * @returns Effect 包含处理后的图片URL数组（永不失败）
 */
export const processImages = (images: string[]): Effect.Effect<string[]> =>
  Effect.forEach(images, (imageUrl) =>
    imageUrl.startsWith("http://") ? convertImageToBase64(imageUrl) : Effect.succeed(imageUrl),
  );
