import { Action, ActionPanel, Detail, getPreferenceValues, Icon, showToast, Toast } from "@raycast/api";
import { useEffect, useMemo, useState } from "react";

import { getBugSeverityColor, getBugSeverityLabel } from "../constants/bugSeverity";
import { getBugStatusColor, getBugStatusLabel } from "../constants/bugStatus";
import { getBugTypeColor, getBugTypeLabel } from "../constants/bugType";
import { getPriorityColor, getPriorityLabel } from "../constants/priority";
import { useT } from "../hooks/useT";
import { BugDetail as BugDetailType, BugListItem } from "../types/bug";
import { fetchBugDetail } from "../utils/bugService";
import { logger } from "../utils/logger";
import { SessionRefreshAction } from "./SessionRefreshAction";

interface BugDetailProps {
  bug: BugListItem;
}

export function BugDetail({ bug: { id } }: BugDetailProps) {
  const preferences = getPreferenceValues<Preferences>();
  const { t } = useT();

  const [bugDetail, setBugDetail] = useState<BugDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);

  /** 使用 useMemo 检查Bug详情中是否包含图片，避免不必要的重新计算 */
  const hasImages = useMemo(() => {
    if (!bugDetail) return true;

    const hasStepsImages = bugDetail.stepsImages && bugDetail.stepsImages.length > 0;
    const hasResultImages = bugDetail.resultImages && bugDetail.resultImages.length > 0;
    const hasExpectedImages = bugDetail.expectedImages && bugDetail.expectedImages.length > 0;

    return hasStepsImages || hasResultImages || hasExpectedImages;
  }, [bugDetail]);

  /** 监听图片状态变化，自动设置元数据显示状态 */
  useEffect(() => {
    setShowMetadata(!hasImages);
  }, [hasImages]);

  /** 获取Bug详细信息 */
  const loadBugDetail = async () => {
    try {
      setIsLoading(true);

      showToast({
        style: Toast.Style.Animated,
        title: t("bugDetails.loadingBugDetail"),
        message: t("bugDetails.pleaseWait"),
      });

      const detailedBug = await fetchBugDetail(id);
      setBugDetail(detailedBug);

      showToast({
        style: Toast.Style.Success,
        title: t("bugDetails.loadBugDetailSuccess"),
        message: t("bugDetails.bugDetailLoaded"),
      });
    } catch (error) {
      logger.error("Error loading bug detail:", error instanceof Error ? error : String(error));
      showToast({
        style: Toast.Style.Failure,
        title: t("bugDetails.loadBugDetailFailed"),
        message: error instanceof Error ? error.message : t("errors.unknownError"),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 组件加载时获取Bug详情
  useEffect(() => {
    loadBugDetail();
  }, [id]);

  // 如果正在加载或bug详情为空，显示加载提示
  const markdown =
    isLoading || !bugDetail
      ? `# ${t("general.loading")}\n\n${t("bugDetails.pleaseWait")}`
      : /* md */ `
# ${bugDetail.title}

${`
## ${t("bugDetails.reproductionSteps")}

${
  bugDetail.steps || (bugDetail.stepsImages && bugDetail.stepsImages.length > 0)
    ? `
### ${t("bugDetails.steps")}
${bugDetail.steps ? bugDetail.steps : ""}

${
  bugDetail.stepsImages && bugDetail.stepsImages.length > 0
    ? bugDetail.stepsImages.map((img) => `![${t("bugDetails.stepsImage")}](${img})`).join("\n\n")
    : ""
}
`
    : ""
}

${
  bugDetail.result || (bugDetail.resultImages && bugDetail.resultImages.length > 0)
    ? `
### ${t("bugDetails.result")}
${bugDetail.result ? bugDetail.result : ""}

${
  bugDetail.resultImages && bugDetail.resultImages.length > 0
    ? bugDetail.resultImages.map((img) => `![${t("bugDetails.resultImage")}](${img})`).join("\n\n")
    : ""
}
`
    : ""
}

${
  bugDetail.expected || (bugDetail.expectedImages && bugDetail.expectedImages.length > 0)
    ? `
### ${t("bugDetails.expected")}
${bugDetail.expected ? bugDetail.expected : ""}

${
  bugDetail.expectedImages && bugDetail.expectedImages.length > 0
    ? bugDetail.expectedImages.map((img) => `![${t("bugDetails.expectedImage")}](${img})`).join("\n\n")
    : ""
}
`
    : ""
}
`}

${
  bugDetail.os || bugDetail.browser
    ? `
## ${t("bugDetails.environmentInfo")}

**${t("bugDetails.operatingSystem")}:** ${bugDetail.os || t("bugDetails.notSet")}  
**${t("bugDetails.browser")}:** ${bugDetail.browser || t("bugDetails.notSet")}
`
    : ""
}

${
  bugDetail.keywords || bugDetail.mailto || bugDetail.notifyEmail
    ? `
## ${t("bugDetails.otherInfo")}

${bugDetail.keywords ? `**${t("bugDetails.keywords")}:** ${bugDetail.keywords}  ` : ""}
${bugDetail.mailto ? `**${t("bugDetails.mailTo")}:** ${bugDetail.mailto}  ` : ""}
${bugDetail.notifyEmail ? `**${t("bugDetails.notifyEmail")}:** ${bugDetail.notifyEmail}  ` : ""}
`
    : ""
}
`;

  return (
    <Detail
      isLoading={isLoading}
      markdown={markdown}
      navigationTitle={`${t("bugDetails.bugTitle")} #${id}`}
      metadata={
        showMetadata ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title={t("bugDetails.bugId")} text={bugDetail?.id} />

            <Detail.Metadata.Separator />

            <Detail.Metadata.TagList title={t("bugDetails.currentStatus")}>
              <Detail.Metadata.TagList.Item
                text={bugDetail ? getBugStatusLabel(bugDetail.status) : t("general.loading")}
                color={bugDetail ? getBugStatusColor(bugDetail.status) : undefined}
              />
            </Detail.Metadata.TagList>

            {bugDetail && (
              <>
                <Detail.Metadata.TagList title={t("bugDetails.severity")}>
                  <Detail.Metadata.TagList.Item
                    text={`${getBugSeverityLabel(bugDetail.severity)}(${bugDetail.severity})`}
                    color={getBugSeverityColor(bugDetail.severity)}
                  />
                </Detail.Metadata.TagList>

                <Detail.Metadata.TagList title={t("bugDetails.priority")}>
                  <Detail.Metadata.TagList.Item
                    text={`${getPriorityLabel(bugDetail.priority)}(${bugDetail.priority})`}
                    color={getPriorityColor(bugDetail.priority)}
                  />
                </Detail.Metadata.TagList>

                <Detail.Metadata.TagList title={t("bugDetails.bugType")}>
                  <Detail.Metadata.TagList.Item
                    text={getBugTypeLabel(bugDetail.type)}
                    color={getBugTypeColor(bugDetail.type)}
                  />
                </Detail.Metadata.TagList>
              </>
            )}

            <Detail.Metadata.Separator />

            <Detail.Metadata.Label
              title={t("bugDetails.product")}
              text={bugDetail?.product || t("errors.unknownError")}
            />

            {bugDetail?.assignedTo && (
              <>
                <Detail.Metadata.Label title={t("bugDetails.assignedTo")} text={bugDetail.assignedTo} />
                <Detail.Metadata.Separator />
              </>
            )}

            {bugDetail?.deadline && (
              <>
                <Detail.Metadata.Label title={t("bugDetails.deadline")} text={bugDetail.deadline} />
                <Detail.Metadata.Separator />
              </>
            )}

            <Detail.Metadata.Link
              title={t("bugDetails.openInZentao")}
              target={`${preferences.zentaoUrl}/bug-view-${id}.html`}
              text={t("bugDetails.viewBugDetails")}
            />
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title={t("bugDetails.openInZentao")}
            url={`${preferences.zentaoUrl}/bug-view-${id}.html`}
            icon={Icon.Globe}
          />
          <Action
            title={showMetadata ? t("bugDetails.hideMetadata") : t("bugDetails.showMetadata")}
            onAction={() => setShowMetadata(!showMetadata)}
            icon={showMetadata ? Icon.EyeDisabled : Icon.Eye}
          />
          <SessionRefreshAction />
          <ActionPanel.Section title={t("bugDetails.copyInfo")}>
            <Action.CopyToClipboard title={t("bugDetails.copyBugId")} content={id} icon={Icon.Clipboard} />
            <Action.CopyToClipboard
              title={t("bugDetails.copyBugUrl")}
              content={`${preferences.zentaoUrl}/bug-view-${id}.html`}
              icon={Icon.Link}
            />
            {bugDetail && (
              <Action.CopyToClipboard
                title={t("bugDetails.copyBugTitle")}
                content={bugDetail?.title}
                icon={Icon.Text}
              />
            )}
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
