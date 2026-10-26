import { Data } from "effect";

/** 原生 hid-query 工具缺失或不可执行（未编译 / 拷贝失败） */
export class NativeToolMissingError extends Data.TaggedError(
  "NativeToolMissingError",
)<{
  readonly message: string;
}> {}

/** hid-query 进程执行失败或返回失败 JSON */
export class HidTransportError extends Data.TaggedError("HidTransportError")<{
  readonly message: string;
  /** 失败类别（对应 hid-query 的 code） */
  readonly code?: string;
  /** IOKit 返回值，如 0xE00002C5（权限不足） */
  readonly ioReturn?: string;
}> {}

/** 响应报文不合法（报文头 / 长度 / 取值范围校验失败） */
export class HidProtocolError extends Data.TaggedError("HidProtocolError")<{
  readonly message: string;
  /** 原始响应报文（hex），便于排查协议 */
  readonly raw?: string;
}> {}

/** 电量查询相关的全部结构化错误 */
export type BatteryError =
  | NativeToolMissingError
  | HidTransportError
  | HidProtocolError;
