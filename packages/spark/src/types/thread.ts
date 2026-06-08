/** A single message parsed from a Spark thread */
export interface ThreadMessage {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}
