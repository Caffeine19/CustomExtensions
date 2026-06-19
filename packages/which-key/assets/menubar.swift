import Cocoa

func formatMod(_ mod: Int) -> String {
    var s = ""
    let hasFn   = mod & 16 != 0  // bit 4 = fn/Globe
    let noCmd   = mod & 8 != 0   // bit 3 = suppress Command
    if hasFn   { s += "fn" }
    if mod & 4 != 0 { s += "\u{2303}" } // ⌃ Control
    if mod & 2 != 0 { s += "\u{2325}" } // ⌥ Option
    if mod & 1 != 0 { s += "\u{21E7}" } // ⇧ Shift
    // Command shown unless suppressed (bit 3) or fn replaces it (bit 4)
    if !noCmd && !hasFn { s += "\u{2318}" } // ⌘
    return s
}

/// Map AXMenuItemCmdGlyph codes to readable key names
/// Only includes well-documented system glyph codes (23-36)
func glyphName(_ glyph: Int) -> String? {
    switch glyph {
    case 23: return "\u{232B}" // ⌫ Delete
    case 24: return "\u{21E5}" // ⇥ Tab
    case 25: return "\u{2324}" // ⌤ Enter
    case 27: return "\u{238B}" // ⎋ Escape
    case 28: return "\u{2326}" // ⌦ Forward Delete
    case 29: return "\u{2196}" // ↖ Home
    case 30: return "\u{2198}" // ↘ End
    case 31: return "\u{21DE}" // ⇞ Page Up
    case 32: return "\u{21DF}" // ⇟ Page Down
    case 33: return "\u{2191}" // ↑ Up Arrow
    case 34: return "\u{2193}" // ↓ Down Arrow
    case 35: return "\u{2190}" // ← Left Arrow
    case 36: return "\u{2192}" // → Right Arrow
    default: return nil
    }
}

/// Map virtual key codes to readable key names (for when glyph is 0)
func vkeyName(_ vkey: Int) -> String? {
    switch vkey {
    case 123: return "\u{2190}" // ← Left Arrow
    case 124: return "\u{2192}" // → Right Arrow
    case 125: return "\u{2193}" // ↓ Down Arrow
    case 126: return "\u{2191}" // ↑ Up Arrow
    case 115: return "\u{2196}" // ↖ Home
    case 119: return "\u{2198}" // ↘ End
    case 116: return "\u{21DE}" // ⇞ Page Up
    case 121: return "\u{21DF}" // ⇟ Page Down
    case 51:  return "\u{232B}" // ⌫ Delete
    case 117: return "\u{2326}" // ⌦ Forward Delete
    case 36:  return "\u{2324}" // ⌤ Return
    case 48:  return "\u{21E5}" // ⇥ Tab
    case 53:  return "\u{238B}" // ⎋ Escape
    case 122: return "F1"
    case 120: return "F2"
    case 99:  return "F3"
    case 118: return "F4"
    case 96:  return "F5"
    case 97:  return "F6"
    case 98:  return "F7"
    case 100: return "F8"
    case 101: return "F9"
    case 109: return "F10"
    case 103: return "F11"
    case 111: return "F12"
    default:  return nil
    }
}

/// Resolve the key character from AXMenuItemCmdChar, virtual key code, or glyph.
/// Priority: char (if printable) → vkey (most reliable) → glyph (fallback)
func resolveKey(_ cmdChar: String?, _ cmdGlyph: Int, _ cmdVKey: Int) -> String {
    // 1. If we have a printable character, use it
    if let ch = cmdChar, !ch.isEmpty {
        if ch.unicodeScalars.allSatisfy({ $0.value >= 0x20 && $0.value < 0x7F }) {
            return ch
        }
        // Control character — fall through to vkey/glyph
    }
    // 2. Virtual key code (most reliable for special keys)
    if cmdVKey > 0, let name = vkeyName(cmdVKey) { return name }
    // 3. Glyph code (fallback for apps that don't set vkey)
    if cmdGlyph > 0, let name = glyphName(cmdGlyph) { return name }
    return ""
}

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

func collectMenuItems(_ menu: AXUIElement, path: String) {
    for item in getChildren(menu) {
        guard getRole(item) == (kAXMenuItemRole as String) else { continue }
        let title = getTitle(item)
        guard !title.isEmpty else { continue }

        // Always read modifiers and glyph — not just when char exists
        var cmdModRef: CFTypeRef?
        var mod = 0
        if AXUIElementCopyAttributeValue(item, "AXMenuItemCmdModifiers" as CFString, &cmdModRef) == .success,
           let m = cmdModRef as? Int { mod = m }

        var cmdCharRef: CFTypeRef?
        AXUIElementCopyAttributeValue(item, "AXMenuItemCmdChar" as CFString, &cmdCharRef)
        let cmdChar = cmdCharRef as? String

        var cmdGlyphRef: CFTypeRef?
        var cmdGlyph = 0
        if AXUIElementCopyAttributeValue(item, "AXMenuItemCmdGlyph" as CFString, &cmdGlyphRef) == .success,
           let g = cmdGlyphRef as? Int { cmdGlyph = g }

        var cmdVKeyRef: CFTypeRef?
        var cmdVKey = 0
        if AXUIElementCopyAttributeValue(item, "AXMenuItemCmdVirtualKey" as CFString, &cmdVKeyRef) == .success,
           let v = cmdVKeyRef as? Int { cmdVKey = v }

        let key = resolveKey(cmdChar, cmdGlyph, cmdVKey)
        let shortcut: String
        if !key.isEmpty || mod > 0 {
            shortcut = formatMod(mod) + key
        } else {
            shortcut = ""
        }

        let bp = path + " -> " + title
        let subMenus = getChildren(item).filter { getRole($0) == (kAXMenuRole as String) }
        print(bp + "|" + shortcut + "|" + (subMenus.isEmpty ? "N" : "Y"))

        for sub in subMenus {
            collectMenuItems(sub, path: bp)
        }
    }
}

guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.isActive && $0.activationPolicy == .regular }),
      let name = app.localizedName else {
    fputs("ERROR:No frontmost app\n", stderr); exit(1)
}
fputs("APP:\(name)\n", stderr)

let axApp = AXUIElementCreateApplication(app.processIdentifier)
var menuBar: CFTypeRef?
guard AXUIElementCopyAttributeValue(axApp, kAXMenuBarAttribute as CFString, &menuBar) == .success,
      let mb = menuBar else {
    fputs("ERROR:No menu bar\n", stderr); exit(1)
}

for mbi in getChildren(mb as! AXUIElement) {
    guard getRole(mbi) == (kAXMenuBarItemRole as String) else { continue }
    let title = getTitle(mbi)
    guard !title.isEmpty, title != "Apple" else { continue }
    for child in getChildren(mbi) {
        if getRole(child) == (kAXMenuRole as String) {
            collectMenuItems(child, path: title)
        }
    }
}
