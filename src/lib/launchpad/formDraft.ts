import { DEX_VENUES, LAUNCHPAD_ARCHETYPES } from "./constants";

import type { LaunchpadFormState } from "./types";

/** Session-only, so a reload keeps the wizard but a new browser session starts clean. */
const DRAFT_KEY = "shaggy-launchpad-form-draft";

const ALLOWED: Partial<Record<keyof LaunchpadFormState, readonly string[]>> = {
  selectedArchetype: LAUNCHPAD_ARCHETYPES.map((archetype) => archetype.id),
  selectedDex: DEX_VENUES.map((venue) => venue.id),
  pairAsset: ["ETH", "USDC"],
  executionMode: ["metamask", "deployer_worker"],
};

/**
 * Restores the wizard draft over `defaults`. A field is kept only if it has the default's type and,
 * for choice fields, a value the wizard still offers; anything else falls back to the default.
 */
export function loadFormDraft(defaults: LaunchpadFormState): LaunchpadFormState {
  let saved: unknown;
  try {
    saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");
  } catch {
    return defaults;
  }
  if (!saved || typeof saved !== "object") return defaults;
  const draft = { ...defaults } as Record<string, unknown>;
  for (const key of Object.keys(defaults) as Array<keyof LaunchpadFormState>) {
    const value = (saved as Record<string, unknown>)[key];
    if (typeof value !== typeof defaults[key]) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    const allowed = ALLOWED[key];
    if (allowed && !allowed.includes(value as string)) continue;
    draft[key] = value;
  }
  return draft as unknown as LaunchpadFormState;
}

export function saveFormDraft(form: LaunchpadFormState): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* storage full or blocked: the wizard still works, it just won't survive a reload */
  }
}

/** Called after a successful launch, so a reload cannot set up the same launch again. */
export function clearFormDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
