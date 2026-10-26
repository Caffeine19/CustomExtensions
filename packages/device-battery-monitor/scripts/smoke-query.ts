/**
 * 协议冒烟测试：不经过 Raycast UI，直接跑通 Effect 查询管线并打印结果。
 * 用于协议调试与真机验证，用法：npm run smoke
 */
import { Effect } from "effect";

import { queryAllBatteries } from "../src/service/batteryService";

const program = Effect.gen(function* () {
  const report = yield* queryAllBatteries();

  for (const reading of report.readings) {
    console.log(
      `[ok] ${reading.device.productName} (interface ${reading.device.interfaceNumber}): ` +
        `${reading.batteryLevel}% — reply ${reading.rawReply}`,
    );
  }
  for (const failure of report.failures) {
    console.log(
      `[fail] ${failure.device.productName}: ${failure.error._tag} — ${failure.error.message}`,
    );
  }

  console.log(
    `summary: ${report.readings.length} readings, ${report.failures.length} failures, ` +
      `${report.unmatched.length} unmatched HID interfaces`,
  );
});

Effect.runPromise(program).catch((error: unknown) => {
  console.error("[fatal]", error);
  process.exit(1);
});
