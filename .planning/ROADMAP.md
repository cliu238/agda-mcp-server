# Roadmap: Agda MCP Server — Self-Improvement Loop

## Milestones

- ✅ **v1.0 Self-Improvement Loop** — Phases 1–5 (+03.1) (shipped 2026-07-03)
- 🚧 **v1.1 Feed the Loop** — Phases 6–9 (in progress)

## Phases

<details>
<summary>✅ v1.0 Self-Improvement Loop (Phases 1–5 + 03.1) — SHIPPED 2026-07-03</summary>

- [x] Phase 1: Capture Foundation (5/5 plans; gap plans 01-06/01-07 superseded by Phases 3–4) — completed 2026-07-02
- [x] Phase 2: The Oracle Triad (server-faithfulness + soundness hygiene + conformance) (5/5 plans) — completed 2026-07-02
- [x] Phase 3: Regression Lock Pipeline (3/3 plans) — completed 2026-07-02
- [x] Phase 03.1: Fix the #64/#61 transitive-staleness false-green, flip flagship lock to green (2/2 plans, INSERTED) — completed 2026-07-02
- [x] Phase 4: Triage / Fix Queue (5/5 plans) — completed 2026-07-02
- [x] Phase 5: Dogfooding Orchestration + Fuel (4/4 plans) — completed 2026-07-03

Full phase details: `milestones/v1.0-ROADMAP.md` · Audit: `milestones/v1.0-MILESTONE-AUDIT.md` (status: tech_debt, 19/19 requirements)

</details>

### 🚧 v1.1 Feed the Loop (In Progress)

**Milestone Goal:** Feed the shipped Loop ② pipeline its first real cargo and wire up its permanent fuel inlets — backlog re-verified through the pipeline, teammates' sessions uploaded and auto-judged — while sweeping v1.0's residual debt. Phase numbering continues from v1.0 (which ended at Phase 5, plus inserted 03.1); v1.1 starts at Phase 6. (The former CACHE theme was deleted 2026-07-03 by consumer audit — zero v1.1 users; see REQUIREMENTS.md v2 section.)

- [x] **Phase 6: Backlog Digestion (Policy Fix + Reverify)** - The ORCL-02 policy-key bug is fixed and case-sensitive-filesystem-verified; all 8 backlog defects reach a definitive verdict and confirmed defects reach `locked` (completed 2026-07-04)
- [x] **Phase 7: Team Feedback Channel — Local Wiring** - A teammate's session flows end-to-end through consent, fail-open upload, local ingest, and unattended judging into the fix queue, proven entirely on localhost — with a live session on the pinned CHG corpus as the acceptance payload (E2E-01, zero fixture shortcuts) (completed 2026-07-04)
- [ ] **Phase 8: Pinned-Environment Distribution + Thin k8s Deployment** - Zero-to-uploading teammate onboarding via git install, plus the ingest endpoint and cron judge running for real on the arrived k8s server
- [x] **Phase 9: Residual v1.0 Debt Sweep** - Every P2 item from the v1.0 audit is resolved — deleted, fixed, or explicitly decided-and-recorded (completed 2026-07-04)

## Phase Details

### Phase 6: Backlog Digestion (Policy Fix + Reverify)

**Goal**: The ORCL-02 cheat-detection policy resolves correctly at runtime on any filesystem (never silently derived from `.agda-lib` `name:` alone), and every pre-v1.1 fix-queue backlog entry reaches a definitive, non-stale state.
**Depends on**: Nothing (first phase of v1.1 — builds on the shipped v1.0 Loop ② scaffold)
**Requirements**: POLICY-01, REVERIFY-01, REVERIFY-02
**Success Criteria** (what must be TRUE):

  1. `run-oracle.mjs`/`dogfood-wrapup.mjs` accept an explicit `--policy <key>` (and/or a task-manifest `policyKey`) that resolves ORCL-02's policy file, overriding today's `.agda-lib` `name:`-only derivation. (POLICY-01)
  2. Feeding ORCL-02 a corpus whose `.agda-lib` name case-mismatches its policy filename (the real CHG-vs-`codex-homotopy-group.json` case) fails loudly with an explicit unresolved/mismatched-policy error — never silent cheat-filing abstention — proven by a test that runs on a case-sensitive filesystem (Linux container/CI), not just the maintainer's case-insensitive Mac. (POLICY-01)
  3. All 8 `needsReverify` entries in `test/fixtures/fix-queue.json` show `confirmed` (fresh capture + verdict evidence) or are closed as unreproducible (with evidence); zero remain `needsReverify`. (REVERIFY-01)
  4. Every confirmed live defect (the CHG-confirmed set — `agda_auto` CLI-flag leak, `agda_give` ok:true-wrapping-error, `agda_search_definitions` hardcoded `agda/` layout — plus whatever REVERIFY-01 confirms) reaches `locked` in the fix queue, or is explicitly re-triaged with a recorded reason — none silently stalled. (REVERIFY-02)

**Plans**: 6 plans

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — POLICY-01: --policy passthrough (run-oracle + wrapup), case-exact loud-fail resolution, real-CHG regression test (ubuntu-latest CI gate)
- [x] 06-02-PLAN.md — REVERIFY-01: RT1-RT4 re-verified live through dogfood-run -> capture -> dogfood-wrapup; queue transitions + evidence report

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-03-PLAN.md — REVERIFY-01: RT5-RT8 re-verified; zero needsReverify remain (criterion 3 gate)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-04-PLAN.md — REVERIFY-02: fix agda_auto flag-hint injection + agda_give ok:true-wrapping-rejection (from-RED tests)
- [x] 06-05-PLAN.md — REVERIFY-02: fix agda_proof_status "All goals solved." mislabel + agda_search_definitions directory param (from-RED tests)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 06-06-PLAN.md — REVERIFY-02: queue ledger closeout — named-4 locked, RT confirms fixed-or-deferred-with-reason, acceptance sweep

**Research**: Skip — standard pattern. Root cause and fix location are already identified (`judgeOrcl02` already accepts an override; this is pure CLI/options plumbing). The hard acceptance gate is a case-sensitive-filesystem test, not another Mac-only run.

### Phase 7: Team Feedback Channel — Local Wiring

**Goal**: A teammate's captured proof session flows end-to-end — issue-key consent, fail-open upload, local ingest, unattended judging — into the fix queue, fully proven on localhost before any k8s dependency exists.
**Depends on**: Phase 6 (POLICY-01's fix is a correctness prerequisite: an unresolved/mismatched policy must fail loudly for team-submitted corpora, never silently degrade TEAM-04's cheat-filing — and CHG, the E2E-01 acceptance corpus, is exactly the case-mismatch corpus)
**Requirements**: TEAM-01, TEAM-02, TEAM-03, TEAM-04, E2E-01
**Success Criteria** (what must be TRUE):

  1. Maintainer runs an `issue-key` script to mint a per-person revocable Bearer key, recorded in a server-side key registry; the emitted consent statement names exactly what uploads (captures + runs + full agent logs); revoking a key takes effect on the next request; an uploader holding no key produces zero network behavior. (TEAM-01)
  2. `upload-run.mjs` packs `.agda-mcp/captures/` + `.agda-mcp/runs/` + agent-session logs into a tar.gz (macOS AppleDouble metadata excluded) and POSTs it with the Bearer key; when the endpoint is unreachable or the upload fails, it never blocks or errors the teammate's own work — the archive lands in a bounded local retry queue and is retried on the next invocation. (TEAM-02)
  3. A locally-running ~100-line `node:http` ingest endpoint authenticates the Bearer key, enforces a size cap (oversize rejected with a clear error), and stores accepted archives untouched under `person/date/run-id` on a local storage root — archives are extracted only at judge time, never at ingest. (TEAM-03)
  4. Running the cron-judge script against local storage safely extracts each archive (materialize-pattern path-sandboxing, never bare tar trust), drives it through the oracle triad + N-rerun flake gate, and intakes it into the fix queue as `new` — resolving each bundle's `policyKey` correctly via Phase 6's fix so a bundle from another machine never silently abstains — and the run summary surfaces the per-run INCONCLUSIVE/abstention rate. (TEAM-04)
  5. The full loop is proven **live** on the pinned CHG corpus with zero fixture shortcuts: a fresh agent proof session through `dogfood-run.mjs` → auto-capture → TEAM-02 upload → TEAM-03 ingest → TEAM-04 judge → fix-queue intake reaches a definitive per-capture verdict with correct dedup against existing CHG entries; any confirmed defect continues into the REVERIFY-02 fix→lock flow. Acceptance is loop-to-verdict, not "must find a new defect". Documented precondition: CHG's vendored agda-unimath built locally once (overnight, corpus's own tooling). (E2E-01)

**Plans**: 6 plans in 4 waves

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — TEAM-01: key registry (hash-only, mode 0600) + issue/revoke/list CLI + consent statement
- [x] 07-02-PLAN.md — TEAM-02 core: Claude Code/Codex agent-log selection + upload-run.mjs (staged tar.gz pack, fail-open POST, bounded NDJSON retry queue)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-03-PLAN.md — TEAM-03: `node:http` ingest endpoint (Bearer auth via 07-01's registry, streamed size-cap guard, sandboxed person/date/runId storage)
- [x] 07-04-PLAN.md — Pipeline integration: `taskManifestCorpora` additive run-report.json field + D-12 unconditional upload-chain tail in dogfood-wrapup.mjs

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07-05-PLAN.md — TEAM-04: sandboxed archive extraction (pre-list + post-extraction realpath containment) + unattended cron judge (reuses wrapUpCapture unchanged) + abstention-rate summary + git write-back

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07-06-PLAN.md — E2E-01: live CHG acceptance run — build-readiness probe, human-driven Codex proving session, automated post-session verification against the real tracked fix queue

**Research**: Discuss-phase needed during planning — the fix-queue write-back mechanism (direct push to `main` vs. PR-per-batch from the cron) is an open architecture decision the research explicitly left unresolved. Concrete payload-size-cap, local-retry-queue bound, and archive-retention numbers also need deciding here (the underlying "a bound must exist" pattern is settled; the numbers are not).

### Phase 8: Pinned-Environment Distribution + Thin k8s Deployment

**Goal**: A teammate can go from zero to a working, version-pinned install with no npm account anywhere in the flow, and the ingest endpoint + cron judge run for real on the arrived JHU IDIES-style k8s server — a thin packaging step around already-locally-proven scripts, not new application logic.
**Depends on**: Phase 7 (packages TEAM-02/03/04's proven upload URL + key mechanism into TEAM-05's installer); additionally gated on the physical k8s server's arrival (~2026-07-07) — must not block, and must not be blocked by, Phases 6–7, which are fully local-verifiable (Phase 9 can fill the waiting gap)
**Requirements**: TEAM-05, DEPLOY-01
**Success Criteria** (what must be TRUE):

  1. A teammate going zero → uploading follows a documented install script (or devcontainer) that pins the exact server version (git tag) and exact Agda (`tooling/scripts/run-pinned-agda.sh`), with no npm account anywhere in the flow; corpus onboarding is one documented step (clone pinned corpora; first build runs overnight via the corpus's own tooling — no bespoke cache system). (TEAM-05)
  2. The ingest endpoint + cron judge run on the k8s server (GHCR image built `linux/amd64` containing Node + pinned Agda + pinned corpus source clones only — no corpus caches, so it is small and buildable on standard hosted runners or locally; nginx-ingress path app with `proxy-body-size` raised to match the TEAM-03 cap, PVC storage root, Ceph-UID-correct securityContext). (DEPLOY-01)
  3. Local mode remains a working fallback, and POLICY-01's case-sensitivity fix is re-verified on the cluster. (DEPLOY-01)

**Plans**: 6 plans in 4 waves

Plans:
**Wave 1**

- [x] 08-01-PLAN.md — TEAM-05 core: clone-fuel-corpora.mjs (shared, reused by Docker) + install-pinned-env.{sh,mjs} (Node/Agda verify, run-pinned-agda.sh generation, npm ci orchestration)
- [x] 08-02-PLAN.md — DEPLOY-01 packaging: Dockerfile (Node 24 + cabal-built Agda 2.8.0 + 4 pinned fuel corpora, non-root UID 2231) + k8s manifests (Deployment/Ingress/CronJob targeting the verified llm-gateway namespace + PVC)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 08-03-PLAN.md — TEAM-05 acceptance: docs/TEAM-ONBOARDING.md + fresh-teammate walkthrough test (installer -> real local upload, zero real Agda dependency)
- [x] 08-04-PLAN.md — DEPLOY-01 CI/CD: deploy-ingest.yml (D-06 auto-deploy-on-push, no path filter) + cluster secrets bootstrap + first live deploy (checkpoint: GH Actions secrets) (completed 2026-07-05: green run 28726436348 after 4 attempts; healthz ok)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 08-05-PLAN.md — DEPLOY-01 functional acceptance: real upload through the deployed cluster + manual cron-judge trigger + PVC queue accumulation + write-back-disabled proof (D-09)

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 08-06-PLAN.md — Phase closeout: POLICY-01 cluster re-verify + local-mode regression re-run + cut and push the v1.1 git tag (D-11)

**Research**: Completed via live cluster verification (`.claude/skills/agda-mcp-k8s-deploy/SKILL.md`, 2026-07-04) — the k8s namespace (`llm-gateway`, reused), PVC (`sciserver-datavolumes-01-rw`, CephFS, `fs.rename`-safe), UID (2231), quota headroom (~3 CPU / 7Gi), and URL convention (`dev.sites.idies.jhu.edu/agda-mcp`) are all live-verified facts, not desk research. TEAM-05's fixed-clone-path convention was resolved in `08-CONTEXT.md` (D-04/D-05).

### Phase 9: Residual v1.0 Debt Sweep

**Goal**: Every P2 tech-debt item recorded in `milestones/v1.0-MILESTONE-AUDIT.md` is resolved — deleted, fixed, or explicitly decided-and-recorded — so v1.0's accumulated non-blocking findings don't silently carry forward into the next milestone.
**Depends on**: Nothing (independent of Phases 6–8 — a closed, pre-itemized P2 checklist; can be sequenced in parallel with or interleaved among any other phase, including filling the gap while Phase 8 waits on the k8s server's arrival)
**Requirements**: DEBT-01, DEBT-02, DEBT-03, DEBT-04, DEBT-05, DEBT-06, DEBT-07
**Success Criteria** (what must be TRUE):

  1. `scripts/verify-cold-replay.mjs` is resolved — either deleted (default: superseded by ORCL-01, zero importers) or hardened per the unexecuted 01-07 plan (CR-01 path traversal, CR-02 false-PASS) — with the decision and evidence recorded. (DEBT-01)
  2. The dead-ended `.agda-mcp/captures/index.json` write in `promote-capture.mjs` is retired and its stale header comment (claiming `readDedupIndex` still reads it) is fixed. (DEBT-02)
  3. `resetRecordedActions()` in `register-capture-session.ts` is reordered to run only after a successful `writeFileAtomic`, closing the WR-01 durability edge (a write failure could otherwise lose the drained action log with no artifact). (DEBT-03)
  4. The four Phase-5 Info findings are each fixed: argv/run-id sanitization (IN-01); dangling-symlink handling in `install-dogfood-skill.mjs` (IN-02); `git check-ignore` exit-status ambiguity in its test (IN-04); wrapup catch-handler re-dereference of `staged.stagedPath` (IN-05). (DEBT-04)
  5. A retroactive `SECURITY.md` covers Phase 5's process-spawning scripts and is extended to v1.1's new network surfaces (ingest endpoint, upload client); `tsc -p tsconfig.test.json` runs clean (no ReplayManifest index-signature or `structuredContent` errors); `.planning/codebase/` is refreshed via `/gsd:map-codebase`. (DEBT-05, DEBT-06, DEBT-07)

**Plans**: 6 plans in 3 waves

Plans:
**Wave 1**

- [x] 09-01-PLAN.md — DEBT-01/DEBT-02: delete verify-cold-replay.mjs + promote-capture.mjs (and its dogfood-run.mjs call site), fix dangling comment references, record both decisions in PROJECT.md
- [x] 09-02-PLAN.md — DEBT-03: WR-01 durability reorder (resetRecordedActions after writeFileAtomic) + WR-12 fixture-tree isolation + WR-08 closure record
- [x] 09-03-PLAN.md — DEBT-05: consolidated Phase 5 + Phase 7 threat register (`09-SECURITY.md`), including the plaintext-Bearer-key-in-retry-queue widening
- [x] 09-04-PLAN.md — DEBT-06 (part A): mechanical tsconfig.test.json cleanup across 20 files + W5 fix-queue-schema fold-in

**Wave 2** *(blocked on Wave 1 completion — shares dogfood-run.mjs with 09-01)*

- [x] 09-05-PLAN.md — DEBT-04: IN-01 (argv/run-id sanitization) + IN-02 (skill-installer dangling-symlink) + IN-04 (its test's exit-status precision) + IN-05 (wrapup catch-handler safety)

**Wave 3** *(blocked on Waves 1–2 completion — the phase finale)*

- [x] 09-06-PLAN.md — DEBT-06 (part B) + DEBT-07: agda-transport.test.ts's remaining type errors, full-repo tsc-clean verification, permanent `typecheck:test` CI gate, DEBT-07's `/gsd:map-codebase` deferral recorded

**Research**: Skip — standard pattern. A fixed, already-itemized P2 checklist from the v1.0 audit, not new capability work.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Capture Foundation | v1.0 | 5/5 | Complete | 2026-07-02 |
| 2. Oracle Triad | v1.0 | 5/5 | Complete | 2026-07-02 |
| 3. Regression Lock Pipeline | v1.0 | 3/3 | Complete | 2026-07-02 |
| 03.1 Flagship false-green fix | v1.0 | 2/2 | Complete | 2026-07-02 |
| 4. Triage / Fix Queue | v1.0 | 5/5 | Complete | 2026-07-02 |
| 5. Dogfooding Orchestration + Fuel | v1.0 | 4/4 | Complete | 2026-07-03 |
| 6. Backlog Digestion (Policy Fix + Reverify) | v1.1 | 6/6 | Complete    | 2026-07-04 |
| 7. Team Feedback Channel — Local Wiring | v1.1 | 6/6 | Complete    | 2026-07-04 |
| 8. Pinned-Env + Thin k8s Deployment | v1.1 | 4/6 | In Progress|  |
| 9. Residual v1.0 Debt Sweep | v1.1 | 6/6 | Complete    | 2026-07-04 |
