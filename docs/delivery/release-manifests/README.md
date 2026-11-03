# Release manifests

G0 assembles a release candidate; G8 produces the concrete release pack for founder approval. No release manifests exist yet. Nothing in this directory implies a staging or production deployment.

A release manifest pins:

- code commit SHA
- schema migration version
- PRD version
- manual version
- task revision set
- test artifacts and validation recommendation from G6
- security recommendation from G7
- staging evidence, backup/restore drill and rollback plan from G8
- known issues
- exact deployment target

Suggested filename: `{release-id}.md` or `{release-id}.json`, with validation evidence stored under [`docs/validation/releases/`](../../validation/releases/README.md).

H0 authorizes production. G8 deploys only the approved commit after that authorization. Do not invent passed checks or deployment status.
