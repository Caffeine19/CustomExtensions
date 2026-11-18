# Kerio VPN for Raycast

This local extension uses the Kerio Control VPN Client already installed on macOS.

**Kerio VPN Status** shows the connection status in its Raycast search subtitle. Run it for an immediate refresh. Raycast also schedules a read-only refresh every minute. The command displays **Checking certificate** when that is the latest state reported by the Kerio UI for an ongoing attempt.

**Toggle Kerio VPN** connects or disconnects Kerio, then requests a status refresh. If Kerio still shows a pending certificate check after the tunnel exited, the command cancels that attempt in Kerio. Run it again to start a new connection.

When connecting, the command opens Kerio and presses **Connect** when the button is available. Complete any password or second-factor prompt in Kerio. If multiple profiles require a choice, select the profile in Kerio.

If SecoClient is running when you start a Kerio connection, the command quits it first and waits for its VPN process to exit. It reopens SecoClient after Kerio has stayed connected for six seconds. If Kerio does not establish a stable connection during the 90-second wait, SecoClient stays closed.

If Tailscale is connected when you start a Kerio connection, the command disconnects it first so the two VPNs do not compete for the tunnel. Tailscale is reconnected after you disconnect Kerio, but only if the command is what paused it.

When Kerio asks for a second factor it opens a TOTP verification page in Microsoft Edge. Once the tunnel is established, the command closes that Edge tab for you.

## Install or reload the extension

From the extracted folder, run:

```sh
npm ci
npm run dev
```

The extension remains available after stopping the development process.

For the connect button to work automatically, allow Raycast to control **System Events** in **System Settings → Privacy & Security → Automation** and enable the relevant Accessibility permission if macOS requests it. If automation is unavailable, the command opens the Kerio pane for manual connection. Closing the TOTP tab also needs Raycast to control **Microsoft Edge** in the same Automation pane; if it is not granted, the tab simply stays open. The extension does not read or store your VPN password.
