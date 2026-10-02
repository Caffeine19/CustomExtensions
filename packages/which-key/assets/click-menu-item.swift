#!/usr/bin/env swift

// Click a menu item by its breadcrumb path using AppleScript / System Events.
//
// System Events' `click` command handles full menu navigation including
// opening submenus, which is more reliable than AXUIElement for Electron
// apps (where the AX hierarchy is lazily populated and AXPress is ignored
// when the app isn't frontmost).
//
// Usage: click-menu-item.swift <AppName> <BundleId|"-"> <MenuBarItem> [submenu...] <MenuItem>
// Example: click-menu-item.swift "Code - Insiders" "-" "Code - Insiders" "Preferences" "Settings"
//          (pass "-" when the bundle id is unknown; the name is then matched against
//           both the Info.plist name and the on-disk file name)
//
// Exits with code 0 on success, 1 on error (message to stderr).

import Cocoa

// ─── Parse arguments ───

guard CommandLine.arguments.count >= 4 else {
    fputs("Usage: click-menu-item.swift <AppName> <BundleId|\"-\"> <MenuBarItem> [submenu...] <MenuItem>\n", stderr)
    exit(1)
}

let appName = CommandLine.arguments[1]
let bundleId = CommandLine.arguments[2]
let pathSegments = Array(CommandLine.arguments.dropFirst(3))

guard !pathSegments.isEmpty else {
    fputs("ERROR:No menu path segments provided\n", stderr)
    exit(1)
}

// Normalize: strip ".app" suffix for matching. Raycast reports the on-disk file name,
// which can differ from the Info.plist name after the user renames the bundle
// (e.g. file = "HBuilderX Arm.app" while localizedName = "HBuilderX").
let normalizedName = appName.hasSuffix(".app") ? String(appName.dropLast(4)) : appName

// ─── Resolve PID: bundle id first (rename-proof), then name variants ───

func matchesName(_ a: NSRunningApplication) -> Bool {
    let candidates = [appName, normalizedName]
    if let ln = a.localizedName, candidates.contains(ln) { return true } // Info.plist name
    if let file = a.bundleURL?.deletingPathExtension().lastPathComponent, candidates.contains(file) { return true } // on-disk name
    return false
}

let app: NSRunningApplication? = {
    if bundleId != "-",
       let byId = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == bundleId }) {
        return byId
    }
    return NSWorkspace.shared.runningApplications.first(where: {
        $0.activationPolicy == .regular && matchesName($0)
    })
}()

guard let app = app else {
    fputs("ERROR:App not found: \"\(appName)\" (bundleId: \(bundleId))\n", stderr)
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
