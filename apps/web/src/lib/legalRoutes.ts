/**
 * Path constants for the standalone legal pages. They are real URLs (not the
 * in-app tab state) so they work without a session and survive a reload: the
 * API's SPA fallback serves index.html for them, and App.tsx renders the
 * matching page before the login gate. Linked via plain anchors → a full
 * navigation is fine for legal pages and keeps the router-less app simple.
 */
export const LEGAL_ROUTES = {
  impressum: '/impressum',
  datenschutz: '/datenschutz',
} as const;

export type LegalDoc = keyof typeof LEGAL_ROUTES;

/** Resolve a pathname to its legal document, or null if it is not a legal route. */
export function legalDocForPath(pathname: string): LegalDoc | null {
  const entry = Object.entries(LEGAL_ROUTES).find(([, path]) => path === pathname);
  return entry ? (entry[0] as LegalDoc) : null;
}
