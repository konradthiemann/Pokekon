// Shared meta-window constants. Kept out of MetaWindowControl.tsx so that the
// component file exports only components (react-refresh/only-export-components).

/** Day-window presets offered in the Meta tab. All within the API's 1–180 bound. */
export const DAY_PRESETS = [7, 14, 30, 60] as const;

/** Default window — a Bo1-online sample needs a few weeks to be stable. */
export const META_DEFAULT_DAYS = 30;
