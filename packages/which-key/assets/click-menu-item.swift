#!/usr/bin/env swift

// Click a menu item by its breadcrumb path using AppleScript / System Events.
//
// System Events' `click` command handles full menu navigation including
// opening submenus, which is more reliable than AXUIElement for Electron
// apps (where the AX hierarchy is lazily populated and AXPress is ignored
// when the app isn't frontmost).
//
// Usage: click-menu-item.swift <AppName> <MenuBarItem> [submenu...] <MenuItem>
// Example: click-menu-item.swift "Code - Insiders" "Code - Insiders" "Preferences" "Settings"
//
// Exits with code 0 on success, 1 on error (message to stderr).

import Cocoa

// ─── Parse arguments ───

guard CommandLine.arguments.count >= 3 else {
    fputs("Usage: click-menu-item.swift <AppName> <MenuBarItem> [submenu...] <MenuItem>\n", stderr)
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

// ─── Resolve PID from app name ───

guard let app = NSWorkspace.shared.runningApplications.first(where: {
    $0.activationPolicy == .regular && ($0.localizedName == normalizedName || $0.bundleIdentifier == appName)
}) else {
    fputs("ERROR:App not found: \"\(appName)\"\n", stderr)
    exit(1)
}
let pid = app.processIdentifier
fputs("LOG:App resolved: \"\(appName)\" → pid=\(pid)\n", stderr)
fputs("LOG:Path segments: \(pathSegments)\n", stderr)

// ─── Build AppleScript menu item reference ───
// Path: ["Code - Insiders", "Preferences", "Settings"] →
//   menu item "Settings" of menu "Preferences" of menu item "Preferences"
//     of menu "Code - Insiders" of menu bar item "Code - Insiders" of menu bar 1
// Path: ["File", "Save"] →
//   menu item "Save" of menu "File" of menu bar item "File" of menu bar 1

let last = pathSegments[pathSegments.count - 1]
var ref = "menu item \"\(last)\""

for i in stride(from: pathSegments.count - 2, through: 1, by: -1) {
    ref += " of menu \"\(pathSegments[i])\" of menu item \"\(pathSegments[i])\""
}
ref += " of menu \"\(pathSegments[0])\" of menu bar item \"\(pathSegments[0])\" of menu bar 1"

// ─── Execute: activate app + click menu item ───

let script = """
tell application "System Events"
    set theProcess to first process whose unix id is \(pid)
    set frontmost of theProcess to true
    tell theProcess
        click \(ref)
    end tell
end tell
"""

fputs("LOG:Executing AppleScript click\n", stderr)

var error: NSDictionary?
if let appleScript = NSAppleScript(source: script) {
    appleScript.executeAndReturnError(&error)
    if let error = error {
        fputs("LOG:AppleScript ref: \(ref)\n", stderr)
        fputs("ERROR:\(error[NSAppleScript.errorMessage] ?? "unknown error")\n", stderr)
        exit(1)
    }
    fputs("LOG:AppleScript succeeded\n", stderr)
    exit(0)
}

fputs("ERROR:Failed to create AppleScript\n", stderr)
exit(1)
