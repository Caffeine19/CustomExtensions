on run arguments
set cancelPending to (item 1 of arguments is "cancel")
set paneLabels to {"Kerio Control VPN Client", "Persistent connection", "持续连接"}
set connectLabels to {"Connect", "连接"}
set disconnectLabels to {"Disconnect", "断开"}

tell application "System Events"
    repeat 16 times
        set settingsProcesses to every application process whose bundle identifier is "com.apple.systempreferences"
        if (count settingsProcesses) > 0 then
            tell item 1 of settingsProcesses
                if exists window 1 then
                    set paneFound to false
                    set connectButton to missing value
                    set disconnectButton to missing value
                    set controls to entire contents of window 1
                    repeat with controlRef in controls
                        try
                            set controlName to (name of controlRef) as text
                            if controlName is in paneLabels then set paneFound to true
                            if role of controlRef is "AXButton" then
                                if controlName is in connectLabels then set connectButton to contents of controlRef
                                if controlName is in disconnectLabels then set disconnectButton to contents of controlRef
                            end if
                        end try
                    end repeat
                    if paneFound then
                        if disconnectButton is not missing value then
                            if not cancelPending then return "disconnect-visible"
                            if not (enabled of disconnectButton) then return "cancel-unavailable"
                            click disconnectButton
                            return "cancelled"
                        end if
                        if connectButton is not missing value then
                            if cancelPending then return "cancel-unavailable"
                            if not (enabled of connectButton) then return "needs-input"
                            click connectButton
                            return "clicked"
                        end if
                    end if
                end if
            end tell
        end if
        delay 0.3
    end repeat
end tell
return "pane-not-found"
end run
