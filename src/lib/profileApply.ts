// Applying a saved equipment profile (Motor / Battery / Controller) to a
// calculator's inputs is best-effort: a profile only has to define the fields
// its owner cares about, so a calculator pulls whatever it can and leaves the
// rest alone. `trackApply` records which calculator inputs were left unset for
// that reason, so the profile pickers can tell the user (via ProfileApplyNote)
// instead of a partial load silently doing nothing.

export interface ProfileApplyResult {
  /** Human-readable names of calculator inputs that were NOT populated because
   *  the profile has no value for the field(s) they are pulled from. */
  skipped: string[];
}

export function trackApply() {
  const skipped: string[] = [];
  return {
    /** Populate `label`'s input via `apply` when `value` is present; otherwise
     *  record `label` as skipped. */
    set<T>(label: string, value: T | null | undefined, apply: (v: T) => void): void {
      if (value != null) apply(value);
      else skipped.push(label);
    },
    /** Record a calculator input as skipped when it can't be expressed as a
     *  single `value` test (e.g. it's derived from two profile fields, or from
     *  a field whose value is present but unusable here). */
    miss(label: string): void {
      skipped.push(label);
    },
    result(): ProfileApplyResult {
      return { skipped };
    },
  };
}
