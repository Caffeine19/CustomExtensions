import { runAppleScript } from "@raycast/utils";
import { ensureArcLaunched, isArcRunning } from "./launch-arc";
import { readSidebarSpaces } from "./sidebar";
import { Space, Tab } from "./types";
import { findSpaceInSpaces } from "./utils";

/**
 * Ensures Arc is running and has at least one window.
 * When Arc is not running, it is cold-launched with remote debugging flags
 * (launching already creates a window, so we avoid calling `make new window`
 * in that case to prevent duplicates).
 */
async function ensureArcIsRunning() {
  const wasRunning = isArcRunning();
  await ensureArcLaunched();
  if (!wasRunning) {
    return;
  }

  await runAppleScript(`
    tell application "Arc"
      if (count of windows) is 0 then
        make new window
      end if
    end tell
  `);
}

// Tabs
export async function getTabs() {
  await ensureArcIsRunning();
  const response = await runAppleScript(`
    on escape_value(this_text)
      set AppleScript's text item delimiters to "\\\\"
      set the item_list to every text item of this_text
      set AppleScript's text item delimiters to "\\\\\\\\"
      set this_text to the item_list as string
      set AppleScript's text item delimiters to "\\""
      set the item_list to every text item of this_text
      set AppleScript's text item delimiters to "\\\\\\""
      set this_text to the item_list as string
      set AppleScript's text item delimiters to ""
      return this_text
    end escape_value

    set _output to ""

    tell application "Arc"
      tell first window
        set allTabs to properties of every tab
      end tell
      set tabsCount to count of allTabs
      repeat with i from 1 to tabsCount
        set _tab to item i of allTabs
        set _title to my escape_value(get title of _tab)
        set _url to get URL of _tab
        set _id to get id of _tab
        set _location to get location of _tab
          
        set _output to (_output & "{ \\"title\\": \\"" & _title & "\\", \\"url\\": \\"" & _url & "\\", \\"id\\": \\"" & _id & "\\", \\"location\\": \\"" & _location & "\\" }")
        
        if i < tabsCount then
          set _output to (_output & ",\\n")
        else
          set _output to (_output & "\\n")
        end if

      end repeat
    end tell
    
    return "[\\n" & _output & "\\n]"
  `);

  return response ? (JSON.parse(response) as Tab[]) : undefined;
}

export async function findTab(url: string) {
  await ensureArcLaunched();
  const response = await runAppleScript(`
  on escape_value(this_text)
    set AppleScript's text item delimiters to "\\""
    set the item_list to every text item of this_text
    set AppleScript's text item delimiters to "\\\\\\""
    set this_text to the item_list as string
    set AppleScript's text item delimiters to ""
    return this_text
  end replace_chars

    set _output to ""

    tell application "Arc"
      set _window_index to 1

      repeat with _window in windows
          set _tab_index to 1
          
          repeat with _tab in tabs of _window
            set _url to get URL of _tab

            if _url is equal "${url}" then
              set _title to my escape_value(get title of _tab)
              set _location to get location of _tab
          
              set _output to (_output & "{ \\"title\\": \\"" & _title & "\\", \\"url\\": \\"" & _url & "\\", \\"windowId\\": " & _window_index & ", \\"tabId\\": " & _tab_index & " , \\"location\\": \\"" & _location & "\\" }")
                        
              return _output
            end if

            set _tab_index to _tab_index + 1
          end repeat
          
          set _window_index to _window_index + 1
      end repeat
    end tell

    return _output
  `);

  return response ? (JSON.parse(response) as Tab) : undefined;
}

async function runAppleScriptActionOnTab(tabId: string, action: string, activate = false) {
  await ensureArcIsRunning();
  return runAppleScript(`
    tell application "Arc"
      tell first window
        try
          tell (first tab whose id is "${tabId}") to ${action}
        end try
      end tell
      ${activate ? "activate" : ""}
    end tell
  `);
}

export async function selectTab(tab: Tab | string) {
  await runAppleScriptActionOnTab(typeof tab === "string" ? tab : tab.id, "select", true);
}

export async function closeTab(tab: Tab | string) {
  await runAppleScriptActionOnTab(typeof tab === "string" ? tab : tab.id, "close");
}

export async function reloadTab(tab: Tab | string) {
  await runAppleScriptActionOnTab(typeof tab === "string" ? tab : tab.id, "reload");
}

export async function makeNewTab(url: string, space?: Space) {
  await ensureArcIsRunning();
  await runAppleScript(`
    tell application "Arc"
      tell front window
        ${space ? `tell (first space whose id is "${space.id}") to focus` : ""}
        make new tab with properties {URL:"${url}"}
      end tell

      activate
    end tell
  `);
}

export async function getValidatedSpace(spaceIdOrTitle: string | undefined): Promise<Space | undefined> {
  if (spaceIdOrTitle) {
    const spaces = await getSpaces();
    if (spaces) {
      return findSpaceInSpaces(spaceIdOrTitle, spaces);
    }
  }

  return undefined;
}

// Windows
export type MakeNewWindowOptions = {
  incognito?: boolean;
  url?: string;
  space?: Space;
};

export async function makeNewWindow(options: MakeNewWindowOptions = {}): Promise<void> {
  await ensureArcLaunched();
  await runAppleScript(`
    tell application "Arc"
      make new window with properties {incognito:${options.incognito ?? false}}
      activate

      ${options.space ? `tell front window to tell (first space whose id is "${options.space.id}") to focus` : ""}
      ${options.url ? `tell front window to make new tab with properties {URL:"${options.url}"}` : ""}
    end tell
  `);
}

export async function makeNewBlankWindow(): Promise<void> {
  await ensureArcLaunched();
  await runAppleScript(`
    tell application "Arc"
      activate
    end tell
    delay(0.5)
    tell application "Arc"
      activate
    end tell

    tell application "System Events"
      tell process "Arc"
        click menu item "Blank window" of menu "File" of menu bar 1
      end tell
    end tell
  `);
}

export async function makeNewLittleArcWindow(url: string) {
  await ensureArcLaunched();
  await runAppleScript(`
    tell application "Arc"
      make new tab with properties {URL:"${url}"}
      activate
    end tell
  `);
}

// Spaces
export async function makeNewTabWithinSpace(url: string, space: Space) {
  await ensureArcIsRunning();
  await runAppleScript(`
    tell application "Arc"
      tell front window      
        tell (first space whose id is "${space.id}")
          make new tab with properties {URL:"${url}"}
        end tell
      end tell

      activate
    end tell
  `);
}

export async function selectSpace(space: Space) {
  await selectSpaceById(space.id);
}

export async function selectSpaceById(spaceId: string) {
  await ensureArcIsRunning();
  await runAppleScript(`
    tell application "Arc"
      tell front window
        tell (first space whose id is "${spaceId}") to focus
      end tell
      
      activate
    end tell
  `);
}

export async function getSpaces(): Promise<Space[] | undefined> {
  const spaces = await readSidebarSpaces();
  if (!spaces) {
    return undefined;
  }

  // isActive is per-window live UI state (not stored in the JSON); only this bit goes through AppleScript.
  // When Arc is not running, every space stays inactive.
  if (!isArcRunning()) {
    return spaces;
  }

  try {
    const response = await runAppleScript(`
    tell application "Arc"
      if (count of windows) is 0 then return ""
      tell front window
        return id of active space
      end tell
    end tell
  `);
    const activeSpaceId = (response || "").trim();

    return spaces.map((space) => ({ ...space, isActive: activeSpaceId !== "" && space.id === activeSpaceId }));
  } catch {
    return spaces;
  }
}

export async function getActiveSpace() {
  const spaces = await getSpaces();
  return spaces?.find((space) => space.isActive);
}

// Utils
export async function getVersion() {
  await ensureArcLaunched();
  const response = await runAppleScript(`
    set _output to ""

    tell application "Arc"
      return version
    end tell
  `);

  return response;
}

export async function getTabsInSpace(spaceId: string) {
  await ensureArcIsRunning();
  const response = await runAppleScript(`
    on escape_value(this_text)
      set AppleScript's text item delimiters to "\\\\"
      set the item_list to every text item of this_text
      set AppleScript's text item delimiters to "\\\\\\\\"
      set this_text to the item_list as string
      set AppleScript's text item delimiters to "\\""
      set the item_list to every text item of this_text
      set AppleScript's text item delimiters to "\\\\\\""
      set this_text to the item_list as string
      set AppleScript's text item delimiters to ""
      return this_text
    end escape_value

    set _output to ""

    tell application "Arc"
      tell front window
        repeat with _space in spaces
          if (id of _space) is equal to "${spaceId}" then
            set allTabs to properties of every tab of _space
            set tabsCount to count of allTabs
            repeat with i from 1 to tabsCount
              set _tab to item i of allTabs
              set _title to my escape_value(get title of _tab)
              set _url to get URL of _tab
              set _id to get id of _tab
              set _location to get location of _tab
                
              set _output to (_output & "{ \\"title\\": \\"" & _title & "\\", \\"url\\": \\"" & _url & "\\", \\"id\\": \\"" & _id & "\\", \\"location\\": \\"" & _location & "\\" }")
              
              if i < tabsCount then
                set _output to (_output & ",\\n")
              else
                set _output to (_output & "\\n")
              end if
            end repeat
            exit repeat
          end if
        end repeat
      end tell
    end tell
    
    return "[\\n" & _output & "\\n]"
  `);

  return response ? (JSON.parse(response) as Tab[]) : undefined;
}
