import { Color, Icon, Image } from "@raycast/api";
import { Space } from "./types";

/** Whitelist of Ionicons assets (SVGs under assets/space-icons/, kebab-case file names). */
const IONICONS_ASSETS = new Set([
  "airplane",
  "albums",
  "apps",
  "bandage",
  "barbell",
  "baseball",
  "basket",
  "bed",
  "bonfire",
  "book",
  "bookmark",
  "bulb",
  "calendar",
  "chatbubble-ellipses",
  "checkbox",
  "cloud",
  "cloud-outline",
  "code",
  "color-palette",
  "construct",
  "copy",
  "document",
  "egg",
  "ellipse",
  "file-tray-full",
  "flag",
  "flash",
  "folder",
  "gift",
  "grid",
  "heart",
  "layers",
  "leaf",
  "mail",
  "map",
  "medical",
  "moon",
  "musical-notes",
  "notifications",
  "paw",
  "people",
  "pizza",
  "planet",
  "receipt",
  "restaurant",
  "server",
  "shapes",
  "skull",
  "square",
  "star",
  "sunny",
  "terminal",
  "thumbs-up",
  "train",
  "triangle",
  "videocam",
]);

/**
 * Arc stores iconType.icon in camelCase (e.g. fileTrayFull) while asset files use kebab-case
 * (file-tray-full.svg), so convert before looking up the asset.
 */
function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/** Converts a space's native Arc icon (emoji or Ionicons glyph) into a Raycast list icon. */
export function getSpaceIcon(space: Space): Image.ImageLike {
  const icon = space.icon;

  if (!icon) {
    return Icon.Layers;
  }

  if ("emoji" in icon) {
    return { source: icon.emoji };
  }

  const asset = toKebabCase(icon.ionicon);

  return IONICONS_ASSETS.has(asset)
    ? { source: `space-icons/${asset}.svg`, tintColor: Color.SecondaryText }
    : Icon.Layers;
}
