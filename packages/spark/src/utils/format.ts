/**
 * Extract display name from "Name <email>" or "Name <email…>" format.
 * Falls back to the raw string if no name is found.
 */
export const extractName = (raw: string): string => {
  const m = raw.match(/^(.*?)\s*<.+>?…?$/);
  return m ? m[1].trim() : raw;
};
