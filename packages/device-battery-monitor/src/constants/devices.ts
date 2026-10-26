/** Feature Report 发送编码 */
export type ReportEncoding = "auto" | "split" | "raw";

/**
 * 2.4 GHz 接收器电量查询协议定义。
 * 新增设备只需在此表增加一条记录，无需改动查询逻辑。
 */
export interface HidBatteryProtocol {
  /** 协议标识 */
  id: string;
  /** 展示名称 */
  name: string;
  /** USB 厂商 ID */
  vendorId: number;
  /** USB 接收器产品 ID */
  productId: number;
  /** 目标 HID 接口的 Usage Page（厂商自定义接口） */
  usagePage: number;
  /** 目标 HID 接口的 Usage */
  usage: number;
  /** USB 接口号（参考值，仅用于展示与核对，不参与匹配） */
  interfaceNumber?: number;
  /** Feature Report 查询指令（hex），如 "b306" + 62 字节 0x00 */
  request: string;
  /** 响应 Input Report 的报文头（hex） */
  replyPrefix: string;
  /** 电量字节偏移（自响应报文首字节计） */
  batteryOffset: number;
  /** 充电标志位掩码；电量字节该位为 1 表示充电中，去掉该位后才是电量值 */
  chargingBit?: number;
  /** 发送编码；已实测的设备可指定编码跳过自动探测 */
  reportEncoding: ReportEncoding;
  /** 协议来源 */
  source: string;
  /** 备注（实测状态等） */
  notes?: string;
}

/** 电量字段合法范围（百分比） */
export const BATTERY_MIN = 0;
export const BATTERY_MAX = 100;

/**
 * 已支持的协议表。
 * 注意：按 VID/PID 精确匹配，"支持某品牌"不等于支持该品牌全部设备；
 * 同一设备的有线与无线模式可能具有不同的 USB ID。
 */
export const HID_BATTERY_PROTOCOLS: HidBatteryProtocol[] = [
  {
    id: "keychron-ultra-link-8k",
    name: "Keychron Ultra-Link 8K",
    vendorId: 0x3434,
    productId: 0xd028,
    usagePage: 0xffc1,
    usage: 0x0001,
    interfaceNumber: 4,
    request: "b306" + "00".repeat(62),
    replyPrefix: "b406",
    batteryOffset: 20,
    chargingBit: 0x80,
    reportEncoding: "raw",
    source:
      "https://github.com/HeyOkay/HaloBattery/blob/main/docs/protocols.md",
    notes:
      "2026-10-26 macOS 实测通过（键鼠共用接收器，报文与 keychron-battery-dkms 协议一致）；" +
      "充电时电量字节最高位置 1（如 0x95 = 充电中 + 21%），已实测验证",
  },
  {
    id: "keychron-m5-wired",
    name: "Keychron M5（有线模式）",
    vendorId: 0x3434,
    productId: 0xd048,
    usagePage: 0xffc1,
    usage: 0x0001,
    request: "b306" + "00".repeat(62),
    replyPrefix: "b406",
    batteryOffset: 20,
    chargingBit: 0x80,
    reportEncoding: "auto",
    source:
      "https://github.com/HeyOkay/HaloBattery/blob/main/providers/keychron.py",
    notes: "来自 HaloBattery 协议表，本机未实测",
  },
];
