/** hid-query 工具枚举出的 HID 接口元数据 */
export interface HidDeviceInfo {
  /** USB 厂商 ID */
  vendorId: number;
  /** USB 产品 ID */
  productId: number;
  /** 主 Usage Page（厂商自定义接口如 0xFFC1） */
  usagePage: number;
  /** 主 Usage */
  usage: number;
  /** USB 接口号；无法确定时为 -1 */
  interfaceNumber: number;
  /** USB 位置 ID（同一物理设备的多个接口共享） */
  locationId: number;
  /** 传输方式：USB / Bluetooth / BluetoothLowEnergy / SPI ... */
  transport: string;
  productName: string;
  manufacturer: string;
  serialNumber: string;
}

/** hid-query list 的成功输出 */
export interface HidListOutput {
  ok: true;
  devices: HidDeviceInfo[];
}

/** hid-query query 的成功输出 */
export interface HidQueryOutput {
  ok: true;
  /** Feature Report 发送编码：split=报告 ID 为首字节；raw=报告 ID 为 0 整段发送 */
  encoding: "split" | "raw";
  /** 响应报文（小写 hex） */
  reply: string;
  replyLength: number;
  /** 实际响应的 HID 接口 */
  device: HidDeviceInfo;
}

/** hid-query 的失败输出 */
export interface HidErrorOutput {
  ok: false;
  /** 失败类别：no-device / open-failed / set-report-failed / timeout / ... */
  code: string;
  message: string;
  /** IOKit 返回值（十六进制字符串），便于定位权限类问题 */
  ioReturn: string;
}
