import { ActionPanel, Action, Icon, List, showHUD, LocalStorage, Clipboard } from "@raycast/api";
import { exec } from "child_process";
import { useEffect, useState } from "react";
import { promisify } from "util";

const promisifyExec = promisify(exec);

type Wifi = {
  name: string;
  password: string;
};

export default function Command() {
  const [isLoading, setIsLoading] = useState(false);

  const [wifiList, setWifiList] = useState<Wifi[]>([]);
  useEffect(() => {
    (async () => {
      const wifiListStr = await LocalStorage.getItem("wifi-list");
      if (typeof wifiListStr !== "string") return;
      console.log("🚀 ~ select-wifi.tsx:20 ~ wifiListStr:", wifiListStr);
      const wifiList = JSON.parse(wifiListStr);
      setWifiList(wifiList);
    })();
  });

  const [selectedWifi, setSelectedWifi] = useState<string | undefined>();
  useEffect(() => {
    (async () => {
      const selectedWifi = await LocalStorage.getItem<string>("selected-wifi");
      setSelectedWifi(selectedWifi);
    })();
  });

  const onSelectWifi = async (wifi: (typeof wifiList)[number]) => {
    setIsLoading(true);
    const { stdout, stderr } = await promisifyExec(
      `networksetup -setairportnetwork en0 '${wifi.name}' '${wifi.password}'`,
      {
        env: {
          PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        },
      },
    );
    if (stderr) {
      console.error("Error connecting to WiFi:", stderr);
    }
    if (stdout) {
      console.log("Connected to WiFi:", stdout);
    }

    setSelectedWifi(wifi.name);
    LocalStorage.setItem("selected-wifi", wifi.name);
    setIsLoading(false);
    showHUD("Connected to " + wifi.name);
  };

  const loadWifiListFromClipboard = async () => {
    const { text } = await Clipboard.read();
    const res = JSON.parse(text);
    setWifiList(res);
    LocalStorage.setItem("wifi-list", JSON.stringify(res));
  };

  return (
    <List
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action
            icon={Icon.Clipboard}
            title="Load from Clipboard"
            onAction={() => loadWifiListFromClipboard()}
          ></Action>
        </ActionPanel>
      }
    >
      {wifiList.map((wifi) => (
        <List.Item
          key={wifi.name}
          icon={Icon.Network}
          title={wifi.name}
          accessories={
            wifi.name === selectedWifi
              ? [
                  {
                    tag: {
                      value: "Connected",
                      color: "#6ee7b7",
                    },
                  },
                ]
              : []
          }
          actions={
            <ActionPanel>
              <Action icon={Icon.Network} title="Connect" onAction={() => onSelectWifi(wifi)}></Action>
              <Action.CopyToClipboard content={wifi.password} title="Copy Password to Clipboard" />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
