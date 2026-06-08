import { createHash } from "crypto";

/**
 * Generate a Gravatar URL from an email address.
 * Uses MD5 hash as per Gravatar spec.
 * Falls back to "identicon" pattern if no Gravatar is set.
 *
 * @see https://docs.gravatar.com/general/images/
 */
export const getGravatarUrl = (email: string, size = 128): string => {
  const hash = createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
};

/**
 * Extract email address from "Name <email>" or "Name <email…>" format.
 * Note: Spark CLI truncates long addresses with "…", so the result may be
 * incomplete (e.g. "user@gm" instead of "user@gmail.com").
 */
export const extractEmail = (raw: string): string => {
  const match = raw.match(/<(.+?)>?…?$/);
  return match ? match[1].replace(/…$/, "").trim() : raw.trim();
};
