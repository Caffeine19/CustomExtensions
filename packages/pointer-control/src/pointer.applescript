tell application "System Settings"
    activate
    reveal anchor "AX_CURSOR_SIZE" of pane id "com.apple.Accessibility-Settings.extension" of application "System Settings"
end tell

tell application "System Events"
    tell process "System Settings"
        -- Wait until the slider is available
        repeat until slider "Pointer size" of group 3 of scroll area 1 of group 1 of group 2 of splitter group 1 of group 1 of window 1 exists
            delay 0
        end repeat
        
        set pointerSettings to group 3 of scroll area 1 of group 1 of group 2 of splitter group 1 of group 1 of window 1
        set pointerSizeSlider to slider "Pointer size" of pointerSettings
        
        if value of pointerSizeSlider is 4 then
            repeat until value of pointerSizeSlider is 1
                decrement pointerSizeSlider
            end repeat
        else
            repeat until value of pointerSizeSlider is 4
                increment pointerSizeSlider
            end repeat
        end if
    end tell
end tell