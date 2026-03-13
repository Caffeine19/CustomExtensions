import { Data } from "effect";

/** 登录响应结果接口 */
export interface LoginResult {
  result: string;
  message?: string;
  locate?: string;
}

/** 会话过期错误 */
export class SessionExpiredError extends Data.TaggedError("SessionExpiredError")<{
  readonly message: string;
}> {}

/** 登录失败错误 */
export class LoginFailedError extends Data.TaggedError("LoginFailedError")<{
  readonly message: string;
  readonly loginResult?: LoginResult;
}> {}

/** 登录响应解析失败错误 */
export class LoginResponseParseError extends Data.TaggedError("LoginResponseParseError")<{
  readonly message: string;
  readonly responseText: string;
}> {}

/** 会话刷新错误 */
export class SessionRefreshError extends Data.TaggedError("SessionRefreshError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** HTTP 请求错误 */
export class HttpError extends Data.TaggedError("HttpError")<{
  readonly status: number;
  readonly message: string;
}> {}

/** HTML 解析错误 */
export class HtmlParseError extends Data.TaggedError("HtmlParseError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
