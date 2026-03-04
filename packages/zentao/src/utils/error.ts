/** 登录响应结果接口 */
export interface LoginResult {
  result: string;
  message?: string;
  locate?: string;
}

/** 会话过期异常类 */
export class SessionExpiredError extends Error {
  constructor(message = "登录会话已过期，请重新登录") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** 登录失败异常类 */
export class LoginFailedError extends Error {
  public readonly loginResult?: LoginResult;

  constructor(message = "登录失败", loginResult?: LoginResult) {
    super(message);
    this.name = "LoginFailedError";
    this.loginResult = loginResult;
  }
}

/** 登录响应解析失败异常类 */
export class LoginResponseParseError extends Error {
  public readonly responseText: string;

  constructor(message = "解析登录响应失败", responseText = "") {
    super(message);
    this.name = "LoginResponseParseError";
    this.responseText = responseText;
  }
}

/** 会话刷新异常类 */
export class SessionRefreshError extends Error {
  public readonly cause?: Error;

  constructor(message = "会话刷新失败", cause?: Error) {
    super(message);
    this.name = "SessionRefreshError";
    this.cause = cause;
  }
}
