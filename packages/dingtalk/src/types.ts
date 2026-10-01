export interface DingTalkUser {
  userid: string;
  name: string;
  avatar?: string;
  mobile?: string;
  email?: string;
  dept_id_list?: number[];
  title?: string;
  job_number?: string;
}

export interface DingTalkSearchResult {
  has_more: boolean;
  next_cursor?: number;
  users: DingTalkUser[];
}

export interface DingTalkAccessToken {
  access_token: string;
  expire_in: number;
}

export interface DingTalkApiError {
  errcode: number;
  errmsg: string;
}
