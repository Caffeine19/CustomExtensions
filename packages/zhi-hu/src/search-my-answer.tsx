import { ActionPanel, Action, Icon, List, getPreferenceValues, showToast, Toast, Color } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import dayjs from "dayjs";
import { runPromise } from "effect/Effect";
import { sort } from "radash";
import { useState } from "react";
import { ZhihuAnswer } from "./types/answer";
import { buildAnswerUrl, fetchMyAnswers } from "./utils/zhihu-api";

function AnswerListItem({
  answer,
  isShowingDetail,
  onToggleDetail,
}: {
  answer: ZhihuAnswer;
  isShowingDetail: boolean;
  onToggleDetail: () => void;
}) {
  const answerUrl = buildAnswerUrl(answer.question.id, answer.id);
  const createdAt = dayjs.unix(answer.created_time).format("YYYY/MM/DD");

  return (
    <List.Item
      key={answer.id}
      icon={{ source: Icon.Message, tintColor: Color.Blue }}
      title={answer.question.title}
      subtitle={isShowingDetail ? undefined : answer.excerpt}
      detail={<List.Item.Detail markdown={answer.excerpt} />}
      accessories={
        isShowingDetail
          ? []
          : [
              {
                icon: { source: Icon.Bubble, tintColor: Color.SecondaryText },
                text: String(answer.comment_count),
                tooltip: "评论数",
              },
              {
                icon: { source: Icon.Heart, tintColor: Color.Red },
                text: String(answer.reaction.statistics.like_count),
                tooltip: "喜欢数",
              },
              { icon: { source: Icon.Calendar, tintColor: Color.SecondaryText }, text: createdAt, tooltip: "发布时间" },
            ]
      }
      actions={
        <ActionPanel>
          <Action.OpenInBrowser title="Open in Browser" url={answerUrl} />
          <Action title="Toggle Detail" icon={Icon.AppWindowSidebarLeft} onAction={onToggleDetail} />
          <Action.CopyToClipboard title="Copy Link" content={answerUrl} />
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const { urlToken, cookie } = getPreferenceValues();
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  const { data, isLoading } = usePromise(
    async () => {
      const response = await runPromise(fetchMyAnswers({ urlToken, cookie }));
      return sort(response.data, (a) => a.created_time, true);
    },
    [],
    {
      onError: async (error) => {
        await showToast({ style: Toast.Style.Failure, title: "Failed to fetch answers", message: String(error) });
      },
    },
  );

  const answers: ZhihuAnswer[] = data ?? [];

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter answers by title..." isShowingDetail={isShowingDetail}>
      {answers.map((answer) => (
        <AnswerListItem
          key={answer.id}
          answer={answer}
          isShowingDetail={isShowingDetail}
          onToggleDetail={() => setIsShowingDetail((prev) => !prev)}
        />
      ))}
    </List>
  );
}
