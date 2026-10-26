import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { environment } from "@raycast/api";
import { Effect } from "effect";
import { tryit } from "radash";

import type { ReportEncoding } from "../constants/devices";
import { HidTransportError, NativeToolMissingError } from "../types/errors";
import type {
  HidDeviceInfo,
  HidErrorOutput,
  HidListOutput,
  HidQueryOutput,
} from "../types/hid";

const execFileAsync = promisify(execFile);

/** 单次进程执行的硬超时（毫秒） */
const EXEC_TIMEOUT_MS = 8000;

/** assets 中的原生工具（scripts/build-native.js 编译产出） */
const TOOL_ASSET = path.join(environment.assetsPath, "hid-query");
/** 运行位置：assets 目录不可执行，需拷贝到 supportPath */
const TOOL_BIN = path.join(environment.supportPath, "hid-query");

/**
 * 确保 hid-query 工具就绪。
 * 资产与运行副本大小不一致时重新拷贝并赋予执行权限。
 */
export const ensureTool = (): Effect.Effect<string, NativeToolMissingError> =>
  Effect.try({
    try: () => {
      if (!fs.existsSync(TOOL_ASSET)) {
        throw new Error(
          'hid-query not found in assets. Run "npm run build-native" first.',
        );
      }

      const sourceSize = fs.statSync(TOOL_ASSET).size;
      const targetSize = fs.existsSync(TOOL_BIN)
        ? fs.statSync(TOOL_BIN).size
        : -1;
      if (sourceSize !== targetSize) {
        fs.copyFileSync(TOOL_ASSET, TOOL_BIN);
        fs.chmodSync(TOOL_BIN, 0o755);
      }
      return TOOL_BIN;
    },
    catch: (error) =>
      new NativeToolMissingError({
        message: error instanceof Error ? error.message : String(error),
      }),
  });

/** 将 child_process 错误映射为结构化的 HidTransportError */
const toTransportError = (error: unknown): HidTransportError => {
  const err = error as {
    stdout?: string;
    stderr?: string;
    message?: string;
    killed?: boolean;
    code?: string | number;
  };

  // hid-query 失败时也输出结构化 JSON，优先解析出失败类别与 IOKit 返回值
  const [parseError, payload] = tryit(() => JSON.parse(err.stdout ?? ""))();
  if (
    !parseError &&
    payload &&
    typeof payload === "object" &&
    "ok" in payload
  ) {
    const failed = payload as HidErrorOutput;
    if (failed.ok === false) {
      return new HidTransportError({
        message: failed.message,
        code: failed.code,
        ioReturn: failed.ioReturn,
      });
    }
  }

  if (err.killed) {
    return new HidTransportError({
      message: "hid-query timed out",
      code: "timeout",
    });
  }

  return new HidTransportError({
    message: (err.stderr || err.message || "hid-query failed").trim(),
    code: String(err.code ?? "exec-failed"),
  });
};

/** 执行 hid-query 并返回 stdout */
const runTool = (
  args: string[],
): Effect.Effect<string, NativeToolMissingError | HidTransportError> =>
  Effect.gen(function* () {
    const bin = yield* ensureTool();
    const { stdout } = yield* Effect.tryPromise({
      try: () =>
        execFileAsync(bin, args, {
          encoding: "utf8",
          timeout: EXEC_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        }),
      catch: toTransportError,
    });
    return stdout;
  });

/** 解析 hid-query 输出；失败 JSON 与非法 JSON 均映射为 HidTransportError */
const parseOutput = <T>(stdout: string): Effect.Effect<T, HidTransportError> =>
  Effect.gen(function* () {
    const [parseError, parsed] = tryit((): unknown => JSON.parse(stdout))();
    if (parseError) {
      return yield* Effect.fail(
        new HidTransportError({
          message: "hid-query output is not valid JSON",
          code: "parse",
        }),
      );
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "ok" in parsed &&
      (parsed as HidErrorOutput).ok === false
    ) {
      const failed = parsed as HidErrorOutput;
      return yield* Effect.fail(
        new HidTransportError({
          message: failed.message,
          code: failed.code,
          ioReturn: failed.ioReturn,
        }),
      );
    }

    return parsed as T;
  });

/** 枚举全部 HID 接口元数据 */
export const listDevices = (): Effect.Effect<
  HidDeviceInfo[],
  NativeToolMissingError | HidTransportError
> =>
  Effect.gen(function* () {
    const stdout = yield* runTool(["list", "--json"]);
    const output = yield* parseOutput<HidListOutput>(stdout);
    return output.devices ?? [];
  });

/** query 子命令参数 */
export interface QueryDeviceOptions {
  vid: number;
  pid: number;
  usagePage: number;
  usage: number;
  /** Feature Report 查询指令（hex） */
  request: string;
  /** 响应报文头（hex） */
  replyPrefix: string;
  /** 发送编码 */
  reportEncoding: ReportEncoding;
  /** 等待 Input Report 的超时（毫秒） */
  timeoutMs?: number;
}

/** 向指定 HID 接口发送 Feature Report 并取回响应报文 */
export const queryDevice = (
  options: QueryDeviceOptions,
): Effect.Effect<HidQueryOutput, NativeToolMissingError | HidTransportError> =>
  Effect.gen(function* () {
    const args = [
      "query",
      "--vid",
      String(options.vid),
      "--pid",
      String(options.pid),
      "--usage-page",
      String(options.usagePage),
      "--usage",
      String(options.usage),
      "--request",
      options.request,
      "--reply-prefix",
      options.replyPrefix,
      "--report-encoding",
      options.reportEncoding,
      "--timeout-ms",
      String(options.timeoutMs ?? 1000),
      "--json",
    ];
    const stdout = yield* runTool(args);
    return yield* parseOutput<HidQueryOutput>(stdout);
  });
