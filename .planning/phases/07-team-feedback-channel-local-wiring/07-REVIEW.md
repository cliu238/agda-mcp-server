---
phase: 07-team-feedback-channel-local-wiring
reviewed: 2026-07-04T16:42:53Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - scripts/team/issue-key.mjs
  - scripts/team/ingest-server.mjs
  - scripts/team/archive-extract.mjs
  - scripts/team/cron-ingest-wrapup.mjs
  - scripts/dogfood/agent-log-selection.mjs
  - scripts/dogfood/upload-run.mjs
  - scripts/dogfood/dogfood-run.mjs
  - scripts/dogfood/dogfood-wrapup.mjs
  - scripts/dogfood/transcript-writer.mjs
  - test/fixtures/dogfood-fake-mcp-child.mjs
  - test/fixtures/fix-queue.json
  - test/unit/fixtures/fix-queue.test.ts
  - test/unit/tools/team-issue-key.test.ts
  - test/unit/tools/team-ingest-server.test.ts
  - test/unit/tools/team-archive-extract.test.ts
  - test/unit/tools/team-cron-ingest-wrapup.test.ts
  - test/unit/tools/dogfood-agent-log-selection.test.ts
  - test/unit/tools/dogfood-upload-run.test.ts
  - test/unit/tools/dogfood-run-report-checkpoint.test.ts
  - test/unit/tools/dogfood-transcript-writer.test.ts
  - test/unit/tools/dogfood-wrapup-nonfinalized-report.test.ts
  - test/unit/tools/dogfood-wrapup-upload-chain.test.ts
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-07-04T16:42:53Z
**Depth:** standard (with targeted cross-file tracing into `src/repo-root.ts`, `src/session/safe-source-io.ts`, `scripts/queue/intake.mjs`, `scripts/dogfood/task-manifest.mjs`, `scripts/dogfood/flake-classify.mjs`, `test/helpers/mcp-harness.ts`, `test/fixtures/fix-queue.ts`/`fuel-corpora.ts`, `scripts/promote-capture.mjs` — required to verify the security claims made in the reviewed files' own comments)
**Files Reviewed:** 20 (9 scripts + 1 test fixture + 1 data fixture + 9 test files)
**Status:** issues_found

## Summary

This phase wires up the team feedback channel end to end: a Bearer-key registry (`issue-key.mjs`), a loopback HTTP ingest endpoint (`ingest-server.mjs`), a two-layer sandboxed archive extractor (`archive-extract.mjs`), an unattended cron judge that drives the existing oracle triad and writes back to git (`cron-ingest-wrapup.mjs`), a fail-open upload client with a bounded retry queue (`upload-run.mjs`), and mid-phase SIGKILL-safe checkpointing for the dogfooding proxy (`dogfood-run.mjs`, `dogfood-wrapup.mjs`).

The key-registry and ingest-server auth/size-cap/path-sandboxing mechanics are well built: timing-safe Bearer comparison, hash-only key storage, two independent path-containment layers for both storage paths and archive extraction, and a streamed byte-cap that never fully buffers a request body. Those pieces hold up under adversarial reading.

The real problems are downstream of "the archive extracted safely": nothing in this phase validates the *content* of an uploaded capture artifact before it is trusted by the oracle-triad pipeline and, critically, before it is used as the **upsert key** for the git-tracked fix queue that the new unattended cron judge auto-commits and (by default) auto-pushes with zero human review. That gap produces a genuine, provable BLOCKER (CR-01): any holder of a valid team upload key can overwrite/reopen an existing, previously-locked fix-queue entry. A second BLOCKER (CR-02) is a straightforward missing-catch bug that lets a single malformed upload cause unbounded, permanent re-processing on every cron tick — provably contradicting the function's own documented "never retried forever" contract. Several further WARNINGs cover a dangling-reference data-integrity bug the project's own committed fix-queue data already shows had to be hand-patched once, a TOCTOU race in the retry queue, an extraction sandbox gap around tar hard links, an entry-count decompression-bomb gap, an inconsistent path-normalization bug that silently drops Codex logs, and an incomplete orphan-process kill path in the dogfooding proxy.

## Critical Issues

### CR-01: Any valid team upload key can overwrite/reopen an existing fix-queue entry via a colliding `dedup.fingerprint`, auto-committed and auto-pushed with zero human review

**File:** `scripts/dogfood/dogfood-wrapup.mjs:100-157` (`buildQueueEntryFromVerdict`), consumed by `scripts/team/cron-ingest-wrapup.mjs:158-284` (`processArchive`) and `scripts/team/cron-ingest-wrapup.mjs:302-332` (`writeBackQueue`)

**Issue:**
`ingest-server.mjs` never validates the *contents* of an uploaded archive (by design — extraction is deferred to the cron judge), and `archive-extract.mjs` only validates *paths* inside the archive, never the JSON *content* of the capture artifacts it exposes. `cron-ingest-wrapup.mjs`'s `processArchive` reads `report.stagedCaptures[].stagedPath`-derived artifact JSON straight from the extracted, fully attacker-controlled archive (`cron-ingest-wrapup.mjs:230`) and hands it to `wrapUpCapture` with no schema validation of `artifact` at all.

`wrapUpCapture` (`dogfood-wrapup.mjs:216-269`) calls the real oracle (`runOracle`) to get a verdict, which is a genuine, non-forgeable signal *that something is wrong* (e.g. `orcl02.kind === "cheat-flagged"` is trivially reachable by simply including an actual unsanctioned `postulate` in the uploaded proof — that requires no special access, any team member can do it in five minutes). Once `shouldFile` is true, `buildQueueEntryFromVerdict` (`dogfood-wrapup.mjs:133`) builds the queue entry with:

```js
fingerprint: artifact.dedup.fingerprint,
```

`artifact.dedup.fingerprint` is taken **verbatim from the attacker-supplied JSON** — there is no format constraint anywhere (`fixQueueEntrySchema.fingerprint` is only `z.string().min(1)`) and no re-derivation/verification against the actual captured session content. This value becomes the **upsert key** passed to `upsertQueueEntry` (`scripts/queue/intake.mjs:66-93`, imported and called unchanged at `dogfood-wrapup.mjs:267` and `cron-ingest-wrapup.mjs:161`/`254`), whose update path does:

```js
const candidate = existingIndex === -1 ? entryData : {
  ...existing[existingIndex],
  ...entryData,
  recurrence: bumpRecurrence ? existing[existingIndex].recurrence + 1 : existing[existingIndex].recurrence,
};
```

`entryData` (from `buildQueueEntryFromVerdict`) unconditionally includes `status: "new"`, `closedAt: null`, `matrixEntryId: null`, plus attacker-influenced `title`, `affectedTool`, `capturePath`, `verdictPath`, `triageClass`/`triageConfidence` (read straight from `artifact.triage?.category`/`artifact.triage?.confidence` with no enum pre-check — a bad value here is only caught by `fixQueueEntrySchema.parse` throwing, which is a fail-safe, but a *valid* enum value is happily accepted and merged).

Every fingerprint value that has ever been filed is **publicly visible** in the repo's own tracked `test/fixtures/fix-queue.json` (this very file is in this review's scope — e.g. the locked flagship entry `"e6f0c1169032b9d5"`, `test/fixtures/fix-queue.json:3`). Any team member who has been issued a legitimate upload key — or anyone who obtains/steals one — can therefore:

1. Craft a proof session containing a deliberate unsanctioned postulate (guarantees `orcl02.kind === "cheat-flagged"`, skipping the flake gate entirely per `dogfood-wrapup.mjs:232-236`).
2. Set that capture artifact's `dedup.fingerprint` to `"e6f0c1169032b9d5"` (or any other known fingerprint, including locked/closed ones).
3. Upload it through the normal, fully-authenticated `/ingest` endpoint.
4. Wait for the cron judge to process it.

The result: `upsertQueueEntry` finds the existing **locked** flagship entry, merges in `status: "new"`, `closedAt: null`, `matrixEntryId: null`, and attacker/oracle-derived `title`/`affectedTool`/`capturePath`/`verdictPath` — silently reopening/corrupting a resolved defect record. `fixQueueEntrySchema`'s `superRefine` does **not** forbid this transition (it only forbids `locked`/`rejected` with `closedAt: null`, which is satisfied here since the merged `status` is `"new"`). `writeBackQueue` (`cron-ingest-wrapup.mjs:302-332`) then unconditionally `git commit`s and (absent `--no-push`) `git push`es this corrupted state directly to the branch — **no PR, no human review, by design (D-01/D-02)**.

This is precisely the "could a malicious archive influence WHAT gets committed" scenario this review was asked to check: the *scope* of `git add` is correctly bounded to the one queue file, but the *content* written into that file is not defended at all.

**Fix:**
Do not trust an archive-supplied fingerprint as an update key without validation. At minimum:

```js
// buildQueueEntryFromVerdict (dogfood-wrapup.mjs) — never trust an
// archive-supplied fingerprint verbatim for the UPDATE path; only a
// freshly-computed, oracle-independent fingerprint may match an
// existing row.
const fingerprint = recomputeFingerprint(artifact); // same derivation
// the server used when the capture was first recorded — never read
// `artifact.dedup.fingerprint` as if it were trustworthy input.
```

And/or add a guard at the call sites in `cron-ingest-wrapup.mjs`/`dogfood-wrapup.mjs` (or in `upsertQueueEntry` itself) that refuses an automated, unattended write-back from silently regressing a `locked`/`rejected` entry back to `new`, or clearing `matrixEntryId`/`closedAt` — that specific transition class should require a human-reviewed path (e.g. route a fingerprint collision against a terminal-status entry to the same non-schema side channel `appendFlakyLog` uses, with a loud warning, rather than an automatic overwrite).

---

### CR-02: A malformed `run-report.json` inside an otherwise valid archive is never marked processed, causing the same archive to be re-extracted and re-judged on every cron tick forever

**File:** `scripts/team/cron-ingest-wrapup.mjs:172-284` (`processArchive`)

**Issue:**
`processArchive`'s core logic is wrapped in `try { ... } finally { extracted.cleanup(); }` — **there is no `catch` clause**:

```js
try {
  const runsDir = join(extracted.scratchDir, "runs");
  const runIds = existsSync(runsDir) ? readdirSync(runsDir) : [];
  if (runIds.length !== 1) { ...write .processed.json...; return {...}; }

  const [runId] = runIds;
  const reportPath = join(runsDir, runId, "run-report.json");
  const report = JSON.parse(readFileSync(reportPath, "utf8"));   // <-- line 189, unguarded
  ...
  await writeFileAtomic(`${archivePath}.processed.json`, ...);   // only reached on the happy path
  return { archivePath, runId, results };
} finally {
  extracted.cleanup();
}
```

If `run-report.json` is missing (e.g. the single entry under `runs/` is not actually a directory, or lacks the file) or is not valid JSON, `readFileSync`/`JSON.parse` throws. That exception propagates out of `processArchive` entirely — `scriptMain`'s own per-archive `try/catch` (`cron-ingest-wrapup.mjs:450-464`) does catch it so the cron *run* doesn't crash, but **no `.processed.json` sidecar is ever written for this archive**, because every write of that marker sits either before this line (extraction failure, wrong run count) or after it (success, unresolvable-policy-key) — none of them execute once this specific `throw` fires.

`discoverUnprocessedArchives` (`cron-ingest-wrapup.mjs:91-116`) treats "no `.processed.json` sidecar" as "not yet processed." The result: **this exact archive is rediscovered and fully re-extracted (full sandboxed `tar -x`, mid-extraction polling, post-extraction realpath walk) on every single subsequent cron tick, forever** — a trivially-triggerable, permanent, unbounded resource drain from a single malformed upload. This directly contradicts the function's own documented contract at `cron-ingest-wrapup.mjs:144-150`: *"a `.processed.json` sidecar marking the archive done (success OR terminal failure alike, so a permanently-broken archive is never retried forever)."* Any uploader (malicious or merely buggy) triggers this with zero effort — just ship an archive whose `run-report.json` is truncated/corrupt.

**Fix:** Wrap the risky read/parse (and ideally the whole block) so a parse failure is treated as a terminal, marked failure like every sibling branch:

```js
let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  await writeFileAtomic(
    `${archivePath}.processed.json`,
    JSON.stringify(
      { processedAt: new Date().toISOString(), ok: false, reason: "malformed-run-report",
        detail: err instanceof Error ? err.message : String(err) },
      null, 2,
    ),
  );
  return { archivePath, error: "malformed-run-report", results: [] };
}
```

## Warnings

### WR-01: Every cron-auto-filed queue entry gets a `capturePath`/`verdictPath` that is dangling by construction

**File:** `scripts/team/cron-ingest-wrapup.mjs:228, 264` (artifact/result path construction), consumed by `scripts/dogfood/dogfood-wrapup.mjs:151` (`capturePath: artifactPath`)

**Issue:** `artifactPath` passed into `wrapUpFn`/`buildQueueEntryFromVerdict` is `join(extracted.scratchDir, "captures", basename(staged.stagedPath))` — a path inside the **ephemeral** `mkdtemp` scratch directory that `processArchive`'s own `finally` block deletes (`extracted.cleanup()`) before `processArchive` even returns to its caller. Every fix-queue entry the cron path files therefore persists a `capturePath`/`verdictPath` pointing at a directory that is already gone by the time anyone reads the queue. This is not hypothetical: the project's own seed data documents exactly this happening and being hand-patched — `test/fixtures/fix-queue.json`, fingerprint `2eb1768df88bfb07`'s notes state verbatim: *"The cron-ingest-wrapup.mjs --no-push re-judging pass's own capturePath/verdictPath pointed at its transient per-run extraction sandbox (deleted by extracted.cleanup() immediately after judging, per scripts/team/cron-ingest-wrapup.mjs's own design) -- corrected here to the STABLE, permanent uploader-side path..."* — i.e. a maintainer already had to manually fix this once; the code itself still reproduces the defect on every future run.

**Fix:** Persist a stable reference instead of the scratch path — e.g. the archive's own on-disk location plus the in-archive relative path (`{archivePath}::captures/<basename>`), or defer writing `capturePath`/`verdictPath` until a maintainer resolves them from the archive during triage, rather than a path guaranteed to be unlinked by the time it is read.

### WR-02: `writeBackQueue` reports `committed: false` even when the commit actually succeeded and only the push failed

**File:** `scripts/team/cron-ingest-wrapup.mjs:316-331`

**Issue:**
```js
try {
  execFile("git", ["add", relQueuePath], ...);
  execFile("git", ["commit", "-m", ...], ...);
  let pushed = false;
  if (!noPush) {
    execFile("git", ["push"], ...);   // if THIS throws...
    pushed = true;
  }
  return { committed: true, pushed };
} catch (err) {
  return { committed: false, error: ... };   // ...the already-created local commit is misreported as "not committed"
}
```
A `git push` failure (network down, diverged remote, auth issue) is caught by the same block that wraps `add`+`commit`, so the function reports `{ committed: false, ... }` even though `git commit` already succeeded and a real commit now sits in the local repo. The persisted run summary (`.agda-mcp/team/cron-runs/*.json`) and stdout digest therefore understate what happened, and the *next* cron run with new filings will attempt `git commit` again — silently accumulating local commits, or hitting the already-anticipated-but-differently-caused "nothing to commit" error if the queue file didn't change in between.

**Fix:** Track `committed` and `pushed` independently:
```js
let committed = false;
try {
  execFile("git", ["add", relQueuePath], ...);
  execFile("git", ["commit", "-m", ...], ...);
  committed = true;
  if (!noPush) {
    execFile("git", ["push"], ...);
    return { committed: true, pushed: true };
  }
  return { committed: true, pushed: false };
} catch (err) {
  return { committed, error: ... };
}
```

### WR-03: Read-modify-write race in the upload retry queue can silently drop pending entries and violate the documented D-08 bound

**File:** `scripts/dogfood/upload-run.mjs:283-313` (`appendRetryQueueEntry`), `scripts/dogfood/upload-run.mjs:346-379` (`flushRetryQueue`)

**Issue:** Both functions follow the same pattern: `readRetryQueue(queuePath)` (full read), mutate an in-memory array, then `writeRetryQueue(queuePath, ...)` (full atomic rewrite of the whole file). There is no locking or CAS between the read and the write. `chainUploadRun` (`dogfood-wrapup.mjs:362-384`) spawns a fresh `upload-run.mjs <runId>` subprocess per finished run, and a real dogfooding workflow can plausibly have two of these overlapping (two runs judged back-to-back, or a manual `--retry-only` flush racing a live run's own failed-upload append). If two `appendRetryQueueEntry` calls (or an append racing a flush) interleave, the second writer's full-file rewrite clobbers the first writer's queue state — the first entry (and its physically-copied pending archive under `resolvePendingArchiveDir()`) is silently lost from the tracked queue, the archive file is never cleaned up, and it also stops counting against the documented "20 archives / 2 GiB" bound (`resolveRetryMaxCount`/`resolveRetryMaxBytes`), since an orphaned file the queue no longer references can never be evicted by the drop-oldest logic.

**Fix:** Use an exclusive-lock-and-rewrite (e.g. open the queue file with `wx` and retry-on-EEXIST, or serialize all queue mutations through a single in-process mutex plus a file lock for cross-process safety), or switch to a genuinely append-only log format (append one line per mutation, compact periodically) so concurrent writers can never clobber each other's entries.

### WR-04: The pre-extraction tar listing does not surface hard-link targets, so a crafted hard-link entry pointing outside the sandbox is not caught by either extraction-safety layer

**File:** `scripts/team/archive-extract.mjs:210-229` (Step A), `scripts/team/archive-extract.mjs:239-266` (Step C)

**Issue:** Step A lists entries via `tar -tf archivePath` (no `-v`), which prints only each entry's own **name**, not its type or (for a hard-link entry) its link target. The unsafe-entry check (`entry.startsWith("/") || entry.split("/").includes("..")`) can therefore only ever reject based on the *new* link's own name, never the file it is being hard-linked *to*. A crafted archive containing a hard-link-type tar entry whose header `linkname` is an absolute path to a file that already exists on the extracting host (in the maintainer's own repo checkout, say) is not represented in the plain `-tf` listing at all, so Step A cannot see it. Step C's post-extraction check (`resolveExistingPathWithinRoot`) is realpath-based and specifically designed to catch **symlink** escapes; a hard link does not manifest as a symlink resolving outside the root — the linked file appears to `stat`/`realpath` as an ordinary file *inside* `scratchDir`, even though it shares an inode (and therefore content) with a file elsewhere on the same filesystem. Neither documented defense-in-depth layer actually covers this entry type, despite the module header's claim that these two layers are comprehensive against "the node-tar CVE class."

(Practical exploitability is bounded by tar-implementation/`EXDEV`-across-filesystem behavior and by the fact this doesn't obviously grant more than direct content injection already does — hence WARNING, not BLOCKER — but the stated security property is measurably incomplete.)

**Fix:** Pass `--absolute-names`-safe verbose listing (`tar -tvf`) and reject any entry whose type flag is a hard link (`h`) or whose printed `-> target`/`link to target` is absolute or escapes the archive root, in addition to the existing name-based check.

### WR-05: The decompressed-size ceiling has no bound on entry count, so a many-tiny/empty-file archive bypasses both the mid-extraction and post-extraction checks

**File:** `scripts/team/archive-extract.mjs:63` (`DEFAULT_MAX_DECOMPRESSED_BYTES`), `scripts/team/archive-extract.mjs:79-103` (`sumFileSizesUnderDir`), `scripts/team/archive-extract.mjs:239-266` (Step C)

**Issue:** Both the mid-extraction poll and the post-extraction walk sum `stats.size` of regular files only. A tar archive containing a very large number of zero-byte (or few-byte) files compresses extremely well (a 512 MiB compressed-size ingest cap comfortably allows tens of millions of near-empty tar-header entries) yet contributes ~0 to the summed byte total at every checkpoint — the 5 GiB decompressed-size ceiling never fires. `readdirSync(scratchDir, { recursive: true })` (Step C) and the extraction itself still have to materialize an entry (inode + directory entry) per file, so this is a real, comparatively cheap-to-construct path to exhausting inodes/memory/CPU on the judging host, entirely outside the two documented byte-based defenses.

**Fix:** Track and cap the total entry count (from the Step A listing, before extraction even starts) alongside the byte ceiling — e.g. reject archives whose `tar -tf` listing exceeds some fixed entry-count ceiling (a few thousand is generous for a legitimate capture bundle).

### WR-06: `selectCodexSessionLogs` compares `corpusRoot` with no path normalization, unlike `selectClaudeCodeLogs`; a relative or trailing-slash `--corpus-root` silently drops all Codex logs from the archive

**File:** `scripts/dogfood/agent-log-selection.mjs:37-39` (`slugifyCorpusRoot`, calls `resolve()`), `scripts/dogfood/agent-log-selection.mjs:153` (`selectCodexSessionLogs`, raw `!==`)

**Issue:** `slugifyCorpusRoot` (used by `selectClaudeCodeLogs`) normalizes via `resolve(corpusRoot)` before slugifying, so a relative or trailing-slash `corpusRoot` still resolves to the correct Claude Code project directory. `selectCodexSessionLogs`, however, compares the recorded `payload.cwd` against `corpusRoot` with strict `!==` and **no normalization at all**:
```js
if (parsed?.payload?.cwd !== corpusRoot) { continue; }
```
`corpusRoot` here is `runReport.corpusRoot`, which is whatever string was passed to `dogfood-run.mjs --corpus-root <path>` (`dogfood-run.mjs`'s `parseDogfoodArgv` does not resolve/normalize it either). If an operator invokes the CLI with a relative path, or a path with a trailing slash, or any string that differs syntactically from Codex's own recorded absolute `cwd` — a completely ordinary thing to type on a command line — `selectCodexSessionLogs` will match zero files, and the resulting upload archive silently omits the Codex session logs entirely, even though the consent statement (`issue-key.mjs`'s `CONSENT_STATEMENT`) promises they are included. This is a silent under-collection bug that undermines the audit-trail goal this whole phase exists to serve, for a very ordinary operator input.

**Fix:** Normalize `corpusRoot` the same way in both selectors — e.g. `const resolvedCorpusRoot = resolve(corpusRoot);` at the top of `selectCodexSessionLogs`, compared against `resolve(parsed.payload.cwd)` (or, simplest, resolve `corpusRoot` once in `dogfood-run.mjs`'s argv parsing before it is ever stored in `run-report.json`, so every downstream consumer sees a canonical path).

### WR-07: `finalize()` only sends SIGTERM to a live child with a fixed 2-second grace period and no SIGKILL escalation; a wedged child can be leaked as an orphan while the report still claims a clean exit

**File:** `scripts/dogfood/dogfood-run.mjs:349-368` (`finalize`), `scripts/dogfood/dogfood-run.mjs:135-140` (`computeProxyExitCode`)

**Issue:**
```js
if (child.exitCode === null && child.signalCode === null) {
  proxyKilledChild = child.kill();   // default signal: SIGTERM
}
await Promise.race([
  fromServerClosed,
  new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000).unref()),
]);
```
`child.kill()` with no argument sends `SIGTERM`, which a wedged process (or one that is itself blocked on its own unresponsive `agda` subprocess) can ignore or be slow to act on. If the child has not exited within the fixed 2-second window, `Promise.race` proceeds anyway — there is no follow-up `child.kill("SIGKILL")`. The header comment at this exact call site claims *"Never leak an orphaned Agda process"*, but the mechanism as written does not guarantee that: `child.kill()` returning `true` only means the signal was deliverable, not that the process died. Worse, `computeProxyExitCode` then computes `proxyExitCode: 0` for this case (`childExitCode` stays `null`, `childSignalCode` stays `null` since the child never actually received/acted on a terminating signal that Node observed, `childFailed` is `false`) — so the persisted `run-report.json` records a clean, successful exit for a run whose child (and its own live `agda` grandchild) may still be running as an orphan on the host.

**Fix:** Escalate to `SIGKILL` if the child hasn't exited by the time the grace window elapses:
```js
const raced = await Promise.race([
  fromServerClosed.then(() => "closed"),
  new Promise((r) => setTimeout(() => r("timeout"), 2000).unref()),
]);
if (raced === "timeout" && child.exitCode === null && child.signalCode === null) {
  child.kill("SIGKILL");
}
```
and reflect an unconfirmed-dead child in the exit metadata rather than reporting `proxyExitCode: 0`.

## Info

### IN-01: `ingest-server.mjs`'s temp-file write does not actually mirror `writeFileAtomic`'s O_CREAT|O_EXCL discipline, despite the header comment's claim

**File:** `scripts/team/ingest-server.mjs:246-253`

**Issue:** The comment at line 246-249 says the same-directory temp file "mirrors `writeFileAtomic`'s own temp-then-rename discipline... without importing it." `writeFileAtomic` (`src/session/safe-source-io.ts:163`) deliberately opens its temp file with `flag: "wx"` (`O_CREAT | O_EXCL`) specifically to refuse an open if something already exists at the (UUID-randomized) temp path. `createWriteStream(tempPath)` here uses Node's default flag (`"w"`, i.e. `O_CREAT | O_TRUNC`, no `O_EXCL`) — it mirrors the temp-then-rename *shape* but not the *exclusivity* property the comment attributes to it. Practical risk is very low given the 122 bits of `randomUUID()` entropy in the temp path (the same reasoning `safe-source-io.ts` uses to describe its own `wx` flag as "free" defense-in-depth rather than the primary protection), but the documented parity claim is inaccurate.

**Fix:** Pass `{ flags: "wx" }` to `createWriteStream(tempPath)` for genuine parity, or correct the comment to note the difference is intentional (streamed writes can't easily recover from an `EEXIST` mid-stream the way a single buffered write can).

### IN-02: Brief TOCTOU window between key-registry file creation and `chmod(0o600)`

**File:** `scripts/team/issue-key.mjs:94-98` (`writeKeyRegistry`)

**Issue:** `writeFileAtomic` creates the registry file (via its own temp-then-rename, at the process's default umask-derived mode) and only *after* that completes does `writeKeyRegistry` call `chmod(keysPath, 0o600)`. Between the rename and the chmod there is a narrow window where the file may be group/world-readable. Impact is low because the file only ever contains SHA-256 hashes, never a raw key (per `hashKey`/`issueKey`'s own documented invariant), so a reader during that window learns nothing usable to forge a Bearer token.

**Fix:** Not urgent given the low impact, but for completeness the window can be closed by having `writeFileAtomic` (or a registry-specific variant) accept a `mode` option applied to the temp file itself before rename, rather than chmod'ing after the fact.

### IN-03: `slugifyCorpusRoot`'s lossy path→slug mapping can theoretically collide across two differently-named projects

**File:** `scripts/dogfood/agent-log-selection.mjs:37-39`

**Issue:** `slugifyCorpusRoot` replaces every `/` with `-`. Two distinct absolute paths can produce the identical slug when one path's directory segment contains a literal `-` at a position mirroring where the other has a `/` (e.g. `/Users/eric/my-project` and `/Users/eric-my/project` both slugify to `-Users-eric-my-project`). This is inherited from Claude Code's own observed directory-naming convention (the header comment documents this is "empirically confirmed" to match Claude Code's own scheme) rather than introduced by this module, and Claude Code itself would already co-mingle sessions for such colliding paths at the OS level — so this is not a new defect in the reviewed code, but it is a real (if narrow) mechanism by which an upload could include agent-session content from an unrelated project, worth flagging given this phase's stated consent/data-minimization goals.

**Fix:** No action required in this phase; worth a one-line note in the module header acknowledging the theoretical collision so a future hardening pass (e.g. hashing the corpus root instead of naively slugifying it, if Claude Code's own scheme ever changes) has the context.

---

_Reviewed: 2026-07-04T16:42:53Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
