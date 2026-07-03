// MIT License — see LICENSE
//
// PROC-02's SSOT (D-02): a checked-in JSON array pins the four
// requirement-named fuel corpora — agda-stdlib, agda-unimath,
// codex-homotopy-group, autoformalizing-hopf — no more, no fewer —
// each at a real, resolved 40-character commit SHA and cross-
// referencing a per-project ORCL-02 policy file by `policyKey`. This
// sibling module validates the raw JSON once via zod +
// loadValidatedJsonData (the same idiom already used by
// capture-regression-matrix.ts / fix-queue.ts) and exports a typed
// constant. Consumers import fuelCorpora, never the raw JSON.
//
// The raw JSON lives under scripts/data/ (NOT duplicated here as a
// sibling test/fixtures/*.json) because the fuel-pointer manifest's
// single source of truth sits alongside the oracle-policy directory it
// cross-references. scripts/oracle/orcl-02-soundness-scan.mjs's
// existing loadOraclePolicy() already reads sibling *policy* files from
// that same scripts/data/oracle-policy/ tree at runtime via a DIFFERENT
// loader — src/json-data.ts's loadJsonData(relativePath, schema,
// baseUrl), not this file's test/helpers/json-data.ts's
// loadValidatedJsonData(moduleDir, relativePath, schema). The two
// loaders are NOT interchangeable — do not conflate them. This file is
// the test-side typed-loader half only.

import { z } from "zod";

import { loadValidatedJsonData } from "../helpers/json-data.js";

export const fuelCorpusEntrySchema = z.object({
  key: z.string().min(1),
  // "owner/repo" shape.
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  access: z.enum(["public", "private"]),
  // A full commit SHA only — never a short SHA or a bare tag/branch
  // name — so the manifest can never silently drift on an ambiguous
  // ref.
  pinnedRef: z.string().regex(/^[0-9a-f]{40}$/i),
  // Cross-references a scripts/data/oracle-policy/<policyKey>.json
  // sibling, resolved at runtime via the unchanged loadOraclePolicy().
  policyKey: z.string().min(1),
  notes: z.string().optional(),
});

export type FuelCorpusEntry = z.infer<typeof fuelCorpusEntrySchema>;

export const fuelCorpora: FuelCorpusEntry[] = loadValidatedJsonData(
  import.meta.dirname,
  "../../scripts/data/fuel-corpora.json",
  z.array(fuelCorpusEntrySchema),
);
