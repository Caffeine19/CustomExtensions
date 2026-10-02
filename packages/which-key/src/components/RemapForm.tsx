import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { findRemap, loadRemaps, removeRemap, upsertRemap } from "../utils/remapStore";
import type { RemapEntry } from "../utils/remapStore";
import { applyKeyEquivalent, removeKeyEquivalent, promptRestart, MODIFIER_COMBOS } from "../utils/appShortcuts";
import type { ModifierCombo } from "../utils/appShortcuts";

// ─── Types ───

/** Everything the form needs to know about the remap target. */
export interface RemapTarget {
  /** App display name */
  app: string;
  /** App bundle id (also the `defaults` domain) */
  bundleId: string;
  /** Full menu breadcrumb, e.g. "Shottr → Tools → Pin to Screen" */
  breadcrumb: string;
  /** NSUserKeyEquivalents key (leaf title, or "TopLevel > … > Leaf" when duplicated) */
  menu: string;
  /** Existing menu shortcut glyphs, e.g. "⌘⇧S" (display only) */
  shortcut?: string;
}

/** Decode an encoded value like "@~a" into its modifier combo + key (longest prefix wins). */
function decodeEncoded(encoded: string): { combo: ModifierCombo; key: string } | undefined {
  const combo = MODIFIER_COMBOS.filter((c) => c.id !== "none" && encoded.startsWith(c.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return combo ? { combo, key: encoded.slice(combo.prefix.length) } : undefined;
}

// ─── Form ───

export default function RemapForm({ target }: { target: RemapTarget }) {
  const [modifierId, setModifierId] = useState<string>(MODIFIER_COMBOS[1].id); // default: ⌘
  const [key, setKey] = useState("");
  const [existing, setExisting] = useState<RemapEntry | undefined>();

  // Prefill from the persisted remap (if any)
  useEffect(() => {
    (async () => {
      const found = findRemap(await loadRemaps(), target.bundleId, target.breadcrumb);
      if (!found) return;
      setExisting(found);
      const decoded = decodeEncoded(found.encoded);
      if (decoded) {
        setModifierId(decoded.combo.id);
        setKey(decoded.key);
      }
    })();
  }, [target.bundleId, target.breadcrumb]);

  const combo = MODIFIER_COMBOS.find((c) => c.id === modifierId) ?? MODIFIER_COMBOS[1];
  const isClear = combo.id === "none";

  const handleSubmit = async () => {
    if (!target.bundleId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Unknown bundle id",
        message: `Could not resolve the bundle id of ${target.app}`,
      });
      return;
    }
    try {
      if (isClear) {
        // Clear = remove the system override AND the ledger entry
        await removeKeyEquivalent(target.bundleId, target.menu);
        await removeRemap(target.bundleId, target.breadcrumb);
        await showToast({ style: Toast.Style.Success, title: "Shortcut cleared", message: target.breadcrumb });
      } else {
        const keyChar = key.trim().toLowerCase();
        if (Array.from(keyChar).length !== 1) {
          await showToast({ style: Toast.Style.Failure, title: "Invalid key", message: "Enter exactly one character" });
          return;
        }
        const encoded = `${combo.prefix}${keyChar}`;
        const display = `${combo.display}${keyChar.toUpperCase()}`;
        await applyKeyEquivalent(target.bundleId, target.menu, encoded);
        await upsertRemap({
          app: target.app,
          bundleId: target.bundleId,
          breadcrumb: target.breadcrumb,
          menu: target.menu,
          shortcut: display,
          encoded,
          updatedAt: new Date().toISOString(),
        });
        await showToast({
          style: Toast.Style.Success,
          title: `Shortcut set to ${display}`,
          message: target.breadcrumb,
        });
      }
    } catch (e) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to update shortcut", message: String(e) });
      return;
    }
    await promptRestart(target.app);
    await popToRoot();
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title={isClear ? "Clear Shortcut" : existing ? "Update Shortcut" : "Apply Shortcut"}
            icon={Icon.Keyboard}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Menu Item" text={target.breadcrumb} />
      <Form.Description
        title="Current Shortcut"
        text={existing ? `${existing.shortcut}  (${existing.encoded})` : target.shortcut || "None"}
      />
      <Form.Dropdown id="modifiers" title="Modifiers" value={combo.id} onChange={setModifierId} storeValue={false}>
        {MODIFIER_COMBOS.map((c) => (
          <Form.Dropdown.Item key={c.id} value={c.id} title={c.label} />
        ))}
      </Form.Dropdown>
      {!isClear && <Form.TextField id="key" title="Key" placeholder="e.g. a" value={key} onChange={setKey} autoFocus />}
      {isClear && (
        <Form.Description title="Effect" text="Removes the custom shortcut and restores the app's default." />
      )}
    </Form>
  );
}
