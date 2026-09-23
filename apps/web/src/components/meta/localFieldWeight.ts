// Shared local-field-weight helper. Kept out of PredictionPanel.tsx so that
// component file exports only components (react-refresh/only-export-components,
// same precedent as metaWindow.ts).

/** Round a share to a readable seed weight (min 1 so nothing drops to zero).
 *  Used by `PredictionPanel.tsx` (the user-facing weight editor) and
 *  `ArchetypeRecommendationPanel.tsx` (deriving the same default weight for
 *  the `localField` it sends to the archetype-synthesis endpoint, Spec 10
 *  Slice D, specs/archetype-meta-analysis.md) so both stay in sync without
 *  duplicating the arithmetic. */
export const seedWeight = (sharePct: number): number => Math.max(1, Math.round(sharePct));
