import { execFile } from "child_process";
import { open, readdir, readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import { listServices, statusSubtitle } from "./kerio";

const exec = promisify(execFile);
const crashDirectory = "/Library/Logs/DiagnosticReports";
const oppoService = "system/com.oplus.dsp.core";
const oppoPlist = "/Library/LaunchDaemons/com.oplus.dsp.core.plist";
export const stopOppoCommand = [
  `sudo launchctl disable ${oppoService}`,
  `sudo launchctl bootout ${oppoService}`,
].join("\n");
const verifyOppoCommands = [
  "launchctl print-disabled system | grep -F com.oplus.dsp.core",
  `launchctl print ${oppoService}`,
].join("\n");
const restoreOppoCommands = [
  `sudo launchctl enable ${oppoService}`,
  `sudo launchctl bootstrap system ${oppoPlist}`,
].join("\n");

type Process = { pid: string; path: string };
type Tunnel = { name: string; addresses: string[]; owners: string[] };
type Crash = { file: string; time: string; version: string; signature: string };
export type DiagnosticReport = { markdown: string; oppoRunning: boolean };

async function command(file: string, args: string[]): Promise<string> {
  const { stdout } = await exec(file, args, {
    timeout: 6000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
  });
  return stdout;
}

function cell(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/[\\|*_\[\]`<>]/g, "\\$&");
}

export function parseProcesses(text: string): Process[] {
  return text.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
    return match ? [{ pid: match[1], path: match[2] }] : [];
  });
}

export function parseTunnels(
  ifconfig: string,
  netstat: string,
  processes: Process[],
): Tunnel[] {
  const owners = new Map<string, string[]>();
  for (const line of netstat.split("\n")) {
    const columns = line.trim().split(/\s+/);
    if (
      columns[0] !== "kctl" ||
      columns.at(-1) !== "com.apple.net.utun_control"
    )
      continue;
    const unit = Number(columns.at(-3));
    if (!Number.isInteger(unit) || unit < 1) continue;
    const owner = columns[7];
    const ownerPid = /(?:^|:)(\d+)$/.exec(owner)?.[1];
    const process = processes.find(({ pid }) => pid === ownerPid);
    const label = process ? `${process.path} (PID ${process.pid})` : owner;
    const name = `utun${unit - 1}`;
    owners.set(name, [...(owners.get(name) ?? []), label || "Unavailable"]);
  }
  return ifconfig.split(/(?=^\w+: flags)/m).flatMap((block) => {
    const name = /^(utun\d+):/.exec(block)?.[1];
    if (!name) return [];
    const addresses = [...block.matchAll(/^\s+inet\s+(\S+)/gm)].map(
      (match) => match[1],
    );
    return [{ name, addresses, owners: owners.get(name) ?? [] }];
  });
}

async function recentCrash(): Promise<Crash | undefined> {
  const files = (await readdir(crashDirectory))
    .filter((file) =>
      /^com\.kerio\.VPN\..*KerioVpnNetExt-\d{4}-\d{2}-\d{2}-\d{6}\.ips$/.test(
        file,
      ),
    )
    .sort((a, b) =>
      b.slice(b.indexOf("-20")).localeCompare(a.slice(a.indexOf("-20"))),
    );
  if (!files[0]) return;
  const raw = await readFile(join(crashDirectory, files[0]), "utf8");
  const newline = raw.indexOf("\n");
  const header = JSON.parse(raw.slice(0, newline));
  const body = JSON.parse(raw.slice(newline + 1));
  const thread = body.threads?.find(
    (item: { triggered?: boolean }) => item.triggered,
  );
  const symbols: string[] = (thread?.frames ?? [])
    .slice(0, 10)
    .map((frame: { symbol?: string }) => frame.symbol ?? "?");
  const signature =
    symbols.some((symbol) => symbol.includes("getInterfaceInfo")) &&
    symbols.includes("__assert_rtn")
      ? "getInterfaceInfo() assertion"
      : symbols.slice(0, 5).join(" → ");
  return {
    file: join(crashDirectory, files[0]),
    time: header.timestamp ?? body.captureTime ?? "Unavailable",
    version: header.app_version ?? "Unavailable",
    signature,
  };
}

async function latestUiStatus(): Promise<string> {
  const file = await open(
    join(homedir(), ".kerio/vpnclient/logs/debug.log"),
    "r",
  );
  try {
    const { size } = await file.stat();
    const bytes = Buffer.alloc(Math.min(size, 128 * 1024));
    const { bytesRead } = await file.read(
      bytes,
      0,
      bytes.length,
      size - bytes.length,
    );
    for (const line of bytes
      .subarray(0, bytesRead)
      .toString("utf8")
      .split("\n")
      .reverse()) {
      const match = /^\[([^\]]+)\].*received status packet \(([^)]+)\)/.exec(
        line,
      );
      if (match) return `${match[2]} · ${match[1]}`;
    }
    return "No status entry in the log tail";
  } finally {
    await file.close();
  }
}

export async function collectDiagnostics(): Promise<DiagnosticReport> {
  const errors: string[] = [];
  async function capture<T>(
    label: string,
    task: Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await task;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      errors.push(`${label}: ${code ?? "unavailable"}`);
      return fallback;
    }
  }

  const [status, ui, ifconfig, netstat, ps, oppo, crash] = await Promise.all([
    capture(
      "macOS VPN status",
      listServices().then(async (services) => ({
        subtitle: await statusSubtitle(services),
        system:
          services
            .map((service) => `${service.name}: ${service.state}`)
            .join("; ") || "No Kerio profile",
      })),
      { subtitle: "Unavailable", system: "Unavailable" },
    ),
    capture("Kerio UI log", latestUiStatus(), "Unavailable"),
    capture("Interfaces", command("/sbin/ifconfig", ["-a"]), ""),
    capture(
      "Tunnel owners",
      command("/usr/sbin/netstat", ["-anv", "-f", "systm"]),
      "",
    ),
    capture("Processes", command("/bin/ps", ["-axo", "pid=,comm="]), ""),
    capture(
      "O+Connect service",
      command("/bin/launchctl", ["print", oppoService]).catch((error) => {
        if (/Could not find service/i.test(error.stderr ?? ""))
          return "Service is not loaded";
        throw error;
      }),
      "Unavailable",
    ),
    capture<Crash | undefined>("Crash reports", recentCrash(), undefined),
  ]);
  const processes = parseProcesses(ps);
  const tunnels = parseTunnels(ifconfig, netstat, processes);
  const ipv4 = tunnels.filter(({ addresses }) => addresses.length);
  const otherTunnels = ipv4.filter(({ owners }) =>
    owners.some((owner) => owner !== "Unavailable" && !/kerio/i.test(owner)),
  );
  const oppoProcesses = processes.filter(({ path }) =>
    /\/O\+Connect\.app\//.test(path),
  );
  const oppoRunning =
    /state = running/.test(oppo) ||
    oppoProcesses.some(({ path }) => path.endsWith("/O+Connect Service"));
  const state = /^\s*state = (.+)$/m.exec(oppo)?.[1] ?? oppo;
  const pid = /^\s*pid = (\d+)$/m.exec(oppo)?.[1];
  const summary = otherTunnels.length
    ? `An IPv4 tunnel owned by another process is present (${otherTunnels.map(({ name }) => name).join(", ")}). Starting Kerio with another IPv4 utun can trigger its known getInterfaceInfo() assertion.`
    : errors.some((item) => /Interfaces|Tunnel owners|Processes/.test(item))
      ? "Some interface or process information is unavailable. Check the collection notes below."
      : ipv4.some(({ owners }) => owners.length === 0)
        ? "An IPv4 tunnel has an unknown owner. Review the interface list before reconnecting."
        : "No competing IPv4 utun was found in this snapshot.";
  const tunnelItems = tunnels.map(
    ({ name, addresses, owners }) =>
      `- **${cell(name)}**  \n  IPv4 — ${cell(addresses.join(", ") || "—")}  \n  Owner — ${cell(owners.join("; ") || "Unavailable")}`,
  );
  const processItems = processes
    .filter(({ path }) =>
      /O\+Connect|oplus_remote_service|SecoClient|Tailscale|KerioVpnNetExt|Surge\.app/.test(
        path,
      ),
    )
    .map(({ pid, path }) => `- **PID ${pid}**  \n  ${cell(path)}`);

  const markdown = [
    "# Kerio VPN Diagnostics",
    `Captured ${new Date().toLocaleString()}`,
    summary,
    "## Connection",
    `- Displayed status — **${cell(status.subtitle)}**`,
    `- macOS tunnel — ${cell(status.system)}`,
    `- Latest Kerio UI log — ${cell(ui)}`,
    "## O+Connect Background Service",
    `- Service — \`${oppoService}\``,
    `- State — ${cell(state)}${pid ? ` (PID ${pid})` : ""}`,
    `- Processes found — ${oppoProcesses.length}`,
    ...(oppoRunning
      ? [
          "To stop the background service now and keep it stopped after restart, run these commands in Terminal with your Mac administrator password. The first saves the disabled state so it survives reboot; the second stops the current instance.",
          `\`\`\`sh\n${stopOppoCommand}\n\`\`\``,
          "Verify with the first command showing `disabled` and the second reporting that the service cannot be found:",
          `\`\`\`sh\n${verifyOppoCommands}\n\`\`\``,
          "Note: an independent login helper `oplus_remote_service` may still appear in the process list. Judge the result by the state of `system/com.oplus.dsp.core`. To restore auto-start and start the service again:",
          `\`\`\`sh\n${restoreOppoCommands}\n\`\`\``,
        ]
      : []),
    "## Tunnel Interfaces",
    tunnelItems.length ? tunnelItems.join("\n\n") : "No utun interfaces found.",
    "## Latest Retained Kerio Crash",
    ...(crash
      ? [
          `- Time — ${cell(crash.time)}`,
          `- Client version — ${cell(crash.version)}`,
          `- Signature — ${cell(crash.signature)}`,
          `- Report — ${cell(crash.file)}`,
          "This is the latest retained report. Compare its timestamp with your connection attempt.",
        ]
      : ["No readable Kerio crash report was found."]),
    "## Related Processes",
    processItems.length
      ? processItems.join("\n\n")
      : "No matching processes found.",
    ...(errors.length
      ? ["## Collection Notes", ...errors.map((error) => `- ${cell(error)}`)]
      : []),
  ].join("\n\n");
  return { markdown, oppoRunning };
}
