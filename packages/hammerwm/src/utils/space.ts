import { sleep } from "radash";
import { Space, Window } from "../types/space";
import { callHammerspoon } from "./call-hammerspoon";

export function removeSpace(spaceId: Space["id"]) {
  const code = /* lua */ `
        local ok, err = hs.spaces.removeSpace(${spaceId})
        if not ok then
            print("Remove failed: " .. tostring(err))
            error("Failed to remove space: " .. tostring(err))
        end
    `;
  return callHammerspoon(code);
}

export function removeSpaceById(spaceId: Space["id"]) {
  const code = /* lua */ `
    local ok, err = hs.spaces.removeSpace(${spaceId})
    if not ok then
        print("Remove failed: " .. tostring(err))
        error("Failed to remove space: " .. tostring(err))
    end
  `;
  return callHammerspoon(code);
}

export async function removeCurrentSpace() {
  const code = /* lua */ `
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

    return currentActiveSpaceOnCurrentScreen
  `;

  const currentActiveSpaceOnCurrentScreen = await callHammerspoon(code);
  console.log(
    "🚀 ~ space.ts:45 ~ removeCurrentSpace ~ currentActiveSpaceOnCurrentScreen:",
    currentActiveSpaceOnCurrentScreen,
  );

  await sleep(100);

  await removeSpace(currentActiveSpaceOnCurrentScreen);
}

export function gotoSpace(spaceId: Space["id"]) {
  const code = /* lua */ `
        local ok, err = hs.spaces.gotoSpace(${spaceId})
        if not ok then
            print("Goto failed: " .. tostring(err))
            error("Failed to go to space: " .. tostring(err))
        end
    `;

  return callHammerspoon(code);
}

export async function createSpace() {
  const code = /* lua */ `
    local currentScreen = hs.screen.mainScreen()
    hs.spaces.addSpaceToScreen(currentScreen, false)

    -- Get all spaces on the current screen to find our position
    local allSpaces = hs.spaces.spacesForScreen(currentScreen)
    print("All spaces on current screen:", hs.inspect(allSpaces))

    -- newSpaceIndex=the last of the allSpaces
    local newSpaceIndex = #allSpaces
    print("New spae index", newSpaceIndex)

    local newSpaceId = allSpaces[newSpaceIndex]
    print("New space ID: ", newSpaceId)

    return newSpaceId
  `;

  const newSpaceId = await callHammerspoon(code);
  console.log("🚀 ~ space.ts:85 ~ createSpace ~ newSpaceId:", newSpaceId);

  await sleep(600);

  await gotoSpace(newSpaceId);
}

export async function listSpace(): Promise<Space[]> {
  const code = /* lua */ `
    local spaces = {}
    local activeSpaces = hs.spaces.activeSpaces() -- Returns {screenUUID: spaceId} for all screens
    local allSpaces = hs.spaces.allSpaces() -- Returns {screenUUID: [spaceId1, spaceId2, ...]}
    
    -- Get screen information
    local screens = hs.screen.allScreens()
    local primaryScreen = hs.screen.primaryScreen() -- The primary display (coordinate origin 0,0)
    local primaryScreenUUID = primaryScreen:getUUID()
    
    local screenInfo = {}
    for _, screen in ipairs(screens) do
        local uuid = screen:getUUID()
        local name = screen:name()
        screenInfo[uuid] = name
    end

    -- Global desktop counter starting from 1
    local desktopNumber = 1
    
    -- First, add spaces from primary screen
    if allSpaces[primaryScreenUUID] then
        local currentSpaceOnScreen = activeSpaces[primaryScreenUUID]
        for _, spaceId in ipairs(allSpaces[primaryScreenUUID]) do
            table.insert(spaces, {
                id = tostring(spaceId),
                name = "Desktop " .. desktopNumber,
                screenId = primaryScreenUUID,
                screenName = screenInfo[primaryScreenUUID] or "Unknown Screen",
                isCurrent = spaceId == currentSpaceOnScreen
            })
            desktopNumber = desktopNumber + 1
        end
    end
    
    -- Then, add spaces from other screens
    for screenUUID, spaceIds in pairs(allSpaces) do
        if screenUUID ~= primaryScreenUUID then
            local currentSpaceOnScreen = activeSpaces[screenUUID]
            for _, spaceId in ipairs(spaceIds) do
                table.insert(spaces, {
                    id = tostring(spaceId),
                    name = "Desktop " .. desktopNumber,
                    screenId = screenUUID,
                    screenName = screenInfo[screenUUID] or "Unknown Screen",
                    isCurrent = spaceId == currentSpaceOnScreen
                })
                desktopNumber = desktopNumber + 1
            end
        end
    end

    return hs.json.encode(spaces)
  `;

  const result = await callHammerspoon(code);
  return JSON.parse(result);
}

export async function getSpaceWindows(spaceId: Space["id"]): Promise<Window[]> {
  console.log("🚀 ~ space.ts:128 ~ getSpaceWindows ~ spaceId:", spaceId);
  const code = /* lua */ `
    local spaceId=${spaceId}
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
        if window and window:isStandard() then
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
  `;

  const result = await callHammerspoon(code);
  return JSON.parse(result);
}

export async function getAllWindows(): Promise<Window[]> {
  const code = /* lua */ `
    local windows = {}
    
    -- Get all windows from all spaces
    local windowFilter = hs.window.filter.new()
    local allWindows = windowFilter:getWindows()
    
    print("Found", #allWindows, "total windows")
    
    for _, window in ipairs(allWindows) do
        local app = window:application()
        local appName = app and app:name() or "Unknown"
        local windowTitle = window:title() or "Untitled"
        local frame = window:frame()
        
        -- Skip Raycast windows and non-standard windows
        if window:isStandard() then
            table.insert(windows, {
                id = tostring(window:id()),
                title = windowTitle,
                application = appName,
                isMinimized = window:isMinimized(),
                isFullscreen = window:isFullscreen()
            })
        end
    end
    
    return hs.json.encode(windows)
  `;

  const result = await callHammerspoon(code);
  return JSON.parse(result);
}

export async function focusWindow(windowId: string): Promise<void> {
  const code = /* lua */ `
    local windowId = tonumber(${windowId})
    
    -- First, get the space(s) this window is on
    local windowSpaces = hs.spaces.windowSpaces(windowId)
    if not windowSpaces or #windowSpaces == 0 then
        error("Cannot find spaces for window ID: " .. tostring(windowId))
    end
    
    -- Get the first space the window is on
    local targetSpaceId = windowSpaces[1]
    
    -- Get all visible spaces across all screens (activeSpaces returns {screenUUID: spaceId})
    local activeSpaces = hs.spaces.activeSpaces()
    
    -- Check if target space is already visible on any screen
    local isVisible = false
    for _, visibleSpaceId in pairs(activeSpaces) do
        if visibleSpaceId == targetSpaceId then
            isVisible = true
            break
        end
    end
    
    -- If window is not in any visible space, switch to its space
    if not isVisible then
        print("Window is in a non-visible space, switching to space " .. targetSpaceId)
        hs.spaces.gotoSpace(targetSpaceId)
    end
    
    return not isVisible
  `;

  const needsSpaceSwitch = await callHammerspoon(code);

  // If we switched spaces, wait a bit for the space switch to complete
  if (needsSpaceSwitch === "true") {
    await sleep(300);
  }

  // Now focus the window
  const focusCode = /* lua */ `
    local windowId = tonumber(${windowId})
    local window = hs.window.get(windowId)
    
    if not window then
        error("Window not found with ID: " .. tostring(windowId))
    end
    
    -- Focus the window
    window:focus()
    
    -- Also bring the application to front
    local app = window:application()
    if app then
        app:activate()
    end
  `;

  await callHammerspoon(focusCode);
}

/**
 * Get the currently focused window, excluding Raycast windows.
 * Uses orderedWindows() to find the front most non-Raycast window,
 * since Raycast itself is focused when running this command.
 * @returns Promise with window info or null if no focused window
 */
export async function getFocusedWindow(): Promise<Window | null> {
  const code = /* lua */ `
    -- Use orderedWindows to get windows sorted front-to-back
    -- This allows us to skip Raycast and get the "previous" focused window
    local orderedWindows = hs.window.orderedWindows()
    
    local window = nil
    for _, w in ipairs(orderedWindows) do
        local app = w:application()
        local appName = app and app:name() or ""
        -- Skip Raycast windows to get the actual user's focused window
        if appName ~= "Raycast" and w:isStandard() then
            window = w
            break
        end
    end
    
    if not window then
        return "null"
    end
    
    local app = window:application()
    local windowId = window:id()
    
    -- Get the space this window is on
    local windowSpaces = hs.spaces.windowSpaces(windowId)
    local spaceId = windowSpaces and windowSpaces[1] or nil
    
    local result = {
        id = tostring(windowId),
        title = window:title() or "Untitled",
        application = app and app:name() or "Unknown",
        isMinimized = window:isMinimized(),
        isFullscreen = window:isFullscreen(),
        spaceId = spaceId and tostring(spaceId) or nil
    }
    
    return hs.json.encode(result)
  `;

  const result = await callHammerspoon(code);
  if (result === "null" || !result) {
    return null;
  }
  return JSON.parse(result);
}
