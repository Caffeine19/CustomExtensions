import { closeMainWindow, showHUD } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

const appleScript = /* apple script */ `
-- Function to check assistive access
on isAssistiveAccessEnabled()
	try
		tell application "System Events"
			return UI elements enabled
		end tell
	on error
		return false
	end try
end isAssistiveAccessEnabled

-- Main script
if not isAssistiveAccessEnabled() then
	display dialog "This script requires assistive access. Please enable it in System Preferences." buttons {"OK"} default button "OK"
	
	tell application "System Settings"
		activate
		set current pane to pane id "com.apple.preference.universalaccess"
	end tell
end if


tell application "System Settings"
	activate
end tell

-- Wait for the System Settings window to open
delay 0.2

tell application "System Events"
	tell process "System Settings"
		set windowReady to false
		repeat with attempt from 1 to 30
			if exists window 1 then
				set windowReady to true
				exit repeat
			end if
			delay 0.1
		end repeat
		if windowReady is false then
			display dialog "System Settings window did not appear."
			return
		end if

		-- Open "Displays" settings
		set displaysOpened to false
		try
			click menu item "Displays" of menu "View" of menu bar 1
			set displaysOpened to true
		on error
			repeat with containerCandidate in {scroll area 1 of group 1 of splitter group 1 of window 1, scroll area 1 of group 1 of window 1, scroll area 1 of window 1}
				try
					if exists button "Displays" of containerCandidate then
						click button "Displays" of containerCandidate
						set displaysOpened to true
						exit repeat
					end if
				on error
					-- Ignore and try next container
				end try
			end repeat
		end try
		if displaysOpened is false then
			display dialog "Could not open the Displays pane in System Settings."
			return
		end if
		
		-- Wait for the Displays window to load
		delay 0.5
		
		-- Click the "Advanced…" button, if available
		try
			-- click button "Advanced…" of window 1
			click button 1 of scroll area 2 of group 1 of group 2 of splitter group 1 of group 1 of window 1
		on error
			display dialog "Could not find the Advanced button."
			return
		end try
		
		-- Wait for the Advanced settings to appear
		delay 0.5
		
		-- Toggle the checkbox for "Allow your pointer and keyboard to move between any nearby Mac or iPad"
		try
			set pointerSetting to checkbox "Allow your pointer and keyboard to move between any nearby Mac or iPad" of group 2 of scroll area 1 of group 1 of sheet 1 of window 1
			if (value of pointerSetting as boolean) is true then
				click pointerSetting -- Turn it off
				delay 0.2
				click pointerSetting -- Turn it back on
			else
				click pointerSetting -- Turn it on
				delay 0.2
				click pointerSetting -- Turn it off and then back on
				click pointerSetting
			end if
		on error
			display dialog "Could not find the pointer and keyboard setting."
			return
		end try
	end tell
	
	key code 53
end tell

delay 0.2

quit application "System Settings"
`;

export default async function main() {
  try {
    await closeMainWindow({ clearRootSearch: true });
    const elementDump = await runAppleScript(appleScript);
    console.log(elementDump);
    await showHUD("Toggled linking keyboard and mouse");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await showHUD(`Universal Control toggle failed: ${message}`);
    throw error;
  }
}
