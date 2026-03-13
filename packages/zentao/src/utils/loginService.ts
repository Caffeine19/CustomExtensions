import { getPreferenceValues } from "@raycast/api";
import { Effect } from "effect";

import { HttpError, LoginFailedError, LoginResponseParseError, LoginResult, SessionRefreshError } from "./error";
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
  return loginRedirectPattern.test(html);
}

/**
 * 获取用于登录验证的随机数
 *
 * @returns Effect 包含验证随机数
 */
export const refreshRandom = (): Effect.Effect<string, HttpError | SessionRefreshError> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username } = preferences;

    const url = `${zentaoUrl}/user-refreshRandom.html`;

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
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
        }),
      catch: (e) => new SessionRefreshError({ message: "获取验证随机数失败", cause: e }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new HttpError({ status: response.status, message: `HTTP error! status: ${response.status}` }),
      );
    }

    const randomText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) => new SessionRefreshError({ message: "读取响应内容失败", cause: e }),
    });

    const verifyRand = randomText.trim();

    logger.saveApiResponse("refresh-random.log", verifyRand, "Saved refresh random response to log file");
    logger.debug("refreshRandom ~ verifyRand:", verifyRand);

    return verifyRand;
  });

/**
 * 重新登录用户以刷新会话
 *
 * @returns Effect<void, LoginFailedError | LoginResponseParseError | SessionRefreshError | HttpError>
 */
export const reLoginUser = (): Effect.Effect<
  void,
  LoginFailedError | LoginResponseParseError | SessionRefreshError | HttpError
> =>
  Effect.gen(function* () {
    const preferences = getPreferenceValues<Preferences>();
    const { zentaoUrl, zentaoSid, username, password } = preferences;

    // 首先获取验证随机数
    const verifyRand = yield* refreshRandom();

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

    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(loginUrl, {
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
        }),
      catch: (e) => new SessionRefreshError({ message: "发送登录请求失败", cause: e }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new HttpError({ status: response.status, message: `HTTP error! status: ${response.status}` }),
      );
    }

    const responseText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (e) => new SessionRefreshError({ message: "读取登录响应失败", cause: e }),
    });

    logger.saveApiResponse("user-login.log", responseText, "Saved user login response to log file");

    const loginResult = yield* Effect.try({
      try: () => JSON.parse(responseText) as LoginResult,
      catch: () =>
        new LoginResponseParseError({
          message: "解析登录响应失败",
          responseText,
        }),
    });

    logger.debug("reLoginUser ~ loginResult:", loginResult);

    if (loginResult.result !== "success") {
      logger.error("用户重新登录失败:", loginResult);
      return yield* Effect.fail(
        new LoginFailedError({
          message: `登录失败: ${loginResult.message || "未知原因"}`,
          loginResult,
        }),
      );
    }

    logger.info("用户重新登录成功");
  });
