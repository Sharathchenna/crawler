/** Suggested shelf only shows links from this window. */
export const SUGGESTED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function suggestedSince(now = Date.now()): number {
  return now - SUGGESTED_WINDOW_MS;
}
