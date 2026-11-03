# Handoffs

G0 stores versioned worker handoff JSON here. No handoff files exist yet because no implementation tasks have been assigned.

Every worker returns this minimum structure. Example placeholders must be replaced with actual repository values before task execution. G0 rejects stale task revisions and mismatched commit evidence.

```json
{
  "task_id": "SAL-0001",
  "revision": 1,
  "agent": "G2",
  "state": "review",
  "prd_version": "1.0",
  "manual_version": "1.0",
  "schema_version": "TO_BE_RESOLVED",
  "base_commit": "actual-sha-required",
  "result_commit": "actual-sha-required",
  "artifacts": [],
  "tests_executed": [],
  "acceptance_results": [],
  "known_issues": [],
  "documentation_delta": [],
  "next_owner": "G1"
}
```

Suggested filename: `{task_id}-r{revision}-{agent}.json`.

Task packets use the YAML contract in the [operating model](../SalonOS_Virtual_Product_Delivery_Team.md) section 6. Missing fields return `blocked`; a timeout never means accepted.
