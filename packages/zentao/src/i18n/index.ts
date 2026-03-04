import { getPreferenceValues } from "@raycast/api";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUS from "./locales/en-US.json";
// 导入翻译资源
import zhCN from "./locales/zh-CN.json";

export type Language = "zh-CN" | "en-US";

// 导出用于TypeScript类型定义的常量
export const defaultNS = "translation";
export const resources = {
  "zh-CN": {
    translation: zhCN,
  },
  "en-US": {
    translation: enUS,
  },
} as const;

/**
 * 获取当前用户偏好的语言设置
 *
 * @returns 用户配置的语言代码
 */
function getUserLanguage(): Language {
  const preferences = getPreferenceValues<Preferences>();
  return preferences.language;
}

// 配置 i18next
i18n
  .use(initReactI18next) // 使用 react-i18next 插件
  .init({
    // 翻译资源
    resources,

    // 默认语言
    lng: getUserLanguage(),

    // 后备语言
    fallbackLng: "en-US",

    // 开发模式调试
    debug: process.env.NODE_ENV === "development",

    // 插值配置
    interpolation: {
      escapeValue: false, // React 已经安全处理
    },

    // 命名空间配置
    defaultNS,
    ns: ["translation"],

    // 缓存配置
    saveMissing: false,

    // 键分隔符配置
    keySeparator: ".",
    nsSeparator: ":",
  });

export default i18n;
