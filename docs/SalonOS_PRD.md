# SalonOS Product Requirements and Implementation Specification

Version 1.0 · 3 November 2026 · Status: proposed build baseline

## 1 Purpose and scope

Build a responsive, production web application that lets a salon operate the complete customer journey: discover a service, book, arrive, receive treatment, pay, redeem benefits, receive communications, and return. Owners manage staff, stock, cash, liabilities and performance from the same system. This document is the implementation contract; the companion usage manual describes intended workflows and proposed navigation. No application, payment connection or production readiness is claimed by these documents.

Initial market assumption: Singapore salons, SGD, Asia/Singapore, English, one legal business and one pilot location. Architecture supports multiple tenants and locations; multi-location operation is a later release. Target users are independent salons and small groups. Beauty Bar Parlour may be the pilot if the owner selects it; all business, pricing, staff and tax settings must be confirmed during onboarding. Do not seed remembered personal or business data as verified current data.

Fresha is a workflow research reference, not an integration commitment, a design to copy, or a source of permission to import private customer data. SalonOS has its own interface and explicit business rules. Source mapping appears in section 18.

### Success measures

Targets for the pilot, measured against a two-week baseline: median single-service booking entry under 60 seconds; standard checkout under 90 seconds excluding client payment time; no confirmed double bookings; every tender and stored-value movement traceable; daily close reconciles with explained differences; all pilot users complete their role-specific UAT. Aim for a 20 percent relative reduction in missed appointments after eight weeks, but treat this as an outcome hypothesis rather than a launch gate.

### Product boundaries

The launch is a functioning salon system, not a marketplace, payroll tax engine, bank, medical record system or autonomous business agent. Customer wallet means closed-loop salon credit; business wallet means a view of provider settlements and payouts. Neither implies SalonOS holds transferable money. AI suggestions, if added later, require separate scope and do not execute refunds, campaigns or pricing changes without an authorized person.

## 2 Releases and priorities

| Release | Required capability | Exit condition |
|---|---|---|
| R0 Foundation | Tenant isolation, identity, roles, audit, environments, database, onboarding, import preview | Security and migration checks pass |
| R1 Controlled operations pilot | Service catalog, staff availability, resource-safe bookings, clients, POS, cash and manually verified external tenders, deposits, partial payments, refunds, basic stock, daily close, operational reports | Staff can run a full day and reconcile it; owner accepts limitations |
| R2 Business launch | Hosted online payment, booking portal, transactional email, client credit, gift cards, prepaid packages, upfront memberships, campaigns, promotion engine, two-way email, internal messaging, platform billing and incident procedures | All launch UAT passes; financial, support and data controls operational |
| R3 Expansion | Recurring memberships, approved SMS/WhatsApp connectors, advanced commissions, purchasing and transfers, multi-location operation, richer analytics | Provider contracts, failure cases and location permissions tested |

P0 means R0/R1; P1 means R2 and is mandatory before calling the full requested scope business ready; P2 means R3 and must not be marketed as available until released. A pilot is not the full launch. If recurring billing or WhatsApp is required on day one, move those P2 requirements into the launch gate and re-estimate.

## 3 Personas and authority

| Role | Permitted baseline | Restricted baseline |
|---|---|---|
| Owner | All tenant settings, staff roles, financials, refunds, exports and subscription | No cross-tenant access |
| Manager | Assigned location operations, roster, catalog, approved refunds, stock and reporting | No owner transfer, bank change or platform subscription cancellation |
| Receptionist | Bookings, ordinary client fields, sales, tender entry and receipts | No bulk export, unrestricted refund, payout changes or restricted treatment notes |
| Practitioner | Own schedule, assigned clients, permitted treatment notes, service completion | No full customer list export, business financials or role changes |
| Inventory clerk | Stock, purchase receipts and product details | No client contact list or sales refunds |
| Finance | Sales, tender, settlement, liabilities, exports, close and approved refunds | No treatment notes or campaigns |
| Marketer | Approved segments, templates, consented campaigns and aggregate results | No payment details, sensitive notes or staff pay |
| Client | Own bookings, receipts and benefit balances through verified access | No access to another client or staff information |
| Platform support | No tenant access by default; approved time-limited support session | No standing tenant impersonation or silent data export |

Authorization is enforced at every server endpoint, query, export and background job. UI hiding is insufficient. Custom roles may narrow permissions; only the owner may grant powers they themselves possess. Log role changes and revoke active sessions when a user is disabled. Staff membership in another tenant confers no authority here.

## 4 Functional requirements

Each row states the minimum acceptance contract. More detailed failure scenarios are mandatory in section 14.

### Workspace and account

| ID | Priority | Requirement and acceptance |
|---|---|---|
| WS01 | P0 | Register a business, verify owner email, create workspace and configure name, legal name, currency, timezone, contact, opening hours and tax status. Repeated registration requests do not create duplicate workspaces. |
| WS02 | P0 | Invite team members with role and location scope; invitation expires and can be revoked. Removing staff preserves historical bookings and sales attribution. |
| WS03 | P0 | Support secure login, reset, session expiry, owner MFA and recovery. Rate-limit sign-in and booking abuse; never reveal whether an email exists during recovery. |
| WS04 | P1 | Platform plan, usage, invoices, fees, renewal and cancellation are visible separately from salon customer sales. Show effective dates and estimated usage cost before purchase. Require owner confirmation for paid plan changes. |
| WS05 | P1 | Subscription states trial, active, past_due, suspended and cancelled; failed billing triggers notice and grace-period policy. Preserve financial exports and owner data access according to the agreed contract; cancellation must not delete accounting history. |
| WS06 | P0 | Configure taxes, receipt identity, cancellation policy, deposits, service hours, staff permissions and notification templates. Effective-dated changes cannot rewrite finalized sales. |

### Calendar and scheduling

| ID | Priority | Requirement and acceptance |
|---|---|---|
| CAL01 | P0 | Day/week calendars by practitioner with location, status, service and resource filters; accessible list view on phones. Drag reschedule requires confirmation and server validation. |
| CAL02 | P0 | Create appointments with one or more sequential services, eligible staff, client, room/equipment, duration, buffers and notes. Atomic validation rejects staff/resource overlap including concurrent requests. |
| CAL03 | P0 | Available slots equal intersection of business hours, staff shifts, qualifications, resource capacity and booking policies, excluding leave, breaks and existing occupancy. Any-staff selects an eligible available practitioner and persists the assignment. |
| CAL04 | P0 | Move through held, confirmed, arrived, in_service, completed, cancelled and no_show states. Holds expire after a configurable default of five minutes. Payment state remains separate. |
| CAL05 | P0 | Reschedule, cancel, mark no-show and rebook with reason, policy snapshot, actor and timestamps. Rescheduling preserves original identity and records history; it does not silently charge a fee. |
| CAL06 | P1 | Public booking offers eligible services, available times, policy acceptance, verified customer contact and optional deposit. Booking success requires committed reservation; delayed payment is handled by reconciliation, not duplicate reservations. |
| CAL07 | P1 | Waitlist records preferred times and services; invitation links expire and never promise the same appointment to two clients. First successful reservation wins and others receive a clear unavailable message. |
| CAL08 | P1 | Send confirmation, reminder and change notifications through durable jobs. Deduplicate by appointment version, purpose and channel. Failure appears in an operations queue. |
| CAL09 | P0 | Multi-client group bookings, recurring appointments and parallel service processing are excluded from initial scheduling; block unsupported configuration rather than approximate availability. Add only with explicit capacity models and tests. |

### Clients and services

| ID | Priority | Requirement and acceptance |
|---|---|---|
| CLI01 | P0 | Search clients by normalized name, phone or email; retain appointment, purchase, notes and benefit history. Family members sharing contact details remain separate profiles. |
| CLI02 | P0 | Store marketing choices by channel, purpose, source, timestamp and policy version. A booking, import or previous visit never automatically enables marketing. Withdrawal blocks queued promotions before send. |
| CLI03 | P0 | Restricted consultation notes and attachments have explicit permissions, file scanning and access logs. Collect only needed information; configurable retention and access/correction request procedures are available. |
| CLI04 | P0 | CSV import offers mapping, validation, duplicate suggestions, preview and row-level errors; owner reviews before commit. Merge requires explicit confirmation, preserved source IDs and audit history. No fuzzy auto-merge. |
| CLI05 | P1 | Verified self-service lets clients view/cancel/reschedule their own bookings under policy and see balances. Authorization checks ownership on every object; shared phone numbers alone cannot authenticate another family member. |
| CLI06 | P1 | Versioned consultation forms, required questions, signatures where appropriate and practitioner review. Updating a template never rewrites a submitted form; required consent completion is checked before treatment and any allowed exception is audited. |
| SVC01 | P0 | Categories, service variants, name, description, fixed/from price, duration, buffers, tax category, staff eligibility, resource requirements and online visibility. Archive preserves history. |
| SVC02 | P0 | Booking settings include advance window, notice, slot interval, cancellation cutoff and deposit rule. Per-service overrides show the effective rule in preview. |
| SVC03 | P0 | Snapshot price, duration, policy and tax configuration version at booking. A later catalog edit does not change existing appointments; authorized repricing must be disclosed and logged before checkout. |
| SVC04 | P1 | Add-ons and bundles specify whether they extend duration, require another resource or qualify for discounts; price and availability are recalculated before confirmation. |

### Sales checkout and payments

| ID | Priority | Requirement and acceptance |
|---|---|---|
| POS01 | P0 | Create draft cart from appointment or walk-in; add service/product lines, responsible staff, quantity, discounts, taxes, tips and charges. Show itemized total before collecting money. |
| POS02 | P0 | Support split tenders, partial payment and remaining balance. Deposits link to one sale exactly once. A fully paid sale has applied tender equal to amount due; change is cash-only and separately recorded. |
| POS03 | P0 | Finalize immutable receipt with unique tenant sequence; amend through credit note/refund and replacement sale rather than overwriting finalized history. Voids apply only before settled financial posting or use explicit reversal. |
| POS04 | P0 | Cash and external bank/PayNow/card entries require method, actor and reference. Manual entry records a staff assertion and remains unverified until reconciled; never display provider-confirmed success based only on a browser screen. |
| PAY01 | P1 | Hosted/tokenized provider payment, verified signed webhooks, idempotent payment intents, status lookup and settlement reconciliation. Store provider references and masked descriptors only; never PAN or CVV. |
| PAY02 | P0 | Refund by line and original tender, amount capped at net refundable balance, with reason and role-based approval. Failed or pending provider refund remains pending; do not print a completed refund receipt prematurely. |
| PAY03 | P1 | Refund, dispute and chargeback events update financial status and reconciliation work queue; preserve original sale. Payout failure is a settlement problem and does not reverse a paid client's receipt. |
| PAY04 | P0 | Open/close register with float, cash in/out, expected cash, counted cash, variance and manager review. Every movement has reason and actor; no silent correction to force reconciliation. |
| PAY05 | P1 | Business wallet shows provider pending funds, available funds, fees, refunds, chargebacks and payout statuses. Bank changes require owner reauthentication and notification. No transfers or payout initiation without contracted provider support. |

### Credit packages memberships and gift cards

| ID | Priority | Requirement and acceptance |
|---|---|---|
| BEN01 | P1 | Client credit has append-only issue, redeem, restore, expire and authorized adjustment entries. Purchased and promotional credit are distinct lots with separate expiry/refund rules. No cash-out, peer transfer or cross-business spending. |
| BEN02 | P1 | Prepaid package defines eligible services, session counts, price, validity and allocated value per entitlement. Sell only after successful payment; reserve at appointment, consume at service completion and restore once on eligible cancellation/reversal. |
| BEN03 | P1 | Upfront membership defines term, service allowances and discount benefits. Purchased terms are immutable snapshots; pause/cancel/expire rules explicitly state whether benefits and expiry change. |
| BEN04 | P2 | Recurring membership requires provider mandate and explicit billing agreement, renewal schedule, retries, grace period, cancellation effective date and failed-payment notices. Renewals create one benefit period only after successful collection. |
| BEN05 | P1 | Gift cards have secure random code stored as a hash, masked display, face value, currency, activation payment, partial redemption, expiry if applicable and loss/reissue workflow. Prevent code guessing and double spending. |
| BEN06 | P1 | Default rule: gift-card and credit redemption only for eligible services and retail products; exclude buying another gift card, wallet top-up, package or membership. No stacking benefit redemptions for the same service unit. Owner-configured future exceptions require separate tests. |
| BEN07 | P1 | Gift-card-funded refunds restore original gift card credit, not cash; package-funded reversals restore entitlement and allocated liability as appropriate. Cash refunds of prepaid purchases require manager approval and supported rules; never pay more cash than the refundable original cash-funded amount. |

### Team marketing messaging and inventory

| ID | Priority | Requirement and acceptance |
|---|---|---|
| TEAM01 | P0 | Staff profile, service qualifications, shifts, breaks, leave and employment active dates. A leave change affecting appointments produces a conflict list requiring resolution. |
| TEAM02 | P1 | Attendance and timesheets with manager correction reason; staff see own hours. Salary, payroll deductions and statutory filing are outside launch. |
| TEAM03 | P2 | Versioned commission rules with eligible net sales, attribution, returns, thresholds, effective date and month lock. Refund after lock posts next-period adjustment; report is reviewable before payout. |
| MKT01 | P1 | Segments by visit recency, service, spend and lifecycle; consent filter applied at selection and send time. Exclude opted-out, invalid and suppressed contacts. Show audience count and cost estimate before authorization. |
| MKT02 | P1 | Campaign draft, approved, scheduled, sending, completed, paused and cancelled states; owner/marketer sends test before approval. Cap send rate and spend; global stop cancels unsent jobs. |
| MKT03 | P1 | Promotions have dates, location, service/product scope, minimum eligible spend, usage caps, code, stacking, exclusions and budget. Server recomputes eligibility at checkout. Expired or concurrently exhausted offers are rejected. |
| MKT04 | P1 | Report delivered, failed, unsubscribed, clicked and attributed purchases; define attribution window and avoid presenting attributed sales as proven incremental revenue. Open rates may be unreliable. |
| MSG01 | P1 | Internal threads with participants, unread state and permissions; separate client-facing inbox with assignment, status and delivery record. Internal notes cannot be sent as replies by mistake. |
| MSG02 | P1 | Two-way email via configured provider; SMS/WhatsApp P2 with approved numbers/templates and verified inbound webhooks. Pending/failed/sent/delivered are distinct; do not promise read receipts unless supplied. |
| INV01 | P0 | Product SKU, barcode, unit, tax, retail price, cost and location stock. Track receipt, sale, return, damage, consumption and adjustment as ledger movements. Block negative stock by default. |
| INV02 | P1 | Count stock with a snapshot, record count differences and approve adjustment; concurrent movements since snapshot are applied rather than overwritten. Low-stock threshold creates a task. |
| INV03 | P2 | Suppliers, purchase orders, partial receiving and location transfers; stock becomes available only at actual receipt. Transfer uses in-transit state and destination acknowledgement. |
| INV04 | P1 | Treatment consumables may use configurable per-service consumption with actual adjustment; avoid deducting both product sale and consumable use for the same unit. Returned items require sellable/damaged disposition. |

### Reports data and support

| ID | Priority | Requirement and acceptance |
|---|---|---|
| REP01 | P0 | Daily sales, refunds, taxes, discounts, tips, tender totals, unpaid balances and cash close; drilldown reaches receipt and payment records. All screens and exports use the same metric definitions. |
| REP02 | P1 | Service/staff performance, utilization, retention, no-show, rebooking, product margin, stock valuation, package usage, credit/gift-card liabilities and settlement reconciliation. Distinguish collections from earned revenue. |
| REP03 | P1 | Date, staff, service, location and channel filters; show business timezone, data freshness and whether date basis is sale, service, settlement or payout. Exports preserve these filters and permission scope. |
| DATA01 | P0 | Import opening appointments, clients, stock and balances from authorized exports only. Every opening liability has source reference and independent reconciliation; no scraping an authenticated competitor. |
| DATA02 | P1 | Owner can export standard data and request account closure. Apply retention holds to financial records while minimizing unrelated personal data; deletion workflow records outcome and legal/business retention rationale. |
| OPS01 | P0 | Audit actor, tenant, timestamp, action, object, correlation ID and redacted before/after changes; append-only storage permissions and restricted audit export. Secrets and card data never enter logs. |
| OPS02 | P1 | Support tickets, status page, documented severity and escalation, backups, restore drills, monitoring and incident communications. A queued job cannot use another tenant's credentials. |

## 5 Critical user journeys

**Book to paid visit:** receptionist finds or creates the correct client → chooses service → server validates practitioner and room → records policy → deposit if required → confirms reservation → reminder → arrival → practitioner completes → cashier checks final cart and benefits → collects remaining tender → finalizes receipt → records stock/benefit effects → invites rebooking according to consent and policy.

**Sell and redeem a package:** manager publishes a versioned package → client pays → issue entitlements and liability → booking reserves a session → completed treatment consumes it and recognizes allocated value → sale receipt shows prepaid redemption and any add-on tender → package usage and outstanding liability reconcile.

**Cancellation with deposit:** display policy snapshot and cancellation time → calculate proposed fee → authorized person confirms or waives with reason → cancel reservation → return benefit reservations → either retain eligible fee, refund original tender, or move to permitted client credit with explicit agreement → issue financial document and notification. Cancellation alone never fabricates a refund.

**Daily close:** reconcile actual cash, manual bank confirmations and provider captures → investigate pending payments → review refunds and liability movements → compare provider gross collections, fees, adjustments and payouts → sign close → lock period. Late events create traceable subsequent adjustments.

## 6 Financial and scheduling rules

1. Money is integer minor units with currency on every financial object. Use decimal rates, an explicit rounding algorithm, and allocate cart discounts proportionally with a deterministic residual-cent rule. Never use binary floating point for money. Maintain a balanced debit/credit financial subledger per currency; posted entries are immutable and corrections reference reversing entries.
2. Sale total = eligible line subtotals minus allocated discounts plus line tax plus approved charges plus tips. Inclusive tax is extracted, not added again. Document tax treatment for deposits, vouchers, prepaid services and cancellations with an accountant before live configuration; do not assume every prepaid instrument has identical tax timing.
3. Cash collected, sales booked, earned service value, tax, tips, processor fees and outstanding liabilities are separate measures. Financial reports are operational subledgers with accountant-reviewed export mappings; they are not certified statutory accounts.
4. Store-value and entitlement updates use database transactions, row locks or equivalent serializable constraints. A balance cannot go below zero; a session cannot be consumed twice. Reversal references the original entry and can run once only.
5. Appointment service intervals and buffers reserve both staff and equipment. Use half-open intervals [start, end) so adjacent appointments are valid when buffers permit. Server availability checks and insert commit atomically; return conflict with alternate slots.
6. Capture, refund, benefit issuance, stock decrement and notification processing are idempotent. On external timeout, query provider state before retrying. An uncertain payment must not trigger another charge.
7. Default promotion threshold uses eligible pre-tax merchandise/service amount after line discounts, excluding gift cards, prepaid purchases, tips and charges. One promotion per sale; package/membership-funded services do not also receive cart discounts by default. Publish these terms to staff and clients.
8. Refunds cannot exceed original paid tender less prior refunds; line quantities and values bound partial refunds. Fulfillment reversal, stock disposition and entitlement restoration are explicit separate decisions recorded together.
9. Tips are attributed separately and excluded from service revenue and commission by default. Team commission uses net eligible value after discounts and refunds, excluding tax, tips, stored-value issuance and deposits.
10. Released schedule time and money are separate: cancellation frees the slot immediately after commit while refund may remain pending. A late successful deposit on an expired hold enters an exception queue and is refunded or reassigned with authorized review; it cannot silently recreate a conflicting booking.

### Worked financial fixtures

Illustrative SGD fixtures use zero tax for arithmetic clarity, not a statement of the salon's tax status.

| Scenario | Expected result |
|---|---|
| Service 100, product 20, eligible discount 10, prior deposit 30, gift card 40 | Sale total 110; remaining new tender 40; deposit applied once; gift card liability falls 40 |
| Package 5 visits sold for 400, equal allocation | Initial liability 400; one visit consumes 1 entitlement and recognizes 80; remaining 4 visits and liability 320 |
| Gift card 100 sold and 30 redeemed | Collections at issue 100; initial liability 100; redemption reduces liability to 70 and funds 30 of eligible sale |
| Gift-card-funded sale 30 reversed | Restore 30 to that card once; cash refund zero; original sale retained with reversal link |
| Cash float 100, cash receipts 250, cash refunds 20, approved cash-out 10 | Expected drawer 320; count 315 produces variance minus 5, requiring review |

## 7 Information architecture and UX

Staff navigation: Today, Calendar, Clients, Sales, Team, Services, Products, Benefits, Marketing, Inbox, Reports and Settings. Finance views include Transactions, Settlements, Liabilities and Registers. Platform Billing is under Settings and must never be mixed with client checkout.

Client navigation: Book, My appointments, My benefits, Receipts and Preferences. Verify identity for account data; a public booking link must not expose client search. Provide keyboard operation, visible focus, meaningful labels and sufficient contrast, targeting WCAG 2.2 AA. Calendar actions must also work without dragging. Money confirmation dialogs show amount, recipient, method and effect on benefits. Failed operations show a clear next action and preserve draft input. Do not label an unimplemented button as functional.

Responsive targets: desktop reception workstation, tablet front desk, mobile staff and client browser. Core flows work at 360px viewport width and 200 percent zoom. Payment and booking submit controls guard repeated taps while preserving safe retry behavior.

## 8 Proposed technical architecture

Recommendation, not a verified existing stack: TypeScript web frontend with server-rendered public booking and authenticated staff console; modular backend application; PostgreSQL as system of record; durable job queue and transactional outbox; private object storage for scanned attachments; provider adapters for payment and messaging. A modular monolith reduces deployment and transaction complexity for a solo founder. Use managed identity or a maintained authentication library, not homemade password storage.

Modules: identity/tenancy, catalog, scheduling, CRM, POS, payment orchestration, benefits ledger, inventory, team, campaigns, messaging, reporting, platform billing and audit. The public browser never receives database admin credentials or provider secrets. Provider webhooks terminate in a verified intake endpoint, persist raw event metadata with sensitive-field minimization, deduplicate and process asynchronously.

Use tenant_id throughout and location_id where applicable, composite foreign keys to prevent cross-tenant relationships, database row-level security where supported, explicit application authorization and automated cross-tenant tests. Request tenant context comes from authenticated membership, not a trusted user-supplied tenant header. Scheduled jobs carry tenant scope and retrieve the correct scoped integration credentials.

### Core data model

| Domain | Tables or aggregates | Key constraints |
|---|---|---|
| Identity | Tenant, Location, User, Membership, Role, Permission, Invitation, Session | Unique membership; scoped location grants |
| Catalog | Service, ServiceVersion, Variant, Resource, StaffSkill, BookingPolicyVersion | Historical snapshots immutable |
| Scheduling | Shift, Leave, Appointment, AppointmentItem, Reservation, Waitlist | Transactional staff/resource exclusion; version number |
| CRM | Client, Contact, ConsentEvent, Note, Attachment, ImportBatch, MergeRecord | Separate identities despite shared contacts |
| Commerce | Sale, SaleLine, TaxSnapshot, Payment, TenderAllocation, Refund, CreditNote, RegisterSession | Currency consistency; unique receipt; bounded refunds |
| Benefits | BenefitDefinitionVersion, BenefitPurchase, Entitlement, CreditLot, GiftCard, BenefitLedgerEntry | One event key; no negative balance; original-entry reversal |
| Inventory | Product, Supplier, PurchaseOrder, StockMovement, StockCount, Transfer | Quantity ledger; explicit units and location |
| Engagement | Segment, Campaign, Promotion, Redemption, Conversation, Message, DeliveryAttempt | Consent checks and unique send keys |
| Finance | Settlement, Payout, ReconciliationMatch, PeriodClose, PlatformSubscription, PlatformInvoice | Merchant/customer money separated |
| Controls | AuditEvent, ProviderEvent, OutboxEvent, JobAttempt, SupportAccessGrant | Tenant scope; append-only events; dedupe keys |

All mutable records carry created_at, updated_at and version. Financial entries carry effective_at, recorded_at, source ID and actor. Store UTC timestamps plus business timezone for interpretation; retain currency and tax policy version. Never delete ledger history to fix a balance.

### Representative API contracts

| Endpoint | Input/output and control |
|---|---|
| POST /v1/appointments | Client, service versions, staff/resource allocations, start time, expected quote; Idempotency-Key; returns reservation or 409 conflict |
| PATCH /v1/appointments/{id} | Version and permitted transition; requires If-Match; 409 on stale edit |
| GET /v1/availability | Service, date range and optional practitioner; returns server-calculated candidates and quote expiry |
| POST /v1/sales | Draft creation; snapshot lines and prices; validate tenant ownership |
| POST /v1/sales/{id}/payments | Amount, allowed method and idempotency key; returns pending/succeeded/failed, never assumed success |
| POST /v1/sales/{id}/finalize | Expected version; verify totals, payment allocations, stock and benefit effects transactionally |
| POST /v1/refunds | Original payment/line references, amount, reason and approval; asynchronous provider status |
| POST /v1/benefits/redeem | Purchase/credit lot, sale or service reference; authenticated staff; unique redemption key |
| POST /v1/campaigns/{id}/approve | Audience preview version, channel, budget and schedule; restrict approver role |
| POST /v1/imports/{id}/commit | Approved mapping and validated file checksum; repeat-safe batches |
| POST /v1/webhooks/{provider} | Signature and replay validation, event deduplication; no browser authentication substitute |
| GET /v1/reports/{type} | Authorized filters, metric version, data watermark and pagination; export via scoped signed download |

Standard errors include code, safe message, correlation ID and field errors. Use 403 for unauthorized actions, 409 for stale/conflicting state, 422 for invalid rules and 429 for rate limits. Do not include another tenant's object details in errors.

## 9 Nonfunctional requirements

| Area | Proposed launch acceptance target |
|---|---|
| Performance | p95 ordinary reads under 800ms and writes under 1.5s excluding external provider latency, at 50 concurrent staff sessions and 100 public booking sessions on production-sized test infrastructure |
| Availability | 99.9 percent monthly service objective; disclose maintenance policy and monitor critical booking/checkout success |
| Recovery | Database RPO at most 15 minutes and RTO at most four hours, demonstrated by isolated restore drill before launch; payment events replayable |
| Security | TLS, encryption at rest, scoped secrets, owner MFA, session controls, least privilege, dependency scanning and no unresolved critical/high exploitable findings at launch |
| Privacy | Purpose-based collection, consent provenance, access/correction process, retention configuration, restricted notes and documented cross-border vendor review |
| Data integrity | Zero duplicate ledger effects under retry/concurrency tests; zero cross-tenant reads/writes in test matrix |
| Observability | Structured logs, latency/error metrics, job lag, failed delivery, payment mismatch and backup alerts with named responder |
| Accessibility | Core booking/checkout/client flows pass keyboard, screen-reader smoke tests, contrast and mobile layout review |
| Operational resilience | On outage, follow documented manual appointment and payment log procedure; no unsynchronized offline card charging or local browser financial queue at launch |

These are engineering targets requiring measured evidence, not promised service levels in an unsigned customer contract.

## 10 Reporting definitions

| Metric | Required definition |
|---|---|
| Net service/product sales | Finalized eligible line value after discounts and returns, excluding tax and tips, grouped by sale date unless explicitly labelled otherwise |
| Collections | Captured or verified tender inflows less tender refunds; show unverified manual entries separately |
| Earned prepaid value | Allocated package/membership value recognized on eligible completed service; exclude original prepaid issuance from this measure |
| Outstanding prepaid liability | Opening balance plus new funded issuance minus allocated consumption/redemption, refunds and policy-authorized expiry; reconcile by instrument |
| Utilization | Occupied service time divided by rostered bookable time excluding approved breaks and leave; show buffers separately and state whether included |
| No-show rate | No-show appointments divided by appointments due in the period excluding cancelled appointments; use appointment date |
| Rebooking | Completed clients with a subsequent confirmed appointment within configured window divided by eligible completed clients; report window |
| Retention | Clients returning within a stated cohort window; never compare immature cohorts to fully elapsed cohorts |
| Staff performance | Net attributed service value, completed visits, utilization and rebooking; commissions are a separate versioned calculation |
| Stock value | Quantity on hand times documented weighted-average cost; show retail value separately; exclude in-transit stock from available quantity |

## 11 Integrations and cost controls

Provider choices are unresolved implementation decisions: payment acquiring, email, optional SMS/WhatsApp, managed hosting, identity and accounting export destination. Select by Singapore availability, supported refund/recurring flows, fees, webhook reliability, data handling and support. Do not assume Fresha wallet or customer data APIs exist or are licensed. Use authorized CSV migration first.

Separate sandbox and production keys/accounts. No real charges or marketing sends during UAT. Owner must supply business verification, payout details and approved public policies before enabling live payment. Messaging requires verified sending domain, SPF/DKIM/DMARC configuration and suppression handling. Restrict campaign spend with tenant budgets and provider alerts.

Provide an estimate worksheet, not invented provider quotes: monthly fixed platform hosting/database/monitoring + storage + email count times rate + SMS/WhatsApp count times regional rate + payment volume times percentage fee + transaction count times fixed fee + support costs. Log actual spend and alert at 50/80/100 percent of owner-approved budget. No budget has been confirmed for SalonOS.

## 12 Migration and cutover

1. Inventory source exports and ownership rights; define authoritative source and freeze timestamp.
2. Map client identities, staff, catalog, appointments, stock and each outstanding prepaid instrument; retain external IDs.
3. Dry-run in staging with non-production communications and payment disabled; compare row counts, rejected rows, future bookings, stock quantities and liability totals.
4. Owner resolves duplicates and confirms any consent provenance; imported unknown consent stays unknown.
5. Conduct rehearsal and role training; verify rollback exports and restore procedures.
6. Freeze source writes, capture final delta, import with batch idempotency, and obtain signed reconciliation by owner/finance.
7. Enable booking link and production provider only after go/no-go gates. Keep the prior system read-only where contractually possible.
8. If cutover fails before accepting new business, revert to prior scheduling source. After transactions exist, reconcile/export new activity and execute controlled forward recovery; never erase captured payments by restoring an old database blindly.

## 13 Proposed implementation sequence

Indicative solo-founder plan: 16–22 weeks plus external approval lead times, assuming experienced full-time implementation and managed services. This is an estimate, not a committed delivery date. Re-estimate after provider selection and scheduling/ledger spikes; recurring billing and multi-location add scope.

| Phase | Indicative duration | Deliverable and dependency |
|---|---|---|
| Discovery and spikes | 1–2 weeks | Confirm pilot policies, wireframes, source exports, payment/provider feasibility, concurrency and ledger design |
| Foundation | 2 weeks | R0 identity, tenant boundaries, audit, CI, environments, restore foundation |
| Core operations | 3–4 weeks | Catalog, roster, clients and transactional scheduling; needs approved calendar model |
| Commerce | 3–4 weeks | POS, tender, refunds, register, inventory and ledger; needs accountant-reviewed rules |
| Business launch features | 4–5 weeks | Hosted booking/payment, benefits, campaigns, inbox, billing and reports; needs provider onboarding |
| Migration and hardening | 2–3 weeks | Import rehearsal, accessibility, load/security tests, training and supervised pilot |
| Stabilization | 1–2 weeks | Resolve pilot issues and sign launch evidence |

Suggested delivery workstreams: product/UX owns rules and manual; booking/CRM owns availability and clients; commerce owns tender/benefits/stock; operations owns staff/engagement/reporting; platform/QA owns identity, security, CI and release evidence. Parallel implementation requires shared schema contracts and one coordinating backlog owner. Research agents used for this document are not deployed application workers.

## 14 UAT and launch gate

Every test records environment/build, fixture IDs, actor/role, expected and actual result, evidence and reviewer. All P0 and P1 requirements must have linked passing tests before the full launch. P2 controls are tested before enabling their feature flag.

| Test | Scenario | Required outcome |
|---|---|---|
| U01 | Two people reserve same practitioner and room at once | One succeeds, one receives conflict, no overlapping confirmed reservation |
| U02 | Staff on leave or unqualified; buffer overlap | No invalid slot offered or committed |
| U03 | Edit service price after booking | Existing quote remains intact; authorized repricing is explicit |
| U04 | Double tap checkout; duplicate and out-of-order provider events | One payment effect, one sale posting, one receipt and stock effect |
| U05 | Browser timeout after successful capture | Status reconciliation finds capture; no second charge |
| U06 | Deposit plus split cash and gift-card tender | Exact balance due; no repeated deposit application |
| U07 | Two checkouts redeem last gift-card balance/session | One succeeds; other fails cleanly; no negative balance |
| U08 | Partial refund then duplicate refund retry | Refund capped and one reversal; original receipt retained |
| U09 | Failed/pending provider refund and payout failure | Status remains accurate; queue raised; paid receipt unaffected by payout failure |
| U10 | Buy package and redeem first visit | Cash collections and earned value separated; liability and sessions reconcile |
| U11 | Cancel appointment with package reservation | Reservation restored once; fee/refund handled independently |
| U12 | Refund retail item damaged versus sellable | Correct refund and chosen stock disposition; no unintended restock |
| U13 | Opt out after campaign scheduled | Unsent message suppressed; consent audit preserved |
| U14 | Receptionist requests restricted note, export or payout change | Server denies action and records safe audit event |
| U15 | Tenant A guesses tenant B object IDs and export URLs | No data disclosed or mutated; tenant isolation proven |
| U16 | Import repeated; family shares one phone | No duplicate commit; profiles not silently merged |
| U17 | Stock count concurrent with product sale | Count reconciles intervening movement without erasing sale |
| U18 | Daily cash fixture plus provider fee/payout reconciliation | Cash variance surfaced; gross captures/fees/refunds/payouts explain settlement |
| U19 | Restore backup and replay queued events in isolated environment | RPO/RTO demonstrated; no duplicate or live external send/charge |
| U20 | Expired hold receives late payment success | Exception queue; no conflicting booking; refund/reassignment controlled |
| U21 | Keyboard/mobile booking and checkout | Complete without drag-only controls or clipped totals |
| U22 | Closed period receives late refund | Audited subsequent adjustment; closed report does not silently change |
| U23 | Platform subscription fails | Grace-period notices and owner export access follow configured contract; customer funds unaffected |
| U24 | Promotion minimum 150 with excluded package lines | Only eligible spend qualifies; exact threshold and caps enforced |
| U25 | Recurring payment duplicate success and later failure event | When R3 enabled, one benefit period issued and authoritative provider state reconciled |

Launch requires owner sign-off on policies, finance reconciliation, staff UAT, approved privacy/customer terms, provider production verification, security review, successful restore drill, monitoring responder, support procedure and zero unresolved critical defects. High-severity integrity/security defects block release. Maintain a known-issues register with scope and mitigation; never waive a double-charge or cross-tenant exposure.

## 15 Backlog and definition of done

The companion JSON is a requirement-level starting backlog, not a claim that detailed sprint stories already exist. Split each requirement into UI, API, database, authorization, error handling, audit, migration and test tasks as applicable. Definition of done: reviewed implementation; schema migration and rollback/forward-recovery plan; appropriate unit/integration/end-to-end tests; accessibility checks; observable failures; updated manual; staging demonstration; mapped acceptance evidence; no secrets in code.

## 16 Owner decisions before implementation freeze

Confirm pilot business and location; first-launch payment methods and acquiring provider; GST registration and accountant-approved tax treatment; refund and cancellation rules; prepaid validity/expiry/transfer policy; membership billing model; required messaging channels; commission rules; staff access to treatment notes; migration export availability; retention schedule; budget; subscription pricing and support hours. Defaults in this PRD allow design to progress but do not authorize production charges, sends or data migration.

## 17 Business readiness evidence register

Required artifacts at release: approved PRD version, role matrix, data dictionary, API specification, tested financial fixtures, provider contracts/configuration, migration reconciliation, UAT evidence, security findings, backup restore report, incident runbook, customer-facing terms, privacy notice, training attendance and owner release sign-off. Current state for all implementation evidence is NOT YET PRODUCED. This package supplies requirements, planned UAT and operating instructions only.

## 18 Research references and interpretation

Reviewed 3 November 2026. The Fresha help-center taxonomy informed module coverage; SalonOS state machines, formulas, priorities, architecture and defaults are proposed original design decisions. Help pages can vary by product version or region. Do not interpret references as Fresha API availability or endorsement.

| Reference | Learning used |
|---|---|
| https://www.fresha.com/help-center/knowledge-base | Operational module coverage |
| https://www.fresha.com/help-center/knowledge-base/sales | Checkout workflow categories including tender and register handling |
| https://www.fresha.com/help-center/knowledge-base/memberships-packages-and-gift-cards | Distinct benefit product families |
| https://www.fresha.com/help-center/knowledge-base/privacy-and-security | Card-data protection and consent as explicit controls |
| https://www.fresha.com/help-center/knowledge-base/calendar | Booking, availability and notification research |
| https://www.fresha.com/help-center/knowledge-base/team/100687-create-permission-roles | Scoped role permissions research |
| https://www.fresha.com/help-center/knowledge-base/marketing | Campaign and promotion workflow coverage |
| https://sso.agc.gov.sg/Act/PDPA2012 | Singapore data-protection baseline for purpose, security, retention and overseas transfer review |

The Singapore privacy requirements here are implementation review topics, not a compliance certification. Obtain current business-specific review of retention, marketing channels, customer terms and tax treatment before production.
