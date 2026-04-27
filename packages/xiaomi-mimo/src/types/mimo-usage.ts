export interface TokenUsageItem {
  name: string;
  used: number;
  limit: number;
  percent: number;
}

export interface TokenUsageGroup {
  percent: number;
  items: TokenUsageItem[];
}

export interface MiMoUsageData {
  monthUsage: TokenUsageGroup;
  usage: TokenUsageGroup;
}

export interface MiMoApiResponse {
  code: number;
  message: string;
  data: MiMoUsageData;
}
