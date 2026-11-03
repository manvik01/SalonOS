# API contracts

No separately versioned OpenAPI or schema files exist yet. Until ADRs and generated contracts exist, the proposed interfaces live in:

- [Technical design document](../SalonOS_TDD.md) — API conventions, aggregates and representative endpoints
- [Product requirements](../../product/SalonOS_PRD.md) section 8 — representative API contracts

G1 owns contract changes. Shared schema or core financial edits require G1 coordination and one active writer per shared contract file. An interface change must update this directory, the TDD/ADR and affected manual sections in the same review cycle.

When a contract is extracted, place versioned files here (for example `appointments-v1.md` or OpenAPI YAML) and link them from the relevant ADR.
