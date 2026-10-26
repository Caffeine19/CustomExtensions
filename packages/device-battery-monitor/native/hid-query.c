/*
 * hid-query — 通用 HID Feature Report 查询工具（macOS / IOKit）
 *
 * 本工具是"传输层"，不含任何具体设备协议知识：
 *   - list  枚举所有 HID 设备（VID/PID/Usage/接口号等元数据），输出 JSON
 *   - query 向指定设备发送一条 Feature Report，并等待匹配前缀的 Input Report，输出原始报文
 *
 * 协议语义（查询指令、电量字节偏移等）由 TypeScript 侧的设备协议表定义，
 * 参考实现：
 *   - HaloBattery Keychron provider: https://github.com/HeyOkay/HaloBattery
 *   - keychron-battery-dkms:         https://github.com/csutcliff/keychron-battery-dkms
 *
 * 用法：
 *   hid-query list [--json]
 *   hid-query query --vid <n> --pid <n> --request <hex>
 *                   [--usage-page <n>] [--usage <n>] [--interface <n>]
 *                   [--reply-prefix <hex>] [--report-encoding auto|split|raw]
 *                   [--timeout-ms <n>] [--json]
 *
 * 输出：stdout 仅输出 JSON（成功或失败均为 JSON），诊断信息写 stderr。
 */

#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/IOKitLib.h>
#include <IOKit/hid/IOHIDDevice.h>
#include <IOKit/hid/IOHIDKeys.h>

#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* 退出码：0 成功；2 未找到设备；3 打开失败；4 发送失败；5 超时；64 参数错误 */
enum {
  EXIT_OK = 0,
  EXIT_NO_DEVICE = 2,
  EXIT_OPEN_FAILED = 3,
  EXIT_SET_REPORT_FAILED = 4,
  EXIT_TIMEOUT = 5,
  EXIT_USAGE = 64,
};

#define MAX_REPORT 4096

/* ---------- 小工具 ---------- */

/** 解析数字参数：支持十进制与 0x 十六进制 */
static long parse_num(const char *s) {
  char *end = NULL;
  long v = strtol(s, &end, 0);
  if (end == s || *end != '\0') {
    fprintf(stderr, "invalid number: %s\n", s);
    exit(EXIT_USAGE);
  }
  return v;
}

/** 解析十六进制字符串（允许空格/冒号分隔），返回字节数；失败返回 -1 */
static int hex_decode(const char *hex, uint8_t *out, int max) {
  int n = 0;
  int hi = -1;
  for (const char *p = hex; *p; p++) {
    if (*p == ' ' || *p == ':' || *p == ',')
      continue;
    int v;
    if (*p >= '0' && *p <= '9')
      v = *p - '0';
    else if (*p >= 'a' && *p <= 'f')
      v = *p - 'a' + 10;
    else if (*p >= 'A' && *p <= 'F')
      v = *p - 'A' + 10;
    else
      return -1;
    if (hi < 0) {
      hi = v;
    } else {
      if (n >= max)
        return -1;
      out[n++] = (uint8_t)((hi << 4) | v);
      hi = -1;
    }
  }
  return hi < 0 ? n : -1;
}

/** 字节数组转小写十六进制字符串 */
static void hex_encode(const uint8_t *buf, size_t len, char *out) {
  static const char *digits = "0123456789abcdef";
  for (size_t i = 0; i < len; i++) {
    out[i * 2] = digits[buf[i] >> 4];
    out[i * 2 + 1] = digits[buf[i] & 0xf];
  }
  out[len * 2] = '\0';
}

/** 将 CFString 复制为 C 字符串（失败时写 "-"） */
static void cfstr_to_c(CFStringRef s, char *out, size_t max) {
  if (s == NULL || !CFStringGetCString(s, out, (CFIndex)max, kCFStringEncodingUTF8)) {
    snprintf(out, max, "-");
    return;
  }
  if (out[0] == '\0')
    snprintf(out, max, "-");
}

/** JSON 字符串转义后输出到缓冲（仅处理必要的字符） */
static void json_escape(const char *in, char *out, size_t max) {
  size_t j = 0;
  for (size_t i = 0; in[i] != '\0' && j + 2 < max; i++) {
    unsigned char c = (unsigned char)in[i];
    if (c == '"' || c == '\\') {
      out[j++] = '\\';
      out[j++] = (char)c;
    } else if (c < 0x20) {
      j += (size_t)snprintf(out + j, max - j, "\\u%04x", c);
    } else {
      out[j++] = (char)c;
    }
  }
  out[j] = '\0';
}

/* ---------- IORegistry 辅助 ---------- */

/**
 * 沿 IORegistry 父节点查找 USB 接口号（bInterfaceNumber）。
 * 返回接口号；未知时返回 -1。
 */
static int interface_number_for_service(io_service_t service) {
  if (service == IO_OBJECT_NULL)
    return -1;

  int result = -1;
  io_service_t cur = service;
  bool owned = false; /* IOHIDDeviceGetService 返回的引用不归本进程释放 */

  while (true) {
    io_service_t parent = IO_OBJECT_NULL;
    if (IORegistryEntryGetParentEntry(cur, kIOServicePlane, &parent) != KERN_SUCCESS)
      break;
    if (owned)
      IOObjectRelease(cur);
    cur = parent;
    owned = true;

    io_name_t cls;
    if (IOObjectGetClass(cur, cls) != KERN_SUCCESS)
      continue;
    if (strcmp(cls, "IOUSBHostInterface") == 0 || strcmp(cls, "IOUSBInterface") == 0) {
      CFTypeRef num = IORegistryEntryCreateCFProperty(cur, CFSTR("bInterfaceNumber"), kCFAllocatorDefault, 0);
      if (num != NULL) {
        if (CFGetTypeID(num) == CFNumberGetTypeID())
          CFNumberGetValue((CFNumberRef)num, kCFNumberIntType, &result);
        CFRelease(num);
      }
      break;
    }
  }

  if (owned && cur != IO_OBJECT_NULL)
    IOObjectRelease(cur);
  return result;
}

/* ---------- 设备信息 ---------- */

/**
 * 读取服务的整型属性。
 * 属性直接从 IORegistry 读取（与 ioreg 一致），无需打开设备，
 * 也避开了新版 SDK 移除 IOHIDDeviceGetVendorID 等便捷函数的问题。
 */
static int get_service_int(io_service_t service, CFStringRef key, int fallback) {
  CFTypeRef value = IORegistryEntryCreateCFProperty(service, key, kCFAllocatorDefault, 0);
  if (value == NULL)
    return fallback;

  int result = fallback;
  if (CFGetTypeID(value) == CFNumberGetTypeID())
    CFNumberGetValue((CFNumberRef)value, kCFNumberIntType, &result);
  CFRelease(value);
  return result;
}

/** 读取服务的字符串属性，失败时写 "-" */
static void get_service_str(io_service_t service, CFStringRef key, char *out, size_t max) {
  CFTypeRef value = IORegistryEntryCreateCFProperty(service, key, kCFAllocatorDefault, 0);
  if (value == NULL) {
    snprintf(out, max, "-");
    return;
  }

  if (CFGetTypeID(value) == CFStringGetTypeID())
    cfstr_to_c((CFStringRef)value, out, max);
  else
    snprintf(out, max, "-");
  CFRelease(value);
}

typedef struct {
  int vendor_id;
  int product_id;
  int usage_page;
  int usage;
  int interface_number;
  int location_id;
  char transport[32];
  char product[128];
  char manufacturer[128];
  char serial[128];
} DeviceInfo;

static void fill_device_info(io_service_t service, DeviceInfo *info) {
  memset(info, 0, sizeof(*info));
  info->vendor_id = get_service_int(service, CFSTR(kIOHIDVendorIDKey), 0);
  info->product_id = get_service_int(service, CFSTR(kIOHIDProductIDKey), 0);
  info->usage_page = get_service_int(service, CFSTR(kIOHIDPrimaryUsagePageKey), 0);
  info->usage = get_service_int(service, CFSTR(kIOHIDPrimaryUsageKey), 0);
  info->location_id = get_service_int(service, CFSTR(kIOHIDLocationIDKey), 0);
  info->interface_number = interface_number_for_service(service);

  get_service_str(service, CFSTR(kIOHIDTransportKey), info->transport, sizeof(info->transport));
  get_service_str(service, CFSTR(kIOHIDProductKey), info->product, sizeof(info->product));
  get_service_str(service, CFSTR(kIOHIDManufacturerKey), info->manufacturer, sizeof(info->manufacturer));
  get_service_str(service, CFSTR(kIOHIDSerialNumberKey), info->serial, sizeof(info->serial));
}

/** 输出设备对象（不含花括号外层逗号处理，调用方负责分隔） */
static void print_device_json(const DeviceInfo *info, FILE *out) {
  char esc_product[256], esc_manufacturer[256], esc_serial[256];
  json_escape(info->product, esc_product, sizeof(esc_product));
  json_escape(info->manufacturer, esc_manufacturer, sizeof(esc_manufacturer));
  json_escape(info->serial, esc_serial, sizeof(esc_serial));

  fprintf(out,
          "{\"vendorId\":%d,\"productId\":%d,\"usagePage\":%d,\"usage\":%d,"
          "\"interfaceNumber\":%d,\"locationId\":%d,"
          "\"transport\":\"%s\",\"productName\":\"%s\",\"manufacturer\":\"%s\",\"serialNumber\":\"%s\"}",
          info->vendor_id, info->product_id, info->usage_page, info->usage,
          info->interface_number, info->location_id,
          info->transport, esc_product, esc_manufacturer, esc_serial);
}

/* ---------- 枚举 ---------- */

/**
 * 枚举全部 IOHIDDevice 服务。
 * 直接走 IORegistry（与 ioreg 相同），不需要打开任何设备，
 * 因此不会因系统保护的键盘/鼠标类设备而报 kIOReturnNotPrivileged。
 * 返回 malloc 的服务数组；调用方负责对每个服务 IOObjectRelease 并 free 数组。
 */
static io_service_t *copy_hid_services(int *out_count) {
  *out_count = 0;

  io_iterator_t iterator = IO_OBJECT_NULL;
  if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOHIDDevice"), &iterator) != KERN_SUCCESS)
    return NULL;

  int capacity = 64;
  int count = 0;
  io_service_t *services = (io_service_t *)malloc(sizeof(io_service_t) * (size_t)capacity);

  io_service_t service;
  while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
    if (count == capacity) {
      capacity *= 2;
      services = (io_service_t *)realloc(services, sizeof(io_service_t) * (size_t)capacity);
    }
    services[count++] = service;
  }
  IOObjectRelease(iterator);

  *out_count = count;
  return services;
}

/* ---------- 输入报告捕获 ---------- */

typedef struct {
  bool got;
  uint8_t data[MAX_REPORT];
  CFIndex len;
  uint8_t prefix[16];
  int prefix_len;
} InputCapture;

/**
 * Input Report 回调。
 * 回调缓冲区通常不含报告 ID，这里统一"还原"为完整报文：
 * 报告 ID 非 0 且缓冲首字节不是该 ID 时，把报告 ID 前置。
 */
static void input_report_cb(void *context, IOReturn result, void *sender,
                            IOHIDReportType type, uint32_t report_id,
                            uint8_t *report, CFIndex report_length) {
  (void)result;
  (void)sender;
  (void)type;

  InputCapture *cap = (InputCapture *)context;
  if (cap->got || report_length < 0)
    return;

  uint8_t buf[MAX_REPORT];
  CFIndex n = 0;

  if (report_id != 0 && (report_length == 0 || report[0] != (uint8_t)report_id)) {
    if (report_length + 1 > MAX_REPORT)
      return;
    buf[0] = (uint8_t)report_id;
    memcpy(buf + 1, report, (size_t)report_length);
    n = report_length + 1;
  } else {
    if (report_length > MAX_REPORT)
      return;
    memcpy(buf, report, (size_t)report_length);
    n = report_length;
  }

  /* 前缀过滤：同一设备可能上报鼠标移动等无关 Input Report */
  if (cap->prefix_len > 0) {
    if (n < cap->prefix_len || memcmp(buf, cap->prefix, (size_t)cap->prefix_len) != 0)
      return;
  }

  memcpy(cap->data, buf, (size_t)n);
  cap->len = n;
  cap->got = true;
}

/** 在当前 RunLoop 上等待捕获完成，直到超时 */
static bool wait_for_capture(InputCapture *cap, int timeout_ms) {
  CFAbsoluteTime deadline = CFAbsoluteTimeGetCurrent() + (CFAbsoluteTime)timeout_ms / 1000.0;
  while (!cap->got && CFAbsoluteTimeGetCurrent() < deadline)
    CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.01, true);
  return cap->got;
}

/* ---------- 错误输出 ---------- */

__attribute__((noreturn)) static void print_error(const char *code, const char *message, long io_return, int exit_code) {
  printf("{\"ok\":false,\"code\":\"%s\",\"message\":\"%s\",\"ioReturn\":\"0x%08lx\"}\n", code, message,
         (unsigned long)io_return);
  fflush(stdout);
  exit(exit_code);
}

/* ---------- 子命令：list ---------- */

static int cmd_list(void) {
  int count = 0;
  io_service_t *services = copy_hid_services(&count);
  if (services == NULL)
    print_error("enumerate-failed", "IOServiceGetMatchingServices failed", 0, EXIT_NO_DEVICE);

  printf("{\"ok\":true,\"devices\":[");
  for (int i = 0; i < count; i++) {
    DeviceInfo info;
    fill_device_info(services[i], &info);
    if (i > 0)
      printf(",");
    print_device_json(&info, stdout);
    IOObjectRelease(services[i]);
  }
  printf("]}\n");

  free(services);
  return EXIT_OK;
}

/* ---------- 子命令：query ---------- */

/* Feature Report 发送编码：auto=先 split 后 raw；split=报告 ID 为首字节；raw=报告 ID 为 0 整段发送 */
enum {
  ENCODING_AUTO = 0,
  ENCODING_SPLIT = 1,
  ENCODING_RAW = 2,
};

typedef struct {
  long vid;
  long pid;
  long usage_page;
  long usage;
  long interface_number;
  bool has_usage_page;
  bool has_usage;
  bool has_interface;
  uint8_t request[MAX_REPORT];
  int request_len;
  uint8_t reply_prefix[16];
  int reply_prefix_len;
  int timeout_ms;
  int report_encoding;
} QueryOptions;

/**
 * 发送 Feature Report 并等待响应。
 * 先按"报告 ID = 首字节，其余为载荷"的标准语义发送；
 * 若无响应或设备拒绝该编码，再退回"报告 ID = 0，整段为载荷"的编码重试一次。
 */
static int cmd_query(const QueryOptions *opt) {
  int count = 0;
  io_service_t *services = copy_hid_services(&count);
  if (services == NULL)
    print_error("enumerate-failed", "IOServiceGetMatchingServices failed", 0, EXIT_NO_DEVICE);

  /* 在枚举结果中筛选目标设备 */
  io_service_t target_service = IO_OBJECT_NULL;
  DeviceInfo target_info;

  for (int i = 0; i < count; i++) {
    DeviceInfo info;
    fill_device_info(services[i], &info);

    if (info.vendor_id != opt->vid || info.product_id != opt->pid)
      continue;
    if (opt->has_usage_page && info.usage_page != opt->usage_page)
      continue;
    if (opt->has_usage && info.usage != opt->usage)
      continue;
    if (opt->has_interface && info.interface_number != opt->interface_number)
      continue;

    target_service = services[i];
    target_info = info;
    break;
  }

  if (target_service == IO_OBJECT_NULL)
    print_error("no-device", "no HID device matched the given vid/pid/usage filter", 0, EXIT_NO_DEVICE);

  /* 只为目标接口创建并打开 HID 设备，不影响系统保护的其他 HID 设备 */
  IOHIDDeviceRef target = IOHIDDeviceCreate(kCFAllocatorDefault, target_service);
  if (target == NULL)
    print_error("open-failed", "IOHIDDeviceCreate failed", 0, EXIT_OPEN_FAILED);

  IOReturn device_open_result = IOHIDDeviceOpen(target, kIOHIDOptionsTypeNone);
  if (device_open_result != kIOReturnSuccess) {
    CFRelease(target);
    print_error("open-failed", "IOHIDDeviceOpen failed (permission or sandbox restriction?)", (long)device_open_result,
                EXIT_OPEN_FAILED);
  }

  /* 注册 Input Report 回调并加入 RunLoop */
  InputCapture cap;
  memset(&cap, 0, sizeof(cap));
  memcpy(cap.prefix, opt->reply_prefix, (size_t)opt->reply_prefix_len);
  cap.prefix_len = opt->reply_prefix_len;

  IOHIDDeviceRegisterInputReportCallback(target, cap.data, sizeof(cap.data), input_report_cb, &cap);
  IOHIDDeviceScheduleWithRunLoop(target, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);

  /* 发送查询并等待响应；auto 模式下标准编码无响应时，用退回编码再试一次 */
  const char *encoding = "split";
  bool got = false;
  int first_attempt = (opt->report_encoding == ENCODING_RAW) ? 1 : 0;
  int last_attempt = (opt->report_encoding == ENCODING_SPLIT) ? 0 : 1;

  for (int attempt = first_attempt; attempt <= last_attempt && !got; attempt++) {
    IOReturn send_result;
    if (attempt == 0) {
      send_result = IOHIDDeviceSetReport(target, kIOHIDReportTypeFeature, (CFIndex)opt->request[0],
                                         opt->request + 1, (CFIndex)(opt->request_len - 1));
      encoding = "split";
    } else {
      send_result = IOHIDDeviceSetReport(target, kIOHIDReportTypeFeature, 0, opt->request, (CFIndex)opt->request_len);
      encoding = "raw";
    }

    if (send_result != kIOReturnSuccess) {
      if (attempt == 1)
        print_error("set-report-failed", "IOHIDDeviceSetReport failed", (long)send_result, EXIT_SET_REPORT_FAILED);
      continue;
    }

    got = wait_for_capture(&cap, opt->timeout_ms);
    /* 等待期间收到无关报告已被前缀过滤；超时后换编码重试一次 */
  }

  if (!got)
    print_error("timeout", "no matching input report received before timeout", 0, EXIT_TIMEOUT);

  /* 输出成功结果 */
  char reply_hex[MAX_REPORT * 2 + 1];
  hex_encode(cap.data, (size_t)cap.len, reply_hex);

  printf("{\"ok\":true,\"encoding\":\"%s\",\"reply\":\"%s\",\"replyLength\":%ld,\"device\":", encoding, reply_hex,
         (long)cap.len);
  print_device_json(&target_info, stdout);
  printf("}\n");

  IOHIDDeviceUnscheduleFromRunLoop(target, CFRunLoopGetCurrent(), kCFRunLoopDefaultMode);
  IOHIDDeviceClose(target, kIOHIDOptionsTypeNone);
  CFRelease(target);
  for (int i = 0; i < count; i++)
    IOObjectRelease(services[i]);
  free(services);
  return EXIT_OK;
}

/* ---------- 参数解析与入口 ---------- */

static void usage(void) {
  fprintf(stderr,
          "usage:\n"
          "  hid-query list [--json]\n"
          "  hid-query query --vid <n> --pid <n> --request <hex>\n"
          "                  [--usage-page <n>] [--usage <n>] [--interface <n>]\n"
          "                  [--reply-prefix <hex>] [--report-encoding auto|split|raw]\n"
          "                  [--timeout-ms <n>] [--json]\n");
}

int main(int argc, char **argv) {
  if (argc < 2) {
    usage();
    return EXIT_USAGE;
  }

  if (strcmp(argv[1], "list") == 0)
    return cmd_list();

  if (strcmp(argv[1], "query") != 0) {
    usage();
    return EXIT_USAGE;
  }

  QueryOptions opt;
  memset(&opt, 0, sizeof(opt));
  opt.vid = -1;
  opt.pid = -1;
  opt.timeout_ms = 500;
  opt.request_len = -1;
  opt.reply_prefix_len = 0;
  opt.report_encoding = ENCODING_AUTO;

  for (int i = 2; i < argc; i++) {
    const char *arg = argv[i];
    const char *value = (i + 1 < argc) ? argv[i + 1] : NULL;

    if (strcmp(arg, "--json") == 0) {
      continue;
    } else if (value == NULL) {
      fprintf(stderr, "missing value for %s\n", arg);
      return EXIT_USAGE;
    } else if (strcmp(arg, "--vid") == 0) {
      opt.vid = parse_num(value);
      i++;
    } else if (strcmp(arg, "--pid") == 0) {
      opt.pid = parse_num(value);
      i++;
    } else if (strcmp(arg, "--usage-page") == 0) {
      opt.usage_page = parse_num(value);
      opt.has_usage_page = true;
      i++;
    } else if (strcmp(arg, "--usage") == 0) {
      opt.usage = parse_num(value);
      opt.has_usage = true;
      i++;
    } else if (strcmp(arg, "--interface") == 0) {
      opt.interface_number = parse_num(value);
      opt.has_interface = true;
      i++;
    } else if (strcmp(arg, "--request") == 0) {
      int n = hex_decode(value, opt.request, MAX_REPORT);
      if (n <= 0) {
        fprintf(stderr, "invalid hex for --request\n");
        return EXIT_USAGE;
      }
      opt.request_len = n;
      i++;
    } else if (strcmp(arg, "--reply-prefix") == 0) {
      int n = hex_decode(value, opt.reply_prefix, (int)sizeof(opt.reply_prefix));
      if (n < 0) {
        fprintf(stderr, "invalid hex for --reply-prefix\n");
        return EXIT_USAGE;
      }
      opt.reply_prefix_len = n;
      i++;
    } else if (strcmp(arg, "--report-encoding") == 0) {
      if (strcmp(value, "auto") == 0)
        opt.report_encoding = ENCODING_AUTO;
      else if (strcmp(value, "split") == 0)
        opt.report_encoding = ENCODING_SPLIT;
      else if (strcmp(value, "raw") == 0)
        opt.report_encoding = ENCODING_RAW;
      else {
        fprintf(stderr, "invalid value for --report-encoding: %s\n", value);
        return EXIT_USAGE;
      }
      i++;
    } else if (strcmp(arg, "--timeout-ms") == 0) {
      opt.timeout_ms = (int)parse_num(value);
      i++;
    } else {
      fprintf(stderr, "unknown option: %s\n", arg);
      return EXIT_USAGE;
    }
  }

  if (opt.vid < 0 || opt.pid < 0 || opt.request_len <= 0) {
    fprintf(stderr, "--vid, --pid and --request are required\n");
    usage();
    return EXIT_USAGE;
  }

  return cmd_query(&opt);
}
