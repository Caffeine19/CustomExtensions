-- space.lua: Space management utilities for Hammerspoon
local space = {}

-- Remove the current space (move to previous, then remove original)
function space.removeCurrentSpace()
    -- local currentFocusedSpaceId = hs.spaces.focusedSpace()
    local currentScreen = hs.screen.mainScreen()
    local currentActiveSpaceOnCurrentScreen = hs.spaces.activeSpaceOnScreen(currentScreen)
    local spacesInCurrentScreen = hs.spaces.spacesForScreen(currentScreen)
    print(hs.inspect(spacesInCurrentScreen), currentActiveSpaceOnCurrentScreen)

    local prevSpaceId = nil
    for i, id in ipairs(spacesInCurrentScreen) do
        if id == currentActiveSpaceOnCurrentScreen and i > 1 then
            prevSpaceId = spacesInCurrentScreen[i - 1]
            break
        end
    end

    if not prevSpaceId then
        error("No previous space found, cannot remove current space.")
        return
    end

    print("Switching to previous space: ", prevSpaceId)
    hs.spaces.gotoSpace(prevSpaceId)

    local newActiveSpace = hs.spaces.activeSpaceOnScreen(currentScreen)
    print("New active space after switching: ", newActiveSpace)

    -- shouldn't use doAfter here, because the error wont be caught
    -- so if use this func in js, you need to split it into two steps
    -- and use the first step to switch space, then use the second step to remove space
    -- between the two steps, use `sleep` from `radash` to replace the `doAfter` 
    hs.timer.doAfter(0.1, function()
        print("Removing original space: ", currentActiveSpaceOnCurrentScreen)
        local ok, err = hs.spaces.removeSpace(currentActiveSpaceOnCurrentScreen)
        if not ok then
            print("Remove failed: " .. tostring(err))
            error("Failed to remove space: " .. tostring(err))
        end

        return "OK"
    end)
end

function space.createSpace()
    -- Get the current focused space and screen
    local currentScreen = hs.screen.mainScreen()

    -- Add a new space to the current screen
    hs.spaces.addSpaceToScreen(currentScreen, false)

    -- Get all spaces on the current screen to find our position
    local allSpaces = hs.spaces.spacesForScreen(currentScreen)
    print("All spaces on current screen:", hs.inspect(allSpaces))

    -- newSpaceIndex=the last of the allSpaces
    local newSpaceIndex = #allSpaces
    print("New spae index", newSpaceIndex)

    local newSpaceId = allSpaces[newSpaceIndex]
    print("New space ID: ", newSpaceId)

    -- Switch to the new space
    hs.timer.doAfter(0.1, function()
        -- Wait for 100 milliseconds before switching to the new space
        print("Switching to new space: ", newSpaceId)
        hs.spaces.gotoSpace(newSpaceId)
    end)

    return "Space created successfully"
end

function space.listSpaces()
    local spaces = {}
    local currentSpace = hs.spaces.focusedSpace()
    local spaceNames = hs.spaces.missionControlSpaceNames()

    for screenUUID, screenSpaces in pairs(spaceNames) do
        -- Get screen object and its name
        local screen = hs.screen.find(screenUUID)
        local screenName = screen and screen:name() or "Unknown Screen"

        for spaceId, spaceName in pairs(screenSpaces) do
            table.insert(spaces, {
                id = tostring(spaceId),
                name = spaceName,
                screenId = screenUUID,
                screenName = screenName,
                isCurrent = spaceId == currentSpace
            })
        end

        -- sort spaces by name in the screen group
        table.sort(spaces, function(a, b)
            return a.name < b.name
        end)
    end

    return hs.json.encode(spaces)
end

function space.getSpaceWindows(spaceId)
    local windows = {}
    print("Fetching windows for space ID:", spaceId)
    local windowsInSpace = hs.spaces.windowsForSpace(spaceId)
    print("Windows in space:", hs.inspect(windowsInSpace), spaceId)

    -- Use window filter to get windows from non-visible spaces
    local windowFilter = hs.window.filter.new()
    local allWindows = windowFilter:getWindows()
    
    -- Create a lookup table for all windows by ID
    local windowLookup = {}
    for _, window in ipairs(allWindows) do
        if window:id() then
            windowLookup[window:id()] = window
        end
    end

    for _, windowId in ipairs(windowsInSpace) do
        local window = windowLookup[windowId]
        print("Processing window ID:", windowId, "Window found:", window ~= nil)
        if window then
            local app = window:application()
            table.insert(windows, {
                id = tostring(windowId),
                title = window:title() or "Untitled",
                application = app and app:name() or "Unknown",
                isMinimized = window:isMinimized(),
                isFullscreen = window:isFullscreen()
            })
        end
    end

    return hs.json.encode(windows)
end

return space
