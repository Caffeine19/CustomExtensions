/**
 * Toggle Display Mirroring Utility
 * Contains Lua scripts and functions for toggling screen mirroring status of displays
 */

import { callHammerspoon } from "./call-hammerspoon";

export interface ToggleDisplayResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Generates Lua code to toggle a specific display's mirroring status
 * @param displayTitle - The title of the display to toggle
 * @returns Lua script string to toggle the specified display
 */
function getCode(displayTitle: string): string {
  return /* lua */ `
    -- Find and click on a specific display menu item
    local axuielement = require("hs.axuielement")
    local application = require("hs.application")
    local logger = hs.logger.new('ScreenMirror', 'debug')
    
    logger.setLogLevel('verbose')
    logger.i("🔍 Looking for display: ${displayTitle}")
    
    -- Function to search all elements recursively for description match (Screen Mirroring button)
    local function searchByDescription(element, depth)
      if not element or depth > 10 then return nil end
      
      local description = element:attributeValue("AXDescription")
      local role = element:attributeValue("AXRole")
      
      -- Check if this item has "Screen Mirroring" in description
      if description and description == "Screen Mirroring" then
        logger.i("✅ FOUND SCREEN MIRRORING BUTTON! Description: " .. description .. ", Role: " .. (role or "unknown"))
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
    
    -- Function to search all elements recursively for the specific display
    local function searchByTitle(element, depth, targetTitle)
      if not element or depth > 10 then return nil end
      
      local title = element:attributeValue("AXTitle")
      local description = element:attributeValue("AXDescription")
      local role = element:attributeValue("AXRole")
      
      -- Check if this item matches our target display
      if (title and title == targetTitle) or (description and description == targetTitle) then
        logger.i("✅ FOUND TARGET DISPLAY! Title: " .. (title or "nil") .. ", Description: " .. (description or "nil") .. ", Role: " .. (role or "unknown"))
        return element
      end
      
      -- Recursively search children
      local children = element:attributeValue("AXChildren")
      if children then
        for _, child in ipairs(children) do
          local result = searchByTitle(child, depth + 1, targetTitle)
          if result then return result end
        end
      end
      
      return nil
    end
    
    -- Function to find the Control Center dialog window
    local function findControlCenterDialog(axApp)
      local windows = axApp:attributeValue("AXWindows")
      if not windows then
        return nil
      end
      
      for i, window in ipairs(windows) do
        local windowTitle = window:attributeValue("AXTitle")
        local windowRole = window:attributeValue("AXRole")
        
        if windowTitle and (windowTitle == "Control Center" or string.find(windowTitle, "Screen Mirroring")) then
          return window
        end
        
        if windowRole == "AXWindow" then
          return window
        end
      end
      
      return nil
    end
    
    -- Main execution function
    local function main()
      -- Check Control Center application
      local controlCenterApp = application.applicationsForBundleID("com.apple.controlcenter")[1]
      if not controlCenterApp then
        logger.e("🚫 Control Center application not found")
        return hs.json.encode({success = false, error = "Could not interact with display"})
      end
      
      logger.i("✅ Found Control Center application")
      local axApp = axuielement.applicationElement(controlCenterApp)
      if not axApp then
        logger.e("🚫 Could not get Control Center AX element")
        return hs.json.encode({success = false, error = "Could not interact with display"})
      end
      
      -- First, find and click the Screen Mirroring button to open the dialog
      logger.i("🔍 Searching for Screen Mirroring button...")
      local screenMirroringElement = searchByDescription(axApp, 0)
      if not screenMirroringElement then
        logger.w("❌ Screen Mirroring button not found")
        return hs.json.encode({
          success = false,
          error = "Screen Mirroring button not found. Please ensure Control Center is accessible."
        })
      end
      
      logger.i("🖱️ Found Screen Mirroring button, clicking it...")
      screenMirroringElement:performAction("AXPress")
      
      -- Wait a moment for the dialog to appear
      hs.timer.usleep(500000) -- 0.5 seconds
      
      -- Now find the Control Center dialog window
      logger.i("🔍 Searching for Control Center dialog window...")
      local dialogWindow = findControlCenterDialog(axApp)
      
      if not dialogWindow then
        logger.w("❌ Control Center dialog not found after clicking Screen Mirroring button")
        return hs.json.encode({
          success = false,
          error = "Control Center dialog not found after opening"
        })
      end
      
      logger.i("✅ Found Control Center dialog, searching for target display...")
      local targetElement = searchByTitle(dialogWindow, 0, "${displayTitle}")
      
      if not targetElement then
        logger.w("❌ Could not find target display element")
        return hs.json.encode({
          success = false,
          error = "Display element not found"
        })
      end
      
      logger.i("🖱️ Found target element, clicking it...")
      targetElement:performAction("AXPress")
      
      -- Wait a moment for the action to complete
      hs.timer.usleep(300000) -- 0.3 seconds
      
      -- Close the Control Center dialog by pressing Escape
      logger.i("🔐 Closing Control Center dialog with Escape key...")
      hs.eventtap.keyStroke({}, "escape")
      
      return hs.json.encode({
        success = true,
        message = "Clicked on " .. "${displayTitle}"
      })
    end
    
    -- Execute main function
    return main()
  `;
}

/**
 * Toggles the mirroring status of a specific display
 * @param displayTitle - The title of the display to toggle
 * @returns Promise<ToggleDisplayResult> - Result of the toggle operation
 */
export async function toggleDisplay(displayTitle: string): Promise<ToggleDisplayResult> {
  try {
    const luaCode = getCode(displayTitle);
    const response = await callHammerspoon(luaCode);
    const result = JSON.parse(response);

    return {
      success: result.success || false,
      message: result.message,
      error: result.error,
    };
  } catch (error) {
    console.error("Failed to toggle display mirroring:", error);
    return {
      success: false,
      error: "Failed to interact with display",
    };
  }
}
