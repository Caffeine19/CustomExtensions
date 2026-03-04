import { getPreferenceValues } from "@raycast/api";

import { logger } from "./logger";

/**
 * 将HTTP图片转换为base64数据URL
 *
 * @param imageUrl - 图片URL
 * @returns Base64数据URL或原URL（如果转换失败）
 */
async function convertImageToBase64(imageUrl: string): Promise<string> {
  try {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoSid, username } = preferences;

    const response = await fetch(imageUrl, {
      method: "GET",
      headers: {
        Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        Connection: "keep-alive",
        Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      logger.warn(`Failed to fetch image: ${imageUrl}, status: ${response.status}`);
      return `[📷 图片链接](${imageUrl})`;
    }

    // 检查响应的content-type，确保是图片而不是HTML
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      logger.warn(`Response is not an image: ${imageUrl}, content-type: ${contentType}`);
      return `[📷 图片链接](${imageUrl})`;
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error(`Error converting image to base64: ${imageUrl}`, error instanceof Error ? error : String(error));
    return `[📷 图片链接](${imageUrl})`;
  }
}

/**
 * 批量处理图片，将HTTP图片转换为base64，HTTPS图片保持原样
 *
 * @param images - 图片URL数组
 * @returns 处理后的图片URL数组
 */
export async function processImages(images: string[]): Promise<string[]> {
  const processedImages = await Promise.all(
    images.map(async (imageUrl) => {
      if (imageUrl.startsWith("http://")) {
        // 将HTTP图片转换为base64
        return await convertImageToBase64(imageUrl);
      } else {
        // HTTPS图片保持原样
        return imageUrl;
      }
    }),
  );
  return processedImages;
}
