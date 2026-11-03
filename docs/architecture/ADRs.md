# Architecture decision records

G1 records accepted architecture decisions here. No ADR has been accepted yet. The [technical design document](SalonOS_TDD.md) is a proposed architecture for PRD 1.0 and MVP 1.0, not a signed decision set.

Until an ADR exists, treat TDD recommendations as proposed. Interface changes must update the contract and affected instructions in the same review cycle.

## Template

```md
# ADR-NNNN: Title

Status: proposed | accepted | superseded by ADR-NNNN
Date:
Decider: G1 (H0 where the choice has budget, provider or production impact)
Consulted: G2–G5, G7 as applicable

## Context

## Decision

## Consequences

## Alternatives considered
```

## Unresolved candidates from TDD 1.0

These are open questions listed in the TDD, not decisions:

- Identity provider
- Exact framework and library versions
- Queue implementation
- Host and region
- Payment provider and supported tenders
- Sender channels
- Backup configuration
- Accountant-approved ledger and tax mapping
- Monthly budget

Do not invent an accepted choice in this file. Create a numbered ADR only after G1 records a real decision.
