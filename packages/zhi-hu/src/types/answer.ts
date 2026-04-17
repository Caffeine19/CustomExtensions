/** 知乎分页信息 */
export interface ZhihuPaging {
  is_end: boolean;
  is_start: boolean;
  totals: number;
  next: string;
  previous: string;
}

/** 知乎问题 */
export interface ZhihuQuestion {
  id: number;
  title: string;
  type: string;
  url: string;
}

/** 知乎互动统计 */
export interface ZhihuReactionStatistics {
  like_count: number;
  favorites: number;
}

/** 知乎互动信息 */
export interface ZhihuReaction {
  statistics: ZhihuReactionStatistics;
}

/** 知乎回答 */
export interface ZhihuAnswer {
  id: string;
  excerpt: string;
  comment_count: number;
  created_time: number;
  is_collapsed: boolean;
  question: ZhihuQuestion;
  reaction: ZhihuReaction;
  url: string;
}

/** 知乎回答列表 API 响应 */
export interface ZhihuAnswersResponse {
  paging: ZhihuPaging;
  data: ZhihuAnswer[];
}
