import { TaggedError } from "effect/Data";
import { tryPromise } from "effect/Effect";
import { ZhihuAnswersResponse } from "../types/answer";

const ZHIHU_BASE_URL = "https://www.zhihu.com";

const INCLUDE_FIELDS = "data[*].voteup_count,comment_count,created_time,question,excerpt,reaction,is_collapsed";

export class ZhihuApiError extends TaggedError("ZhihuApiError")<{
  message: string;
  status: number;
}> {}

export class ZhihuNetworkError extends TaggedError("ZhihuNetworkError")<{
  message: string;
}> {}

export interface FetchAnswersParams {
  urlToken: string;
  cookie: string;
  offset?: number;
  limit?: number;
  sortBy?: "created" | "voteups";
}

/** 获取用户回答列表 */
export const fetchMyAnswers = (params: FetchAnswersParams) => {
  const { urlToken, cookie, offset = 0, limit = 20, sortBy = "created" } = params;

  // NOTE: URLSearchParams encodes [ ] to %5B %5D which breaks Zhihu's include parser.
  // Build the query string manually to keep [ ] unencoded.
  const queryString = [`include=${INCLUDE_FIELDS}`, `offset=${offset}`, `limit=${limit}`, `sort_by=${sortBy}`].join(
    "&",
  );
  const urlStr = `${ZHIHU_BASE_URL}/api/v4/members/${urlToken}/answers?${queryString}`;

  return tryPromise({
    try: async () => {
      const res = await fetch(urlStr, {
        headers: {
          Cookie: cookie,
          Referer: ZHIHU_BASE_URL,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        throw new ZhihuApiError({ message: `HTTP ${res.status}: ${res.statusText}`, status: res.status });
      }

      return res.json() as Promise<ZhihuAnswersResponse>;
    },
    catch: (err) => {
      if (err instanceof ZhihuApiError) return err;
      return new ZhihuNetworkError({ message: String(err) });
    },
  });
};

/** 拼接回答页面 URL */
export const buildAnswerUrl = (questionId: number, answerId: string): string =>
  `${ZHIHU_BASE_URL}/question/${questionId}/answer/${answerId}`;
