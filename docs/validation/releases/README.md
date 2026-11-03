# Validation releases

G6 stores independent validation evidence per release candidate here as `docs/validation/releases/{release-id}/`.

No release-id folders exist yet. No tests have been executed against an application commit because this repository is documentation only.

When a candidate exists, include at least:

- exact commit SHA under test
- requirement IDs and UAT IDs (PRD U01–U25 where relevant)
- commands run and raw outputs
- pass / fail / block recommendation
- defect links
- statement that results were produced independently of the implementer

Do not mark a test passed because the implementer says it passed. Only G6 can mark validation passed from evidence; only H0 can authorize production release.
