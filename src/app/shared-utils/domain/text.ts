/**
 * Create a URL-safe key from a name. Removes spaces, ampersands, and hyphens,
 * then lowercases. Used for both playlist keys and genre keys.
 *
 * Examples:
 *   "Rock & Roll" -> "rockroll"
 *   "Hip-Hop Classics" -> "hiphopclassics"
 */
export function createKey(name: string): string {
  return name?.replace(/[\s&-]/g, '').toLowerCase() || '';
}

/** Cleans up escaped/encoded text coming back from an API for safe HTML display. */
export function normalizeTextForHTML(str: string): string {
  if (!str) {
    return 'Unknown string';
  }
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .replace(/\\/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
