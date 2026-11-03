# SalonOS

Salon management portal specification and agent delivery baseline.

Current status: product documentation plus an initial in-memory booking reference and automated domain tests. This is not a working web portal. Persistent storage, authentication, checkout and deployment are not implemented. Grok chat participation has not yet been acknowledged.

## Product documents

- [Product requirements](docs/SalonOS_PRD.md)
- [MVP scope and delivery plan](docs/SalonOS_MVP.md)
- [Technical design document](docs/SalonOS_TDD.md)
- [Proposed usage manual](docs/SalonOS_Usage_Manual.md)
- [Agent team and Grok handoff instructions](docs/SalonOS_Agent_Team_and_Grok_Handoff.md)
- [Starting requirements backlog](docs/SalonOS_Starting_Backlog.json)
- [Joint build queue and Grok kickoff prompt](docs/delivery/COLLABORATION.md)
- [Independent booking reference review](docs/validation/booking-reference-review.md)

## Run the reference tests

Requires Node.js 20 or later. Run `npm test` from the repository root; no dependencies or API keys are needed. The single-process model demonstrates behavior only. Replace it with transactional database constraints and authenticated server commands before production use.

Read the PRD for the full target, MVP for controlled-pilot boundaries, and TDD for proposed implementation contracts. The manual is unverified until tested against a build. The agent charter defines research, build, independent validation and founder-authorized release handoffs.

Start with one synthetic-data vertical slice: configure a service and practitioner, create a conflict-safe appointment, complete treatment, check out, issue a receipt and reconcile daily close. Expand only after independent evidence verifies the slice.
