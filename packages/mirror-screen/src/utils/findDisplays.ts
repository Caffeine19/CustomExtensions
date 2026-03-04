/**
 * Find Screen Mirroring Displays Utility
 * Contains Lua scripts and functions for discovering available screen mirroring displays
 */

import { callHammerspoon } from "./call-hammerspoon";

export interface ScreenDisplay {
  title: string;
  role: string;
}

export interface ScreenMirroringResult {
  found: boolean;
  title?: string;
  app?: string;
  displays?: ScreenDisplay[];
  displayTitles?: string[];
  displayCount?: number;
  error?: string;
}

/**
 * Generates Lua code to find available screen mirroring displays
 * @returns Lua script string to discover displays in Control Center
 */
export function getCode(): string {
  return /* lua */ `
    -- Find the Screen Mirroring menu bar item and get available displays
    local axuielement = require("hs.axuielement")
    local application = require("hs.application")
    local logger = hs.logger.new('ScreenMirror', 'debug')
    
    -- Set log level to verbose to see all messages
    logger.setLogLevel('verbose')
    
    logger.i("🔍 Starting search for Screen Mirroring menu item...")
    
    -- Function to search all elements recursively for description match
    local function searchByDescription(element, depth)
      if not element or depth > 10 then return nil end
      
      local description = element:attributeValue("AXDescription")
      local role = element:attributeValue("AXRole")
      
      -- Check if this item has "Screen Mirroring" in description
      if description and description == "Screen Mirroring" then
        logger.i("✅ FOUND MATCH BY DESCRIPTION! Description: " .. description .. ", Role: " .. (role or "unknown"))
        return element
      end
      
      -- Recursively search children
      local children = element:attributeValue("AXChildren")
      if children then
        for _, child in ipairs(children) do
          local result = searchByDescription(child, depth + 1)
          if result then return result end
        end
      end
      
      return nil
    end
    
    -- Function to find mirror display options in the opened dialog
    local function findMirrorDisplays(element, depth)
      if not element or depth > 10 then 
        logger.w("⚠️  findMirrorDisplays: element is nil or depth > 10")
        return {} 
      end
      
      local displays = {}
      local title = element:attributeValue("AXTitle")
      local role = element:attributeValue("AXRole")
      local description = element:attributeValue("AXDescription")
      
      logger.d("🔎 findMirrorDisplays depth " .. depth .. ": title='" .. (title or "nil") .. "', role='" .. (role or "nil") .. "', description='" .. (description or "nil") .. "'")
      
      -- Look for toggle buttons that contain "Mirror" in the title
      if role == "AXButton" and title and string.find(title, "Mirror") then
        logger.i("🎯 Found mirror option: " .. title)
        table.insert(displays, {
          title = title,
          role = role
        })
      end
      
      -- Look for checkbox elements that represent display devices
      if role == "AXCheckBox" and description then
        logger.i("🖥️ Found display device: " .. description)
        table.insert(displays, {
          title = description,
          role = role
        })
      end
      
      -- Look for disclosure triangle elements that represent currently mirroring displays
      if role == "AXDisclosureTriangle" and description then
        logger.i("📱 Found current mirroring display: " .. description)
        table.insert(displays, {
          title = description .. " (Currently Mirroring)",
          role = role
        })
      end
      
      -- Recursively search children
      local children = element:attributeValue("AXChildren")
      if children then
        logger.d("📂 findMirrorDisplays: found " .. #children .. " children at depth " .. depth)
        for i, child in ipairs(children) do
          logger.v("👶 Processing child " .. i .. " of " .. #children)
          local childDisplays = findMirrorDisplays(child, depth + 1)
          for _, display in ipairs(childDisplays) do
            table.insert(displays, display)
          end
        end
      else
        logger.v("🚫 findMirrorDisplays: no children found at depth " .. depth)
      end
      
      logger.d("📊 findMirrorDisplays: returning " .. #displays .. " displays at depth " .. depth)
      return displays
    end
    
    -- Function to find the Control Center dialog window
    local function findControlCenterDialog(axApp)
      logger.i("🪟 findControlCenterDialog: starting search")
      local windows = axApp:attributeValue("AXWindows")
      if not windows then
        logger.e("🚫 findControlCenterDialog: no windows found")
        return nil
      end
      
      logger.i("📋 findControlCenterDialog: found " .. #windows .. " windows")
      for i, window in ipairs(windows) do
        local windowTitle = window:attributeValue("AXTitle")
        local windowRole = window:attributeValue("AXRole")
        local windowSubrole = window:attributeValue("AXSubrole")
        logger.d("🏠 Window " .. i .. ": title='" .. (windowTitle or "nil") .. "', role='" .. (windowRole or "nil") .. "', subrole='" .. (windowSubrole or "nil") .. "'")
        
        -- Look for the Control Center dialog window
        if windowTitle and (windowTitle == "Control Center" or string.find(windowTitle, "Screen Mirroring")) then
          logger.i("🎯 Found Control Center dialog window by title!")
          return window
        end
        
        -- Also check if this is a system dialog
        if windowRole == "AXWindow" then
          logger.i("✅ Found AXWindow, returning it")
          return window
        end
      end
      
      logger.w("❌ findControlCenterDialog: no matching windows found")
      return nil
    end
    
    -- Main execution function
    local function main()
      -- Check Control Center application
      local controlCenterApp = application.applicationsForBundleID("com.apple.controlcenter")[1]
      if not controlCenterApp then
        logger.e("🚫 Control Center application not found")
        return hs.json.encode({found = false, error = "Control Center application not found"})
      end
      
      logger.i("✅ Found Control Center application")
      local axApp = axuielement.applicationElement(controlCenterApp)
      if not axApp then
        logger.e("🚫 Could not get Control Center AX element")
        return hs.json.encode({found = false, error = "Could not access Control Center accessibility element"})
      end
      
      logger.i("🎯 Got Control Center AX element")
      local screenMirroringElement = searchByDescription(axApp, 0)
      if not screenMirroringElement then
        logger.e("🚫 Screen Mirroring element not found")
        return hs.json.encode({found = false, error = "Screen Mirroring button not found in Control Center"})
      end
      
      logger.i("🖱️ Found Screen Mirroring element, clicking it...")
      
      -- Click on the Screen Mirroring menu item to open the menu
      screenMirroringElement:performAction("AXPress")
      
      -- Wait a moment for the dialog to appear
      hs.timer.usleep(500000) -- 0.5 seconds
      
      -- Find the Control Center dialog window
      logger.i("🔍 Searching for Control Center dialog window...")
      local dialogWindow = findControlCenterDialog(axApp)
      
      if not dialogWindow then
        logger.w("❌ Could not find Control Center dialog window")
        return hs.json.encode({
          found = true,
          title = "Screen Mirroring",
          app = "Control Center",
          error = "Dialog not found"
        })
      end
      
      logger.i("✅ Found Control Center dialog, searching for mirror display options...")
      local displays = findMirrorDisplays(dialogWindow, 0)
      logger.i("📊 Total displays found: " .. #displays)

      local displayTitles = {}
      for i, display in ipairs(displays) do
        logger.d("🖥️ Display " .. i .. ": " .. display.title)
        table.insert(displayTitles, display.title)
      end
      logger.i("🎉 Final display titles: " .. table.concat(displayTitles, ", "))

      return hs.json.encode({
        found = true,
        title = "Screen Mirroring",
        app = "Control Center",
        displays = displays,
        displayTitles = displayTitles,
        displayCount = #displays
      })
    end
    
    -- Execute main function
    return main()
  `;
}

/**
 * Finds available screen mirroring displays
 * @returns Promise<ScreenDisplay[]> - Array of available displays
 */
export async function findDisplays(): Promise<ScreenDisplay[]> {
  try {
    const luaCode = getCode();
    const response = await callHammerspoon(luaCode);
    const result: ScreenMirroringResult = JSON.parse(response);

    if (result.found && result.displays) {
      return result.displays.map((display) => ({
        title: display.title,
        role: display.role,
      }));
    }

    return [];
  } catch (error) {
    console.error("Failed to find screen mirroring displays:", error);
    return [];
  }
}
