import { Color } from "@raycast/api";
import { alphabetical, fork, group, mapEntries, sort } from "radash";

import type {
  BatteryFailure,
  BatteryReading,
  BatteryReport,
} from "../service/batteryService";
import type { HidDeviceInfo } from "../types/hid";
import { formatHexDump } from "./hex";

/** 电量颜色阈值：≥60 绿 / 20-59 黄 / <20 红 */
export const batteryColor = (level: number): Color =>
  level >= 60 ? Color.Green : level >= 20 ? Color.Yellow : Color.Red;

/** 读数超过该时长视为过期（毫秒） */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** 读数是否已过期（长时间未刷新时提示用户） */
export const isStale = (reading: BatteryReading): boolean =>
  Date.now() - reading.readAt.getTime() > STALE_AFTER_MS;

/** 格式化为 4 位大写十六进制 */
const toHex4 = (value: number): string =>
  value.toString(16).toUpperCase().padStart(4, "0");

/** VID:PID 格式化为 3434:D028 样式 */
export const formatVidPid = (device: HidDeviceInfo): string =>
  `${toHex4(device.vendorId)}:${toHex4(device.productId)}`;

/** 接口号展示（-1 表示未知） */
export const formatInterface = (device: HidDeviceInfo): string =>
  device.interfaceNumber >= 0 ? String(device.interfaceNumber) : "unknown";

/** 时间展示 */
export const formatTime = (date: Date): string => date.toLocaleTimeString();

/** 设备展示名（产品名缺失时退回 VID:PID） */
export const titleOf = (device: HidDeviceInfo): string =>
  device.productName && device.productName !== "-"
    ? device.productName
    : formatVidPid(device);

/** 列表数据 */
export interface DeviceBatteryViewData {
  /** 电量读数（低电量优先） */
  readings: BatteryReading[];
  /** 其他 HID 设备（按名称排序、同一物理设备已去重） */
  others: HidDeviceInfo[];
  failures: BatteryFailure[];
}

/** 仅列出用户外设类传输；内置 SPI / FIFO / 虚拟设备不展示 */
const VISIBLE_TRANSPORTS = ["USB", "Bluetooth", "BluetoothLowEnergy"];

/** 准备列表数据：过滤内置设备、同一物理设备去重、读数按电量升序 */
export const prepareViewData = (
  report: BatteryReport,
): DeviceBatteryViewData => {
  const [visible] = fork(report.unmatched, (device) =>
    VISIBLE_TRANSPORTS.includes(device.transport),
  );

  // 同一物理设备可能暴露多个 HID 接口，按 VID/PID/位置 ID 去重
  const deduped = mapEntries(
    group(
      visible,
      (device) => `${device.vendorId}:${device.productId}:${device.locationId}`,
    ),
    (key, interfaces) => [key, (interfaces ?? [])[0]],
  );
  const others = alphabetical(
    Object.values(deduped).filter(
      (device): device is HidDeviceInfo => device !== undefined,
    ),
    (device) => titleOf(device),
  );

  return {
    readings: sort(report.readings, (reading) => reading.batteryLevel),
    others,
    failures: report.failures,
  };
};

/** 电量读数详情 */
export const readingDetailMarkdown = (reading: BatteryReading): string => {
  const { device, protocol } = reading;
  return [
    `# ${titleOf(device)}`,
    "",
    `**Battery**: ${reading.batteryLevel}%${reading.isCharging ? " ⚡ Charging" : ""}`,
    `**Protocol**: ${protocol.id}`,
    `**VID:PID**: ${formatVidPid(device)}`,
    `**Interface**: ${formatInterface(device)}`,
    `**Usage Page / Usage**: ${toHex4(protocol.usagePage)} / ${toHex4(protocol.usage)}`,
    `**Transport**: ${device.transport}`,
    `**Read at**: ${formatTime(reading.readAt)}`,
    `**Source**: [${protocol.source}](${protocol.source})`,
    ...(protocol.notes ? [`**Notes**: ${protocol.notes}`] : []),
    "",
    "## Raw reply",
    "",
    "```",
    formatHexDump(reading.rawReply),
    "```",
    "",
    "## Query",
    "",
    "```",
    `request: ${protocol.request}`,
    `reply prefix: ${protocol.replyPrefix}  battery offset: ${protocol.batteryOffset}` +
      (protocol.chargingBit
        ? `  charging bit: 0x${protocol.chargingBit.toString(16)}`
        : ""),
    "```",
  ].join("\n");
};

/** 查询失败详情 */
export const failureDetailMarkdown = (failure: BatteryFailure): string => {
  const { device, protocol, error } = failure;
  return [
    `# ${titleOf(device)}`,
    "",
    `**Protocol**: ${protocol.id}`,
    `**VID:PID**: ${formatVidPid(device)}`,
    `**Interface**: ${formatInterface(device)}`,
    `**Transport**: ${device.transport}`,
    `**Error**: ${error._tag}`,
    `**Message**: ${error.message}`,
    ...("ioReturn" in error && error.ioReturn
      ? [`**IOKit return**: ${error.ioReturn}`]
      : []),
    "",
    "若打开接口失败（如 0xE00002C5 / 0xE00002E2），",
    "通常是权限或沙箱限制，可先在终端直接运行 hid-query 验证。",
  ].join("\n");
};

/** 其他 HID 设备详情 */
export const deviceDetailMarkdown = (device: HidDeviceInfo): string =>
  [
    `# ${titleOf(device)}`,
    "",
    `**VID:PID**: ${formatVidPid(device)}`,
    `**Interface**: ${formatInterface(device)}`,
    `**Usage Page / Usage**: ${toHex4(device.usagePage)} / ${toHex4(device.usage)}`,
    `**Transport**: ${device.transport}`,
    `**Manufacturer**: ${device.manufacturer}`,
    `**Serial**: ${device.serialNumber}`,
    "",
    "该设备尚未被协议表覆盖，暂时无法读取电量。",
    "可在 `src/constants/devices.ts` 中补充协议定义。",
  ].join("\n");
