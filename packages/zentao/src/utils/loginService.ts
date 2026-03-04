import { getPreferenceValues } from "@raycast/api";

import { LoginFailedError, LoginResponseParseError, LoginResult, SessionRefreshError } from "./error";
import { logger } from "./logger";

/**
 * 检查 HTML 响应是否表示会话已过期
 *
 * @param html - 从禅道系统获取的 HTML 内容
 * @returns 如果会话已过期返回 true，否则返回 false
 */
export function isSessionExpired(html: string): boolean {
  // 检查是否包含重定向到登录页面的脚本
  // 过期的会话会返回类似: self.location = '/user-login-XXXXX.html';
  const loginRedirectPattern = /self\.location\s*=\s*['"](.*user-login.*\.html)['"]/;
  const hasLoginRedirect = loginRedirectPattern.test(html);
  return hasLoginRedirect;
}

/**
 * 获取用于登录验证的随机数
 *
 * @returns Promise<string> - 验证随机数
 */
export async function refreshRandom(): Promise<string> {
  const preferences = getPreferenceValues<Preferences>();
  const { zentaoUrl, zentaoSid, username } = preferences;

  try {
    const url = `${zentaoUrl}/user-refreshRandom.html`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        Connection: "keep-alive",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on; za=${username}`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        Referer: `${zentaoUrl}/user-login.html`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const randomText = await response.text();
    const verifyRand = randomText.trim();

    // 保存到日志文件用于调试
    logger.saveApiResponse("refresh-random.log", verifyRand, "Saved refresh random response to log file");

    logger.debug("refreshRandom ~ verifyRand:", verifyRand);
    return verifyRand;
  } catch (error) {
    logger.error("Error refreshing random:", error instanceof Error ? error : String(error));
    throw error;
  }
}

/**
 * 重新登录用户以刷新会话
 *
 * @throws {LoginFailedError} 当登录失败时
 * @throws {LoginResponseParseError} 当响应解析失败时
 * @throws {Error} 当网络请求失败时
 */
export async function reLoginUser(): Promise<void> {
  const preferences = getPreferenceValues<Preferences>();
  const { zentaoUrl, zentaoSid, username, password } = preferences;

  try {
    // 首先获取验证随机数
    const verifyRand = await refreshRandom();

    // 构建登录URL
    const loginUrl = `${zentaoUrl}/user-login.html`;

    // 使用 FormData 构建登录请求体
    const formData = new FormData();
    formData.append("account", username);
    formData.append("password", password);
    formData.append("passwordStrength", "2");
    formData.append("referer", "/");
    formData.append("verifyRand", verifyRand);
    formData.append("keepLogin", "1");
    formData.append("captcha", "");

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        Connection: "keep-alive",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: `zentaosid=${zentaoSid}; lang=zh-cn; device=desktop; theme=default; keepLogin=on`,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        Origin: zentaoUrl,
        Referer: loginUrl,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();

    // 保存登录响应到日志文件用于调试
    logger.saveApiResponse("user-login.log", responseText, "Saved user login response to log file");

    // 尝试解析JSON响应
    let loginResult: LoginResult;
    try {
      loginResult = JSON.parse(responseText) as LoginResult;
      logger.debug("reLoginUser ~ loginResult:", loginResult);
    } catch (parseError) {
      logger.error("解析登录响应失败:", parseError instanceof Error ? parseError : String(parseError));
      logger.error("响应内容:", responseText);
      throw new LoginResponseParseError("解析登录响应失败", responseText);
    }

    // 检查登录结果
    if (loginResult.result === "success") {
      logger.info("用户重新登录成功");
      // 成功时不抛出异常，函数正常返回
    } else {
      logger.error("用户重新登录失败:", loginResult);
      throw new LoginFailedError(`登录失败: ${loginResult.message || "未知原因"}`, loginResult);
    }
  } catch (error) {
    logger.error("Error during user relogin:", error instanceof Error ? error : String(error));

    // 如果是我们已知的错误类型，直接重新抛出
    if (error instanceof LoginFailedError || error instanceof LoginResponseParseError) {
      throw error;
    }

    // 对于其他错误，包装在 SessionRefreshError 中
    throw new SessionRefreshError("会话刷新过程中发生错误", error as Error);
  }
}
