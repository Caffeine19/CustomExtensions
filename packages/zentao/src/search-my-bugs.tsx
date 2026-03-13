import { Action, ActionPanel, getPreferenceValues, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import dayjs from "dayjs";
import { Effect } from "effect";
import { CircularBuffer } from "mnemonist";
import { alphabetical, sift, unique } from "radash";
import { useEffect, useMemo, useState } from "react";

import { BugDetail } from "./components/BugDetail";
import { SessionRefreshAction } from "./components/SessionRefreshAction";
import { getBugSeverityColor, getBugSeverityIcon, getBugSeverityLabel } from "./constants/bugSeverity";
import { getBugStatusIconConfig } from "./constants/bugStatus";
import { TAILWIND_COLORS } from "./constants/colors";
import { CACHE_KEYS } from "./constants/key";
import { getPriorityColor, getPriorityIcon, getPriorityLabel } from "./constants/priority";
import { useT } from "./hooks/useT";
import { BugListItem, BugStatus } from "./types/bug";
import { withAutoRetry } from "./utils/autoRetry";
import { fetchBugsFromZentao } from "./utils/bugService";
import { searchBugs } from "./utils/fuseSearch";
import { slice } from "./utils/slice";

type SortOrder =
  | "none"
  | "date-asc"
  | "date-desc"
  | "priority-asc"
  | "priority-desc"
  | "status-asc"
  | "status-desc"
  | "severity-asc"
  | "severity-desc"
  | "name";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();

  const { t } = useT();

  const [bugs, setBugs] = useCachedState<BugListItem[]>(CACHE_KEYS.BUGS, []);

  const [isLoading, setIsLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("priority-asc");

  const [selectedProduct, setSelectedProduct] = useCachedState<string>(CACHE_KEYS.SELECTED_PRODUCT, "all");
  const [pinnedBugIds, setPinnedBugIds] = useCachedState<string[]>(CACHE_KEYS.PINNED_BUGS, []);

  const [searchQuery, setSearchQuery] = useState<string>("");

  const togglePinBug = (bugId: string) => {
    setPinnedBugIds((prev) => {
      if (prev.includes(bugId)) {
        return prev.filter((id) => id !== bugId);
      }
      const buffer = CircularBuffer.from(prev, Array, 10);
      buffer.push(bugId);
      return Array.from(buffer);
    });
  };

  const fetchBugs = async () => {
    setIsLoading(true);

    const program = fetchBugsFromZentao().pipe(
      withAutoRetry(),
      Effect.tap((parsedBugs) =>
        Effect.sync(() => {
          setBugs(parsedBugs);
          showToast({
            style: Toast.Style.Success,
            title: t("bugList.connectedToZentao"),
            message: t("bugList.foundBugs", { count: parsedBugs.length }),
          });
        }),
      ),
      Effect.catchAll((e) =>
        Effect.sync(() => {
          showToast({
            style: Toast.Style.Failure,
            title: t("bugList.failedToFetchBugs"),
            message: e.message,
          });
        }),
      ),
    );

    try {
      await Effect.runPromise(program);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshSession = async () => {
    // 会话刷新成功后，重新获取Bug
    await fetchBugs();
  };

  useEffect(() => {
    fetchBugs();
  }, []);

  /** 产品列表及Bug数量 */
  const productList = useMemo(() => {
    const products = sift(bugs.map((bug) => bug.product));
    const uniqueProductList = unique(products, (product) => product);
    const sortedProducts = alphabetical(uniqueProductList, (product) => product);

    // 计算每个产品的Bug数量
    return sortedProducts.map((product) => ({
      name: product,
      count: bugs.filter((bug) => bug.product === product).length,
    }));
  }, [bugs]);

  /** 根据产品筛选Bug */
  const filteredBugs = useMemo(() => {
    if (selectedProduct === "all") {
      return bugs;
    }
    return bugs.filter((bug) => bug.product === selectedProduct);
  }, [bugs, selectedProduct]);

  /** 根据搜索查询筛选Bug（使用 Fuse.js 和拼音搜索） */
  const searchedBugs = useMemo(() => {
    return searchBugs(filteredBugs, searchQuery);
  }, [filteredBugs, searchQuery]);

  const sortedBugs = useMemo(() => {
    const bugsToSort = searchedBugs;
    if (sortOrder === "none") return bugsToSort;

    const sorted = [...bugsToSort].sort((a, b) => {
      if (sortOrder.startsWith("date")) {
        const dateA = dayjs(a.deadline);
        const dateB = dayjs(b.deadline);

        if (!dateA.isValid() && !dateB.isValid()) return 0;
        if (!dateA.isValid()) return 1;
        if (!dateB.isValid()) return -1;

        if (sortOrder === "date-asc") {
          return dateA.isBefore(dateB) ? -1 : dateA.isAfter(dateB) ? 1 : 0;
        } else {
          return dateB.isBefore(dateA) ? -1 : dateB.isAfter(dateA) ? 1 : 0;
        }
      } else if (sortOrder.startsWith("priority")) {
        // Priority: 1 = highest, 4 = lowest
        const priorityA = parseInt(a.priority) || 999;
        const priorityB = parseInt(b.priority) || 999;

        if (sortOrder === "priority-asc") {
          return priorityA - priorityB; // 1,2,3,4 (highest to lowest)
        } else {
          return priorityB - priorityA; // 4,3,2,1 (lowest to highest)
        }
      } else if (sortOrder.startsWith("status")) {
        // Define status order for logical sorting
        const statusOrder = {
          [BugStatus.ACTIVE]: 1,
          [BugStatus.RESOLVED]: 2,
          [BugStatus.CLOSED]: 3,
        };

        const statusA = statusOrder[a.status as BugStatus] || 999;
        const statusB = statusOrder[b.status as BugStatus] || 999;

        if (sortOrder === "status-asc") {
          return statusA - statusB;
        } else {
          return statusB - statusA;
        }
      } else if (sortOrder.startsWith("severity")) {
        // Severity: 1 = minor, 4 = critical
        const severityA = parseInt(a.severity) || 999;
        const severityB = parseInt(b.severity) || 999;

        if (sortOrder === "severity-asc") {
          return severityB - severityA; // 4,3,2,1 (critical to minor)
        } else {
          return severityA - severityB; // 1,2,3,4 (minor to critical)
        }
      } else if (sortOrder === "name") {
        return a.title.localeCompare(b.title);
      }

      return 0;
    });

    return sorted;
  }, [searchedBugs, sortOrder]);

  /** 置顶Bug排在前面 */
  const pinnedBugs = useMemo(() => {
    return sortedBugs.filter((b) => pinnedBugIds.includes(b.id));
  }, [sortedBugs, pinnedBugIds]);

  const unpinnedBugs = useMemo(() => {
    return sortedBugs.filter((b) => !pinnedBugIds.includes(b.id));
  }, [sortedBugs, pinnedBugIds]);

  const renderBugItem = (bug: BugListItem, isOverdue: boolean | string) => {
    const isPinned = pinnedBugIds.includes(bug.id);
    return (
      <List.Item
        key={bug.id}
        icon={getBugStatusIconConfig(bug.status)}
        title={bug.title}
        subtitle={bug.product}
        accessories={[
          ...(bug.deadline
            ? [
                {
                  tag: {
                    value: bug.deadline,
                    color: isOverdue ? TAILWIND_COLORS.red[400] : TAILWIND_COLORS.gray[200],
                  },
                },
              ]
            : []),
          {
            icon: {
              source: getBugSeverityIcon(bug.severity),
              tintColor: getBugSeverityColor(bug.severity),
            },
            tooltip: getBugSeverityLabel(bug.severity),
          },
          {
            icon: {
              source: getPriorityIcon(bug.priority),
              tintColor: getPriorityColor(bug.priority),
            },
            tooltip: getPriorityLabel(bug.priority),
          },
        ]}
        actions={
          <ActionPanel>
            <Action.Push title={t("bugActions.viewBugDetails")} icon={Icon.Eye} target={<BugDetail bug={bug} />} />

            <Action.OpenInBrowser
              title={t("bugActions.openInZentao")}
              url={`${preferences.zentaoUrl}/bug-view-${bug.id}.html`}
            />

            <Action
              title={isPinned ? t("bugActions.unpinBug") : t("bugActions.pinBug")}
              onAction={() => togglePinBug(bug.id)}
              icon={isPinned ? Icon.PinDisabled : Icon.Pin}
              shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            />

            <Action.CopyToClipboard
              title={t("bugActions.copyBugId")}
              content={bug.id}
              icon={Icon.Clipboard}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />

            <Action.CopyToClipboard
              title={t("bugActions.copyBugUrl")}
              content={`${preferences.zentaoUrl}/bug-view-${bug.id}.html`}
              icon={Icon.Link}
              shortcut={{ modifiers: ["cmd", "opt"], key: "c" }}
            />

            <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />

            <ActionPanel.Section title={t("sortActions.sortByDate")}>
              <Action
                title={t("sortActions.sortByDateEarliestFirst")}
                onAction={() => setSortOrder("date-asc")}
                icon={Icon.ArrowUp}
              />
              <Action
                title={t("sortActions.sortByDateLatestFirst")}
                onAction={() => setSortOrder("date-desc")}
                icon={Icon.ArrowDown}
              />
            </ActionPanel.Section>

            <ActionPanel.Section title={t("sortActions.sortByPriority")}>
              <Action
                title={t("sortActions.sortByPriorityHighToLow")}
                onAction={() => setSortOrder("priority-asc")}
                icon={Icon.ArrowUp}
              />
              <Action
                title={t("sortActions.sortByPriorityLowToHigh")}
                onAction={() => setSortOrder("priority-desc")}
                icon={Icon.ArrowDown}
              />
            </ActionPanel.Section>

            <ActionPanel.Section title={t("sortActions.sortBySeverity")}>
              <Action
                title={t("sortActions.sortBySeverityHighToLow")}
                onAction={() => setSortOrder("severity-asc")}
                icon={Icon.ArrowUp}
              />
              <Action
                title={t("sortActions.sortBySeverityLowToHigh")}
                onAction={() => setSortOrder("severity-desc")}
                icon={Icon.ArrowDown}
              />
            </ActionPanel.Section>

            <ActionPanel.Section title={t("sortActions.sortByStatus")}>
              <Action
                title={t("sortActions.sortByStatusActiveFirst")}
                onAction={() => setSortOrder("status-asc")}
                icon={Icon.ArrowUp}
              />
              <Action
                title={t("sortActions.sortByStatusCompletedFirst")}
                onAction={() => setSortOrder("status-desc")}
                icon={Icon.ArrowDown}
              />
            </ActionPanel.Section>

            <ActionPanel.Section title={t("sortActions.sortByName")}>
              <Action title={t("sortActions.sortByName")} onAction={() => setSortOrder("name")} icon={Icon.Text} />
            </ActionPanel.Section>

            <ActionPanel.Section title={t("sortActions.resetSort")}>
              <Action title={t("sortActions.resetSort")} onAction={() => setSortOrder("none")} icon={Icon.Minus} />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    );
  };

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={t("bugList.searchPlaceholder")}
      filtering={false}
      navigationTitle={t("bugList.myBugs")}
      onSearchTextChange={setSearchQuery}
      searchText={searchQuery}
      searchBarAccessory={
        <List.Dropdown
          tooltip={t("bugList.filterByProduct")}
          value={selectedProduct}
          onChange={(newValue) => {
            setSelectedProduct(newValue);
          }}
        >
          <List.Dropdown.Item title={`${t("bugList.allProducts")} (${bugs.length})`} value="all" />
          {productList.map((product) => {
            return (
              <List.Dropdown.Item
                key={product.name}
                title={`${slice(product.name, 14)} ( ${product.count} )`}
                value={product.name}
              />
            );
          })}
        </List.Dropdown>
      }
    >
      {pinnedBugs.length === 0 && unpinnedBugs.length === 0 ? (
        <List.EmptyView
          title={t("bugList.noBugsTitle")}
          description={t("bugList.noBugsDescription")}
          actions={
            <ActionPanel>
              <Action title={t("general.refresh")} onAction={fetchBugs} icon={Icon.ArrowClockwise} />
              <SessionRefreshAction onRefreshSuccess={handleRefreshSession} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {pinnedBugs.length > 0 && (
            <List.Section title={t("general.pinned")}>
              {pinnedBugs.map((bug) => {
                const isOverdue =
                  bug.status === BugStatus.ACTIVE &&
                  bug.deadline &&
                  !(dayjs(bug.deadline).format("MM DD") === dayjs().format("MM DD")) &&
                  dayjs(bug.deadline).year(dayjs().year()).isBefore(dayjs());

                return renderBugItem(bug, isOverdue);
              })}
            </List.Section>
          )}
          <List.Section title={pinnedBugs.length > 0 ? t("bugList.myBugs") : undefined}>
            {unpinnedBugs.map((bug) => {
              const isOverdue =
                bug.status === BugStatus.ACTIVE &&
                bug.deadline &&
                !(dayjs(bug.deadline).format("MM DD") === dayjs().format("MM DD")) &&
                dayjs(bug.deadline).year(dayjs().year()).isBefore(dayjs());

              return renderBugItem(bug, isOverdue);
            })}
          </List.Section>
        </>
      )}
    </List>
  );
}
