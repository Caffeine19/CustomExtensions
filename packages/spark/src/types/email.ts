/** Represents an email message from Spark CLI */
export interface SparkEmail {
  id: string;

  account: string;

  subject: string;

  from: string;
  fromEmail: string;

  to: string[];

  date: string;

  snippet: string;

  // flags (activity markers from Flags column)
  isRead: boolean;
  isPinned: boolean;
  isReplied: boolean;
  hasAttachment: boolean;

  // folder location (only one is true at a time)
  inInbox: boolean;
  inSent: boolean;
  inDrafts: boolean;
  inArchive: boolean;
  inTrash: boolean;
  inSpam: boolean;
  inStarred: boolean;
  inLater: boolean;
  inBlocked: boolean;
}
