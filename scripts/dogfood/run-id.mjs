// MIT License — see LICENSE
//
// IN-01: a run-id value is joined unvalidated into a filesystem path
// (`join(resolveRunsRoot(), runId)` in both dogfood-run.mjs and
// dogfood-wrapup.mjs) — reject anything that looks like an
// accidentally-swallowed flag token (a missing value silently
// consuming the NEXT flag, e.g. `--run-id --corpus-root`, or an
// omitted positional run-id letting the next flag land in its own
// slot) or that could escape the runs root once joined (a leading
// "..", or an embedded "/"/"\\" path separator).
//
// Health Report CUT-01: this guard used to be duplicated verbatim
// (same condition, same character-class checks) in both
// dogfood-run.mjs and dogfood-wrapup.mjs, and the two copies had
// already drifted on error-message text. Extracted here so a future
// validation-rule change (e.g. a length cap, rejecting NUL bytes)
// can never land in only one CLI. The message text below is the
// more-informative `--run-id`-flag-shaped form used by both callers —
// still correct for dogfood-wrapup.mjs's positional-arg caller since
// the guard body itself is call-convention-agnostic.
export function assertSafeRunId(runId) {
  if (runId.startsWith("--") || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw new Error(
      `invalid --run-id value "${runId}": must not start with "--" or contain a path separator`,
    );
  }
}
