import { useMemo, useState } from "react";

import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { Effect } from "effect";

import {
  queryAllBatteries,
  type BatteryFailure,
  type BatteryReading,
  type BatteryReport,
} from "./service/batteryService";
import type { BatteryError } from "./types/errors";
import type { HidDeviceInfo } from "./types/hid";
import {
  batteryColor,
  deviceDetailMarkdown,
  failureDetailMarkdown,
  formatInterface,
  formatVidPid,
  isStale,
  prepareViewData,
  readingDetailMarkdown,
  titleOf,
} from "./utils/batteryView";

/** 将结构化错误转为用户可读信息 */
const describeError = (error: BatteryError): string => {
  switch (error._tag) {
    case "NativeToolMissingError":
      return error.message;
    case "HidTransportError":
      return error.ioReturn
        ? `${error.message} (${error.ioReturn})`
        : error.message;
    case "HidProtocolError":
      return error.message;
  }
};

/** 拉取电量报告；Effect 失败统一转为异常，交给 usePromise 的错误态 */
const fetchBatteryReport = async (): Promise<BatteryReport> => {
  const result = await Effect.runPromise(Effect.either(queryAllBatteries()));
  return result._tag === "Right"
    ? result.right
    : Promise.reject(new Error(describeError(result.left)));
};

interface ItemActionsProps {
  showDetail: boolean;
  onToggleDetail: () => void;
  onRefresh: () => void;
}

/** 电量读数条目 */
function ReadingItem({
  reading,
  showDetail,
  onToggleDetail,
  onRefresh,
}: ItemActionsProps & {
  reading: BatteryReading;
}) {
  return (
    <List.Item
      icon={{
        source: reading.isCharging ? Icon.BatteryCharging : Icon.Battery,
        tintColor: batteryColor(reading.batteryLevel),
      }}
      title={titleOf(reading.device)}
      subtitle={reading.protocol.name}
      accessories={[
        ...(isStale(reading)
          ? [
              {
                icon: Icon.ExclamationMark,
                tooltip: "Stale reading, try refresh",
              },
            ]
          : []),
        {
          tag: {
            value: `${reading.batteryLevel}%`,
            color: batteryColor(reading.batteryLevel),
          },
          tooltip: reading.isCharging ? "Battery (charging)" : "Battery",
        },
      ]}
      detail={<List.Item.Detail markdown={readingDetailMarkdown(reading)} />}
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
          />
          <Action.CopyToClipboard
            title="Copy Battery Level"
            content={`${reading.batteryLevel}%`}
          />
          <Action.CopyToClipboard
            title="Copy Raw Reply"
            content={reading.rawReply}
          />
          <Action
            title={showDetail ? "Hide Detail" : "Show Detail"}
            icon={Icon.Eye}
            onAction={onToggleDetail}
          />
          <Action.OpenInBrowser
            title="Open Protocol Source"
            url={reading.protocol.source}
          />
        </ActionPanel>
      }
    />
  );
}

/** 查询失败条目 */
function FailureItem({
  failure,
  showDetail,
  onToggleDetail,
  onRefresh,
}: ItemActionsProps & {
  failure: BatteryFailure;
}) {
  return (
    <List.Item
      icon={{ source: Icon.Warning, tintColor: Color.Red }}
      title={titleOf(failure.device)}
      subtitle={describeError(failure.error)}
      accessories={[{ text: formatVidPid(failure.device), tooltip: "VID:PID" }]}
      detail={<List.Item.Detail markdown={failureDetailMarkdown(failure)} />}
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
          />
          <Action.CopyToClipboard
            title="Copy Error Message"
            content={describeError(failure.error)}
          />
          <Action.CopyToClipboard
            title="Copy VID:PID"
            content={formatVidPid(failure.device)}
          />
          <Action
            title={showDetail ? "Hide Detail" : "Show Detail"}
            icon={Icon.Eye}
            onAction={onToggleDetail}
          />
        </ActionPanel>
      }
    />
  );
}

/** 其他 HID 设备条目 */
function DeviceItem({
  device,
  showDetail,
  onToggleDetail,
  onRefresh,
}: ItemActionsProps & {
  device: HidDeviceInfo;
}) {
  return (
    <List.Item
      icon={Icon.ComputerChip}
      title={titleOf(device)}
      subtitle={`${formatVidPid(device)} · ${device.transport}`}
      accessories={[
        {
          text: `interface ${formatInterface(device)}`,
          tooltip: "USB interface",
        },
      ]}
      detail={<List.Item.Detail markdown={deviceDetailMarkdown(device)} />}
      actions={
        <ActionPanel>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            onAction={onRefresh}
          />
          <Action.CopyToClipboard
            title="Copy VID:PID"
            content={formatVidPid(device)}
          />
          <Action
            title={showDetail ? "Hide Detail" : "Show Detail"}
            icon={Icon.Eye}
            onAction={onToggleDetail}
          />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const [showDetail, setShowDetail] = useState(false);
  const { data, isLoading, error, revalidate } = usePromise(fetchBatteryReport);
  const view = useMemo(
    () => (data ? prepareViewData(data) : undefined),
    [data],
  );

  const itemActions: ItemActionsProps = {
    showDetail,
    onToggleDetail: () => setShowDetail((current) => !current),
    onRefresh: () => {
      revalidate();
    },
  };

  const isEmpty =
    view !== undefined &&
    view.readings.length === 0 &&
    view.failures.length === 0 &&
    view.others.length === 0;

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail}
      searchBarPlaceholder="Search devices"
    >
      {error ? (
        <List.EmptyView
          icon={{ source: Icon.Warning, tintColor: Color.Red }}
          title="Failed to read devices"
          description={error instanceof Error ? error.message : String(error)}
        />
      ) : isEmpty ? (
        <List.EmptyView
          icon={Icon.ComputerChip}
          title="No HID devices found"
          description="Connect a 2.4 GHz receiver or USB / Bluetooth peripheral, then refresh"
        />
      ) : (
        <>
          <List.Section title={`Battery (${view?.readings.length ?? 0})`}>
            {view?.readings.map((reading) => (
              <ReadingItem
                key={`${reading.device.locationId}-${reading.device.usage}`}
                reading={reading}
                {...itemActions}
              />
            ))}
          </List.Section>

          {view !== undefined && view.failures.length > 0 && (
            <List.Section title={`Query Failures (${view.failures.length})`}>
              {view.failures.map((failure) => (
                <FailureItem
                  key={`${failure.device.locationId}-${failure.device.usage}`}
                  failure={failure}
                  {...itemActions}
                />
              ))}
            </List.Section>
          )}

          {view !== undefined && view.others.length > 0 && (
            <List.Section title={`Other HID Devices (${view.others.length})`}>
              {view.others.map((device) => (
                <DeviceItem
                  key={`${device.vendorId}-${device.productId}-${device.locationId}`}
                  device={device}
                  {...itemActions}
                />
              ))}
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}
