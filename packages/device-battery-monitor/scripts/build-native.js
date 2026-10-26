#!/usr/bin/env node

/**
 * 编译 native/hid-query.c → assets/hid-query（macOS 通用二进制）。
 * 增量编译：产物比源码新时直接跳过。
 */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "native", "hid-query.c");
const output = path.join(root, "assets", "hid-query");

function needsBuild() {
  if (!fs.existsSync(output)) return true;
  try {
    return fs.statSync(output).mtimeMs < fs.statSync(source).mtimeMs;
  } catch {
    return true;
  }
}

function build() {
  const args = [
    source,
    "-O2",
    "-Wall",
    "-Wextra",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    "-framework",
    "IOKit",
    "-framework",
    "CoreFoundation",
    "-o",
    output,
  ];

  try {
    execFileSync("clang", args, { stdio: "inherit" });
  } catch (error) {
    console.error(
      "\nFailed to compile hid-query. Make sure Xcode Command Line Tools are installed:",
    );
    console.error("  xcode-select --install\n");
    process.exit(1);
  }

  fs.chmodSync(output, 0o755);
  console.log(
    `Built ${path.relative(root, output)} (universal arm64 + x86_64)`,
  );
}

if (!needsBuild()) {
  console.log("hid-query is up to date");
  process.exit(0);
}

build();
