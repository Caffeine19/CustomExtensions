import { showHUD } from "@raycast/api";
import { createSpace } from "./utils/space";

export default async function Command() {
  try {
    await createSpace();
    await showHUD("Space created successfully");
  } catch (error) {
    console.error("Error creating space:", error);
    await showHUD(`Failed to create space: ${error}`);
  }
}
