import * as fs from "fs";
import * as path from "path";

/** 日志级别枚举 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

/** 日志输出接口 */
interface LogOutput {
  console?: boolean;
  file?: string;
}

/** 可记录的数据类型 */
type LogData = string | number | boolean | object | Error | null | undefined;

/** 禅道扩展专用日志工具类 */
class ZentaoLogger {
  private readonly logDir: string;

  constructor() {
    // 设置日志目录为项目根目录下的 log 文件夹
    this.logDir = path.join(__dirname, "../../log");
    this.ensureLogDir();
  }

  /** 确保日志目录存在 */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * 格式化日志消息
   *
   * @param level - 日志级别
   * @param message - 日志消息
   * @param data - 附加数据
   */
  private formatMessage(level: LogLevel, message: string, data?: LogData): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | Data: ${JSON.stringify(data, null, 2)}` : "";
    return `[${timestamp}] [${level}] ${message}${dataStr}`;
  }

  /**
   * 输出日志到控制台，使用彩色表情符号
   *
   * @param level - 日志级别
   * @param message - 日志消息
   * @param data - 附加数据
   */
  private logToConsole(level: LogLevel, message: string, data?: LogData): void {
    const emoji = {
      [LogLevel.DEBUG]: "🐛",
      [LogLevel.INFO]: "🚀",
      [LogLevel.WARN]: "⚠️",
      [LogLevel.ERROR]: "❌",
    };

    const formattedMessage = `${emoji[level]} ~ ${message}`;

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        if (data !== undefined) {
          console.log(formattedMessage, data);
        } else {
          console.log(formattedMessage);
        }
        break;
      case LogLevel.WARN:
        if (data !== undefined) {
          console.warn(formattedMessage, data);
        } else {
          console.warn(formattedMessage);
        }
        break;
      case LogLevel.ERROR:
        if (data !== undefined) {
          console.error(formattedMessage, data);
        } else {
          console.error(formattedMessage);
        }
        break;
    }
  }

  /**
   * 输出日志到文件
   *
   * @param fileName - 文件名
   * @param content - 内容
   * @param level - 日志级别（可选，用于格式化）
   * @param message - 日志消息（可选，用于格式化）
   */
  private logToFile(fileName: string, content: string, level?: LogLevel, message?: LogData): void {
    const filePath = path.join(this.logDir, fileName);

    try {
      if (level && message !== undefined) {
        // 如果提供了级别和消息，则格式化输出
        const formattedContent = this.formatMessage(level, content, message);
        fs.writeFileSync(filePath, formattedContent, "utf8");
      } else {
        // 否则直接写入原始内容（用于API响应等）
        fs.writeFileSync(filePath, content, "utf8");
      }
    } catch (error) {
      console.error("Failed to write log file:", error);
    }
  }

  /**
   * 记录调试信息
   *
   * @param message - 日志消息
   * @param data - 附加数据
   * @param output - 输出配置
   */
  debug(message: string, data?: LogData, output: LogOutput = { console: true }): void {
    if (output.console) {
      this.logToConsole(LogLevel.DEBUG, message, data);
    }
    if (output.file) {
      this.logToFile(output.file, message, LogLevel.DEBUG, data);
    }
  }

  /**
   * 记录信息
   *
   * @param message - 日志消息
   * @param data - 附加数据
   * @param output - 输出配置
   */
  info(message: string, data?: LogData, output: LogOutput = { console: true }): void {
    if (output.console) {
      this.logToConsole(LogLevel.INFO, message, data);
    }
    if (output.file) {
      this.logToFile(output.file, message, LogLevel.INFO, data);
    }
  }

  /**
   * 记录警告
   *
   * @param message - 日志消息
   * @param data - 附加数据
   * @param output - 输出配置
   */
  warn(message: string, data?: LogData, output: LogOutput = { console: true }): void {
    if (output.console) {
      this.logToConsole(LogLevel.WARN, message, data);
    }
    if (output.file) {
      this.logToFile(output.file, message, LogLevel.WARN, data);
    }
  }

  /**
   * 记录错误
   *
   * @param message - 日志消息
   * @param error - 错误对象或数据
   * @param output - 输出配置
   */
  error(message: string, error?: LogData, output: LogOutput = { console: true }): void {
    if (output.console) {
      this.logToConsole(LogLevel.ERROR, message, error);
    }
    if (output.file) {
      this.logToFile(output.file, message, LogLevel.ERROR, error);
    }
  }

  /**
   * 保存API响应到文件（用于调试）
   *
   * @param fileName - 文件名
   * @param content - 响应内容
   * @param logMessage - 可选的日志消息
   */
  saveApiResponse(fileName: string, content: string, logMessage?: string): void {
    this.logToFile(fileName, content);
    if (logMessage) {
      this.info(`${logMessage}: ${path.join(this.logDir, fileName)}`);
    }
  }

  /** 获取日志目录路径 */
  getLogDir(): string {
    return this.logDir;
  }
}

// 导出单例实例
export const logger = new ZentaoLogger();
