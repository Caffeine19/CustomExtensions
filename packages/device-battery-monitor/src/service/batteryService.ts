import { Effect, Schedule } from "effect";
import { fork } from "radash";

import {
  BATTERY_MAX,
  BATTERY_MIN,
  HID_BATTERY_PROTOCOLS,
  type HidBatteryProtocol,
} from "../constants/devices";
import type { BatteryError } from "../types/errors";
import {
  HidProtocolError,
  HidTransportError,
  NativeToolMissingError,
} from "../types/errors";
import type { HidDeviceInfo } from "../types/hid";
import { hexToBytes } from "../utils/hex";
import { listDevices, queryDevice } from "../utils/native";

/** 单个 HID 接口的电量读数 */
export interface BatteryReading {
  /** 命中的协议定义 */
  protocol: HidBatteryProtocol;
  /** 实际响应的 HID 接口 */
  device: HidDeviceInfo;
  /** 电量百分比（0-100） */
  batteryLevel: number;
  /** 是否正在充电（协议定义了充电标志位时才可判断） */
  isCharging: boolean;
  /** 原始响应报文（hex），便于排查协议 */
  rawReply: string;
  readAt: Date;
}

/** 单个设备的查询失败记录 */
export interface BatteryFailure {
  device: HidDeviceInfo;
  protocol: HidBatteryProtocol;
  error: BatteryError;
}

/** 一次批量查询的结果（单个设备失败不影响其他设备） */
export interface BatteryReport {
  readings: BatteryReading[];
  /** 枚举到但协议表未覆盖的 HID 接口 */
  unmatched: HidDeviceInfo[];
  failures: BatteryFailure[];
  readAt: Date;
}

/** 判断 HID 接口是否命中协议表条目（VID/PID/Usage 精确匹配） */
export const matchesProtocol = (
  device: HidDeviceInfo,
  protocol: HidBatteryProtocol,
): boolean =>
  device.vendorId === protocol.vendorId &&
  device.productId === protocol.productId &&
  device.usagePage === protocol.usagePage &&
  device.usage === protocol.usage;

/** 找到 HID 接口对应的协议定义 */
const findProtocol = (device: HidDeviceInfo): HidBatteryProtocol | undefined =>
  HID_BATTERY_PROTOCOLS.find((protocol) => matchesProtocol(device, protocol));

/** 电量字段解析结果 */
interface ParsedBattery {
  batteryLevel: number;
  isCharging: boolean;
}

/** 校验响应报文并提取电量字段（协议表的 replyPrefix / batteryOffset / chargingBit） */
const parseBatteryLevel = (
  protocol: HidBatteryProtocol,
  replyHex: string,
): Effect.Effect<ParsedBattery, HidProtocolError> =>
  Effect.gen(function* () {
    const bytes = yield* Effect.try({
      try: () => hexToBytes(replyHex),
      catch: () =>
        new HidProtocolError({
          message: "response is not valid hex",
          raw: replyHex,
        }),
    });

    const prefix = hexToBytes(protocol.replyPrefix);
    const headerMatches = prefix.every((byte, index) => bytes[index] === byte);
    if (!headerMatches) {
      return yield* Effect.fail(
        new HidProtocolError({
          message: `response header mismatch (expect ${protocol.replyPrefix})`,
          raw: replyHex,
        }),
      );
    }

    const raw = bytes[protocol.batteryOffset];
    if (raw === undefined) {
      return yield* Effect.fail(
        new HidProtocolError({
          message: `reply too short for battery offset ${protocol.batteryOffset}`,
          raw: replyHex,
        }),
      );
    }

    // 充电标志位：该位为 1 表示充电中，去掉该位后才是电量值
    const mask = protocol.chargingBit ?? 0;
    const isCharging = (raw & mask) !== 0;
    const level = raw & ~mask;

    if (level < BATTERY_MIN || level > BATTERY_MAX) {
      return yield* Effect.fail(
        new HidProtocolError({
          message: `battery byte out of range (offset ${protocol.batteryOffset}, raw 0x${raw.toString(16)})`,
          raw: replyHex,
        }),
      );
    }

    return { batteryLevel: level, isCharging };
  });

/** 单次查询：发送 Feature Report 并解析电量（不含重试） */
const queryOnce = (
  protocol: HidBatteryProtocol,
): Effect.Effect<BatteryReading, BatteryError> =>
  Effect.gen(function* () {
    const output = yield* queryDevice({
      vid: protocol.vendorId,
      pid: protocol.productId,
      usagePage: protocol.usagePage,
      usage: protocol.usage,
      request: protocol.request,
      replyPrefix: protocol.replyPrefix,
      reportEncoding: protocol.reportEncoding,
    });

    const { batteryLevel, isCharging } = yield* parseBatteryLevel(
      protocol,
      output.reply,
    );
    return {
      protocol,
      device: output.device,
      batteryLevel,
      isCharging,
      rawReply: output.reply,
      readAt: new Date(),
    };
  });

/**
 * 带超时与重试的电量查询。
 * 单次尝试 2 秒超时（覆盖无线链路往返），失败后间隔 100ms 重试，共 3 次尝试，
 * 与 HaloBattery 的重试语义一致。
 */
export const queryBattery = (
  protocol: HidBatteryProtocol,
): Effect.Effect<BatteryReading, BatteryError> =>
  queryOnce(protocol).pipe(
    Effect.timeout("2 seconds"),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(
        new HidTransportError({
          message: `query ${protocol.name} timed out`,
          code: "timeout",
        }),
      ),
    ),
    Effect.retry(
      Schedule.recurs(2).pipe(Schedule.addDelay(() => "100 millis")),
    ),
  );

/**
 * 批量查询协议表覆盖设备的电量。
 * 单个设备失败不中断整体查询，错误记录在结果的 failures 中。
 */
export const queryAllBatteries = (): Effect.Effect<
  BatteryReport,
  NativeToolMissingError | HidTransportError
> =>
  Effect.gen(function* () {
    const devices = yield* listDevices();

    // 区分"协议表覆盖"与"未覆盖"的 HID 接口
    const [supported, rest] = fork(devices, (device) =>
      HID_BATTERY_PROTOCOLS.some((p) => matchesProtocol(device, p)),
    );

    // 已支持设备的其他接口（同一接收器的鼠标/键盘接口等）不再单独列出
    const knownVidPids = new Set(
      HID_BATTERY_PROTOCOLS.map(
        (protocol) => `${protocol.vendorId}:${protocol.productId}`,
      ),
    );
    const [unmatched] = fork(
      rest,
      (device) => !knownVidPids.has(`${device.vendorId}:${device.productId}`),
    );

    // 建立接口 → 协议映射，避免后续重复查找
    const pairs = supported.flatMap((device) => {
      const protocol = findProtocol(device);
      return protocol ? [{ device, protocol }] : [];
    });

    // 并发查询，逐个捕获错误
    const results = yield* Effect.all(
      pairs.map(({ protocol }) => Effect.either(queryBattery(protocol))),
      { concurrency: 2 },
    );

    const readings: BatteryReading[] = [];
    const failures: BatteryFailure[] = [];
    results.forEach((result, index) => {
      const { device, protocol } = pairs[index];
      if (result._tag === "Right") {
        readings.push(result.right);
      } else {
        failures.push({ device, protocol, error: result.left });
      }
    });

    return { readings, unmatched, failures, readAt: new Date() };
  });
