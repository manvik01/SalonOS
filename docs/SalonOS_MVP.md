# SalonOS MVP Scope and Delivery Plan

Version 1.0 · 3 November 2026 · Proposed implementation baseline

## Objective

Deliver one reliable end-to-end salon workflow: owner setup → service and roster configuration → client booking → treatment → checkout → receipt → reconciled daily close. This document extracts the controlled pilot from PRD 1.0. It does not replace the full PRD or claim implementation is complete.

## Initial deployment assumptions

One Singapore business, one location, SGD, Asia/Singapore, English. Use synthetic data until migration authorization. Tenant isolation is required from the first implementation even when the pilot has only one tenant. External provider accounts, hosting budget and production policies remain unconfirmed.

## Included in the controlled pilot

| Area | Scope | PRD references |
|---|---|---|
| Foundation | Verified owner, sessions/MFA, invitations, role/location permissions, audit, backup foundation | WS01–WS03, WS06, OPS01 |
| Catalog | Categories, variants, pricing, taxes, duration/buffers, staff and room eligibility, historical snapshots | SVC01–SVC03 |
| Team | Staff profiles, qualifications, shifts, breaks, leave and conflict review | TEAM01 |
| Clients | Search, profiles, restricted notes, channel consent, CSV preview and duplicate review | CLI01–CLI04 |
| Scheduling | Day/week/list calendar, sequential service appointments, atomic staff/resource reservations, reschedule/cancel/no-show | CAL01–CAL05, CAL09 |
| Checkout | Appointment/walk-in sale, cash and explicitly recorded external payments, deposits, splits, receivables and immutable receipts | POS01–POS04 |
| Corrections | Permission-controlled refunds/reversals, original-tender tracking, reason and pending state | PAY02 |
| Register | Float, cash movements, counted cash, variance and close | PAY04 |
| Stock | Products, opening quantity, receipts, sale/return/damage/consumption ledger and negative-stock protection | INV01 |
| Reports | Daily sales, tender, tax, refunds, receivables, cash close and drilldown | REP01 |
| Data and controls | Authorized opening data, scoped exports needed for reconciliation, migration traceability and audit | DATA01, OPS01 |

The PRD priority column remains authoritative for all P0 requirements, including requirements not repeated in this summary. MVP closure must reconcile every P0 ID from the starting backlog.

## Full launch additions

The controlled pilot is not the complete requested product. R2 adds hosted online payments and booking, reminders, packages, upfront memberships, gift cards/client credit, consented email campaigns, promotions, internal/client inbox, richer reporting, stockcounts, platform billing and production support procedures. All P1 requirements must pass before calling the requested application business ready.

R3 separately covers recurring membership collection, SMS/WhatsApp connectors, advanced commissions, purchase orders/transfers and multi-location operation. Recurring/group appointments and parallel processing require a new approved scheduling design; do not enable them through freeform overlaps.

## First vertical slice

1. Owner creates a location, one 60-minute service, one qualified practitioner and one required room.
2. Reception creates a synthetic client and books an available time.
3. A simultaneous competing request for the same slot returns a conflict.
4. Practitioner marks arrival, treatment and completion.
5. Cashier checks out with cash or a verified external payment reference and issues one receipt.
6. Repeated submission creates no duplicate receipt or stock movement.
7. Finance closes the drawer and traces report totals to that receipt.
8. A second tenant cannot access any record through changed object IDs or export requests.

## Dependency and ownership plan

| Sequence | Owner | Output | Validation |
|---|---|---|---|
| 1 | G1 with G7 | Identity, tenancy and contract design | Permission/tenant negative-path checks |
| 2 | G2 with G5 | Catalog, roster, CRM and booking slice | G6 proves concurrency and policy boundaries |
| 3 | G3 with G5 | Sale, tender, refund and receipt | G6 proves duplicate handling and financial fixtures |
| 4 | G4 | Stock ledger, report and daily close | G6 reconstructs totals and stock movements |
| 5 | G8 | Staging, backup/recovery and monitoring | Restore drill and journey smoke test |
| 6 | ChatGPT manual author | Instructions aligned to accepted commit | G6 checks procedure against build |

Agent identities refer to the team charter; none are provisioned by these documents. Founder accepts policies and authorizes production. Reviewer and validator are separate from the implementing session.

## Mandatory MVP evidence

- Every P0 requirement mapped to passed test evidence on an exact commit.
- Staff/resource overlap rejected under concurrent requests.
- Unknown payment state cannot trigger casual second collection.
- Finalized sales and ledger movements corrected by linked reversal, never history edits.
- Refunds bounded by original paid amounts; deposits applied once.
- Opening stock and customer liabilities reconcile to authorized source references.
- Role and cross-tenant server authorization proven independently of UI controls.
- Daily cash variance is visible and approved rather than hidden.
- Backup restore meets measured recovery objectives before live reliance.
- Pilot staff complete their role training and owner records go/no-go.

Use PRD U01–U24 where relevant to MVP; R2-only scenarios become full-launch gates and U25 applies to later recurring billing. No test is marked passed until executed.

## Outage and pilot limitations

The pilot requires network connectivity. It has no offline financial queue or offline card processing. External payment entry is a staff assertion until reconciled; there is no implied bank integration. Do not send marketing or charge live providers during staging. Keep documented manual booking/payment logs for outages and reconcile references before back-entry.

## Estimate and next step

The PRD's overall 16–22 week solo-founder estimate covers the proposed business-launch sequence, not a guaranteed MVP deadline. Estimate the pilot after identity, reservation and ledger spikes. Start by creating ready task packets for the first vertical slice with API contracts, fixtures and acceptance criteria.
