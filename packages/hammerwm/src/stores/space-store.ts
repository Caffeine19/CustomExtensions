import { create } from "zustand";
import { Space, Window } from "../types/space";
import {
  listSpace,
  getSpaceWindows,
  removeSpaceById,
  gotoSpace,
  getAllWindows,
  focusWindow,
} from "../utils/space";
import { tryit, sleep } from "radash";
import { showFailureToast } from "@raycast/utils";
import { getApplications } from "@raycast/api";
import { logger } from "../utils/logger";

/**
 * Space store interface for managing space-related state and actions
 */
interface SpaceStore {
  /** List of all spaces */
  spaces: Space[];
  /** Global loading state */
  isLoading: boolean;
  /** Windows data for each space, keyed by space ID */
  spaceWindows: Record<string, Window[]>;
  /** Loading state for windows of each space, keyed by space ID */
  loadingWindows: Record<string, boolean>;
  /** Currently selected space ID */
  selectedSpaceId: string | null;
  /** Application icons cache, keyed by application name */
  appIcons: Record<string, string>;
  /** All windows from all spaces */
  allWindows: Window[];
  /** Loading state for all windows */
  isLoadingAllWindows: boolean;

  /** Fetch all spaces from the system */
  fetchSpaces: () => Promise<void>;
  /** Fetch windows for a specific space */
  fetchSpaceWindows: (spaceId: string) => Promise<void>;
  /** Fetch application icons for given application names */
  fetchApplicationIcons: (applicationNames: string[]) => Promise<void>;
  /** Remove a space by ID */
  removeSpace: (spaceId: string) => Promise<void>;
  /** Navigate to a specific space */
  goToSpace: (spaceId: string) => Promise<void>;
  /** Set the currently selected space ID */
  setSelectedSpaceId: (spaceId: string | null) => void;
  /** Fetch all windows from all spaces */
  fetchAllWindows: () => Promise<void>;
  /** Focus a window by ID */
  focusWindow: (windowId: string) => Promise<void>;
}

export const useSpaceStore = create<SpaceStore>((set, get) => ({
  /** Initial state */
  spaces: [],
  isLoading: true,
  spaceWindows: {},
  loadingWindows: {},
  selectedSpaceId: null,
  appIcons: {},
  allWindows: [],
  isLoadingAllWindows: false,

  /**
   * Fetch all spaces from the system
   * @returns Promise that resolves when spaces are fetched
   */
  fetchSpaces: async () => {
    set({ isLoading: true });
    const [err, res] = await tryit(listSpace)();
    set({ isLoading: false });

    if (err) {
      showFailureToast(err);
      return;
    }

    set({ spaces: res });
  },

  /**
   * Fetch application icons for given application names
   * @param applicationNames - Array of application names to fetch icons for
   * @returns Promise that resolves when icons are fetched
   */
  fetchApplicationIcons: async (applicationNames: string[]) => {
    const [err, applications] = await tryit(getApplications)();
    logger.info({ applications }, "fetchApplicationIcons applications");
    if (err) {
      console.error("Failed to fetch applications:", err);
      return;
    }

    const newAppIcons: Record<string, string> = {};
    applicationNames.forEach((appName) => {
      const app = applications.find((app) => app.name === appName);
      if (app) {
        newAppIcons[appName] = app.path;
      }
    });

    set((state: SpaceStore) => ({
      appIcons: { ...state.appIcons, ...newAppIcons },
    }));
  },

  /**
   * Fetch windows for a specific space
   * @param spaceId - The ID of the space to fetch windows for
   * @returns Promise that resolves when windows are fetched
   */
  fetchSpaceWindows: async (spaceId: string) => {
    const { spaceWindows, loadingWindows, appIcons } = get();

    if (spaceWindows[spaceId] || loadingWindows[spaceId]) {
      console.log(
        "🚀 ~ fetchSpaceWindows ~ skipping, already loaded or loading",
      );
      return;
    }

    set((state: SpaceStore) => ({
      isLoading: true,
      loadingWindows: { ...state.loadingWindows, [spaceId]: true },
    }));

    await sleep(100);
    const [err, windows] = await tryit(getSpaceWindows)(spaceId);

    set((state: SpaceStore) => ({
      loadingWindows: { ...state.loadingWindows, [spaceId]: false },
    }));

    // Reset loading after a delay
    setTimeout(() => {
      set({ isLoading: false });
    }, 200);

    if (err) {
      showFailureToast(err);
      return;
    }

    set((state: SpaceStore) => ({
      spaceWindows: { ...state.spaceWindows, [spaceId]: windows },
    }));

    // Fetch application icons for new applications
    const newAppNames = windows
      .map((window) => window.application)
      .filter((appName) => !appIcons[appName]);

    if (newAppNames.length > 0) {
      get().fetchApplicationIcons(newAppNames);
    }
  },

  /**
   * Remove a space by ID
   * @param spaceId - The ID of the space to remove
   * @returns Promise that resolves when space is removed
   */
  removeSpace: async (spaceId: string) => {
    const [err] = await tryit(removeSpaceById)(spaceId);
    if (err) {
      showFailureToast(err);
      return;
    }

    // Remove space from list and clean up related data
    set((state: SpaceStore) => {
      const newSpaceWindows = { ...state.spaceWindows };
      const newLoadingWindows = { ...state.loadingWindows };
      delete newSpaceWindows[spaceId];
      delete newLoadingWindows[spaceId];

      return {
        spaces: state.spaces.filter((space: Space) => space.id !== spaceId),
        spaceWindows: newSpaceWindows,
        loadingWindows: newLoadingWindows,
      };
    });
  },

  /**
   * Navigate to a specific space
   * @param spaceId - The ID of the space to navigate to
   * @returns Promise that resolves when navigation is complete
   */
  goToSpace: async (spaceId: string) => {
    const [err] = await tryit(gotoSpace)(spaceId);
    if (err) {
      showFailureToast(err);
      return;
    }

    // Find the target space to get its screen
    const targetSpace = get().spaces.find(
      (space: Space) => space.id === spaceId,
    );
    if (!targetSpace) {
      return;
    }

    // Update current space only for the target screen
    // Other screens should keep their current space unchanged
    set((state: SpaceStore) => ({
      spaces: state.spaces.map((space: Space) => {
        // Only update isCurrent for spaces on the same screen
        if (space.screenId === targetSpace.screenId) {
          return {
            ...space,
            isCurrent: space.id === spaceId,
          };
        }
        // Keep other screens' current state unchanged
        return space;
      }),
    }));
  },

  /**
   * Set the currently selected space ID and fetch its windows if needed
   * @param spaceId - The ID of the space to select, or null to deselect
   */
  setSelectedSpaceId: (spaceId: string | null) => {
    set({ selectedSpaceId: spaceId });

    if (spaceId) {
      const { spaceWindows, loadingWindows } = get();
      // Only fetch windows if we don't already have them
      if (!spaceWindows[spaceId] && !loadingWindows[spaceId]) {
        get().fetchSpaceWindows(spaceId);
      }
    }
  },

  /**
   * Fetch all windows from all spaces
   * @returns Promise that resolves when all windows are fetched
   */
  fetchAllWindows: async () => {
    set({ isLoadingAllWindows: true });
    const [err, windows] = await tryit(getAllWindows)();
    set({ isLoadingAllWindows: false });

    console.log(
      "🚀 ~ space-store.ts:235 ~ windows:",
      JSON.stringify(windows, null, 2),
    );

    if (err) {
      showFailureToast(err);
      return;
    }

    set({ allWindows: windows });

    // Fetch app icons for all unique applications
    const uniqueApps = Array.from(new Set(windows.map((w) => w.application)));
    get().fetchApplicationIcons(uniqueApps);
  },

  /**
   * Focus a window by ID
   * @param windowId - The ID of the window to focus
   * @returns Promise that resolves when the window is focused
   */
  focusWindow: async (windowId: string) => {
    const [err] = await tryit(focusWindow)(windowId);
    if (err) {
      showFailureToast(err);
      return;
    }
  },
}));
