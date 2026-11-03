# SalonOS

Salon management portal specification and agent delivery baseline.

Current status: documentation only. Application implementation, Grok provisioning, runtime validation and deployment have not been completed.

## Product documents

- [Product requirements](docs/product/SalonOS_PRD.md)
- [MVP scope and delivery plan](docs/product/SalonOS_MVP.md)
- [Starting requirements backlog](docs/product/SalonOS_Starting_Backlog.json)
- [Proposed usage manual](docs/manual/SalonOS_Usage_Manual.md)

Read the PRD for the full target, MVP for controlled-pilot boundaries, and TDD for proposed implementation contracts. The manual is unverified until tested against a build.

## Architecture and decisions

- [Technical design document](docs/architecture/SalonOS_TDD.md)
- [Architecture decision records](docs/architecture/ADRs.md)
- [API contracts](docs/architecture/api-contracts/README.md)
- [Decision log](docs/decisions/decision-log.md)

## Delivery and validation

- [Virtual product delivery team operating model](docs/delivery/SalonOS_Virtual_Product_Delivery_Team.md)
- [Agent prompts](agent-prompts/README.md)
- [Research source register](docs/research/source-register.md)
- [Handoffs](docs/delivery/handoffs/README.md)
- [Release manifests](docs/delivery/release-manifests/README.md)
- [Requirement traceability](docs/validation/traceability.csv)
- [Validation releases](docs/validation/releases/README.md)

The agent charter defines research, build, independent validation and founder-authorized release handoffs. No Grok bots, accounts or automated runners are provisioned by this repository.

Start with one synthetic-data vertical slice: configure a service and practitioner, create a conflict-safe appointment, complete treatment, check out, issue a receipt and reconcile daily close. Expand only after independent evidence verifies the slice.
