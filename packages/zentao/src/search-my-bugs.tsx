import { Action, ActionPanel, Icon, List, showToast, Toast } from "@raycast/api";
import { useCachedState } from "@raycast/utils";
import dayjs from "dayjs";
import { Effect } from "effect";
import { CircularBuffer } from "mnemonist";
import { alphabetical, sift, unique } from "radash";
import { useEffect, useMemo, useState } from "react";

import { BugListItem as BugListItemComponent } from "@/components/BugListItem";
import { SessionRefreshAction } from "@/components/SessionRefreshAction";
import { CACHE_KEYS } from "@/constants/key";
import { useT } from "@/hooks/useT";
import { fetchBugsFromZentao } from "@/service/bugService";
import { BugListItem, BugStatus } from "@/types/bug";
import { SortOrder } from "@/types/sortOrder";
import { withAutoRetry } from "@/utils/autoRetry";
import { searchBugs } from "@/utils/fuseSearch";

export default function Command() {
  const { t } = useT();

  const [bugs, setBugs] = useCachedState<BugListItem[]>(CACHE_KEYS.BUGS, []);

  const [isLoading, setIsLoading] = useState(false);
  const [sortOrder, setSortOrder] = useCachedState<SortOrder>(CACHE_KEYS.BUG_SORT_ORDER, "name");

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
      <BugListItemComponent
        key={bug.id}
        bug={bug}
        isOverdue={isOverdue}
        isPinned={isPinned}
        onTogglePin={togglePinBug}
        onSortOrderChange={setSortOrder}
        onRefreshSession={handleRefreshSession}
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
                title={`${product.name} ( ${product.count} )`}
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
