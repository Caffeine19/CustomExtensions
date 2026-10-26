/**
 * smoke 测试用的 @raycast/api 桩。
 * 仅提供 native.ts 用到的 environment 字段，让查询管线脱离 Raycast 运行时也能执行。
 */
const path = require("path");

module.exports = {
  environment: {
    assetsPath: path.join(__dirname, "..", "assets"),
    supportPath: path.join(__dirname, "..", ".smoke"),
  },
};
