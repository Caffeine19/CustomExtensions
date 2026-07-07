#!/usr/bin/env swift

// Click a menu item by its breadcrumb path using AXUIElement API.
// This is the same approach Hammerspoon uses (see hs.application:selectMenuItem).
//
// Usage: click-menu-item.swift <AppName> <segment1> <segment2> ...
// Example: click-menu-item.swift "Safari" "File" "Save"
//
// Exits with code 0 on success, 1 on error (message to stderr).

import Cocoa

// Validate arguments
guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: click-menu-item.swift <AppName> <segment1> [segment2] ...\n", stderr)
    exit(1)
}

let appName = CommandLine.arguments[1]
let pathSegments = Array(CommandLine.arguments.dropFirst(2))

guard !pathSegments.isEmpty else {
    fputs("ERROR:No menu path segments provided\n", stderr)
    exit(1)
}

// Normalize: strip ".app" suffix for matching
let normalizedName = appName.hasSuffix(".app") ? String(appName.dropLast(4)) : appName

// Resolve PID from app name
guard let app = NSWorkspace.shared.runningApplications.first(where: {
    $0.activationPolicy == .regular && ($0.localizedName == normalizedName || $0.bundleIdentifier == appName)
}) else {
    fputs("ERROR:App not found: \"\(appName)\"\n", stderr)
    exit(1)
}
let pid = app.processIdentifier

// ─── Helper functions ───

func getChildren(_ element: AXUIElement) -> [AXUIElement] {
    var children: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &children) == .success,
          let items = children as? [AXUIElement] else { return [] }
    return items
}

func getRole(_ element: AXUIElement) -> String {
    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &role)
    return role as? String ?? ""
}

func getTitle(_ element: AXUIElement) -> String {
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &title)
    return title as? String ?? ""
}

// Create AX element for the application
let axApp = AXUIElementCreateApplication(pid)

// Get the menu bar
var menuBarRef: CFTypeRef?
guard AXUIElementCopyAttributeValue(axApp, kAXMenuBarAttribute as CFString, &menuBarRef) == .success,
      let menuBar = menuBarRef else {
    fputs("ERROR:Cannot access menu bar\n", stderr)
    exit(1)
}

// Navigate the menu hierarchy
// Path: ["File", "Open Recent", "Clear Menu"] →
//   menu bar item "File" → menu "File" → menu item "Open Recent" → menu "Open Recent" → menu item "Clear Menu"
var currentElement = menuBar as! AXUIElement

for (idx, segment) in pathSegments.enumerated() {
    let isLast = idx == pathSegments.count - 1

    // Get children of current element
    let children = getChildren(currentElement)
    var found: AXUIElement?
    var fallbackFound: AXUIElement?

    for child in children {
        let role = getRole(child)
        let title = getTitle(child)

        // Match by title
        if title == segment {
            // Prefer exact role match: menu bar items for first segment, menu items for rest
            if idx == 0 && role == (kAXMenuBarItemRole as String) {
                found = child
                break
            } else if idx > 0 && role == (kAXMenuItemRole as String) {
                found = child
                break
            }
            // Fallback: accept any matching title
            if fallbackFound == nil {
                fallbackFound = child
            }
        }
    }

    // If we didn't find an exact role match, use the fallback
    if found == nil {
        found = fallbackFound
    }

    guard let matched = found else {
        fputs("ERROR:Menu item not found: \"\(segment)\"\n", stderr)
        exit(1)
    }

    if isLast {
        // This is the target menu item — click it
        let result = AXUIElementPerformAction(matched, kAXPressAction as CFString)
        if result == .success {
            exit(0)
        } else {
            fputs("ERROR:Failed to press menu item \"\(segment)\" (AXError: \(result.rawValue))\n", stderr)
            exit(1)
        }
    } else {
        // Intermediate item — navigate into its submenu
        // A menu item's submenu is its child with role AXMenu
        let itemChildren = getChildren(matched)
        var submenu: AXUIElement?

        for child in itemChildren {
            if getRole(child) == (kAXMenuRole as String) {
                submenu = child
                break
            }
        }

        guard let sub = submenu else {
            fputs("ERROR:No submenu found for \"\(segment)\"\n", stderr)
            exit(1)
        }

        currentElement = sub
    }
}

// Should not reach here
fputs("ERROR:Unexpected end of path\n", stderr)
exit(1)
