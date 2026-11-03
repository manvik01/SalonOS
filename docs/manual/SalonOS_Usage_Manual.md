# SalonOS Usage Manual

Version 1.0 · 3 November 2026 · Status: proposed operating procedures

Related documents: [PRD](../product/SalonOS_PRD.md) · [MVP](../product/SalonOS_MVP.md) · [operating model](../delivery/SalonOS_Virtual_Product_Delivery_Team.md)

This manual describes the intended application defined in SalonOS PRD 1.0. Navigation names are proposed, and all procedures are currently UNVERIFIED AGAINST A BUILD. They become verified only after QA records the tested commit and evidence. R1 is a controlled pilot; R2 is the business launch; R3 features must remain hidden or clearly unavailable until delivered. Never train staff to rely on an unbuilt payment or messaging function.

## 1 Access and roles

Use your own invited account, never a shared owner login. Owner manages policies, access and billing; manager operates the location; reception handles bookings and permitted checkout; practitioner sees assigned work; finance handles reconciliation; marketer sees consented audiences; inventory clerk handles stock. If a menu is missing, ask the owner to review your role rather than borrowing credentials. Owner enables MFA and retains recovery codes securely.

## 2 Owner setup

Prerequisite: confirmed legal/contact details, tax treatment, service prices, roster, booking policy and owner-approved payment methods.

1. Open Settings → Business. Enter legal and trading name, registration/contact details, business timezone and currency.
2. Add the pilot location, opening hours, closures and rooms/equipment under Settings → Locations and Resources.
3. Set tax status and accountant-reviewed rates/treatment. Do not enable a tax registration merely because a template contains one.
4. Under Settings → Booking, set notice, booking horizon, cancellation cutoff, deposit and refund policy. Preview the terms shown to a client.
5. Add services and qualified team members, then publish their shifts. Verify that staff and resources constrain availability.
6. Configure receipt identity and payment methods. Keep integrations in test mode until approved production activation.
7. Import authorized data using the preview process in section 6. Confirm opening credit/package balances independently.
8. Complete a test booking, checkout, refund, register close and report drilldown. Verify permissions using staff accounts.
9. Owner approves activation only after the PRD launch gates pass. Public booking, payment and campaigns have separate enable controls.

Expected result: workspace validation shows complete configuration and a recorded activation decision. If incomplete, use the missing-item list; do not bypass the gate.

## 3 Create and maintain the service menu

Role: manager/owner. Open Services → Add service. Choose category, name, description, price type, variant, duration and cleanup buffer. Assign eligible practitioners, room/equipment, tax category and online visibility. Set booking/deposit overrides only when needed. Preview client price and available time, then publish.

For a manicure with different durations, create variants rather than vague notes. A bundle combines services in a visit; a prepaid package creates future entitlements and is managed under Benefits. A “from” price must display that qualification before booking. Archive discontinued services instead of deleting them. Existing appointments keep their original price/duration snapshot; use an explicit approved change when repricing.

R1 does not support parallel processing, group or recurring scheduling. Do not enter unsupported overlaps as a workaround.

## 4 Team and roster

Role: owner/manager. Team → Add member → enter profile → set location and service qualifications → choose bookable status separately from login access → assign least-privilege role → create shifts/breaks → invite user if login is needed.

Team → Schedule → select week → apply shifts → add breaks and leave → review conflict list → resolve affected appointments with reception/client → publish. A leave approval must not silently cancel bookings. When a team member leaves, deactivate access immediately, reassign future appointments/inbox work, archive profile and preserve historical attribution. Confirm their old session can no longer access the workspace.

Timesheets are available at R2; advanced commission calculations are R3. Approved exports are review documents, not proof that payroll has been paid or statutory filings completed.

## 5 Calendar daily work

### Book a visit

Role: reception/manager. Calendar → New appointment → select client or create a separate profile → choose service/variant → select eligible practitioner and resource → choose offered time → review duration, price and policy → collect required deposit if enabled → confirm. For multi-service visits, check each sequential allocation. Read the final confirmation reference before telling the client it is booked.

If the slot becomes unavailable, the server returns a conflict; choose a refreshed time. Do not retry payment blindly. A payment marked pending requires transaction-status lookup and finance review if unresolved.

### Arrival and treatment

Open appointment → Arrived → practitioner verifies client and permitted notes → In service → Completed when treatment is actually finished. Completion is not payment confirmation. At checkout verify whether the service uses a package allowance and whether extra products or services are due.

### Reschedule or cancel

Open appointment → Reschedule → choose valid time → review changed staff/resources and notification → save. If save fails, verify the original slot remains reserved. For cancellation/no-show, choose reason and inspect the accepted policy. Decide fee, deposit refund/retention and benefit restoration separately, with required approval. Check actual refund status before promising the client the refund is completed.

### Waitlist

R2: Calendar → Waitlist → record service, staff preference, times and permitted contact method. When capacity opens, send an expiring offer. An offer is not a reservation until confirmed. Do not verbally guarantee one slot to multiple clients.

## 6 Client database and import

Clients → Search using normalized contact or name. Check identity before editing history. Shared family contacts do not establish that two profiles are duplicates. Use Clients → Duplicate review only with authorized approval; select survivor and field choices, inspect balances/history and confirm merge once.

For import: Settings → Data import → upload authorized CSV → map columns → review normalized fields, duplicates, accepted/rejected/skipped totals and consent provenance → correct errors → owner confirms commit. Record batch reference and compare expected totals. Unknown consent stays unknown. Do not repeatedly upload files to repair a partial result without checking batch status.

Practitioners record treatment notes only in restricted fields. Do not place sensitive health details in a calendar title or general team message. Access/correction/deletion requests go through the owner’s privacy process; financial retention may limit deletion, and the outcome must be explained and recorded.

R2 consultation forms: Clients → profile → Forms → select the service-required form version → client completes required fields and consent → practitioner reviews before treatment. Preserve the submitted version. If required consent is missing, pause treatment and follow the authorized exception policy rather than editing the submitted response.

## 7 Checkout and receipts

Role: reception/manager within limits. Calendar → appointment → Checkout, or Sales → New sale for walk-in retail.

1. Verify client, service providers, products and quantities.
2. Review original service snapshot, any approved repricing, discount eligibility, taxes, tips and charges.
3. Apply linked deposit once. Select eligible package session, membership allowance or gift/client credit where available.
4. Review amount remaining; choose cash, verified integrated payment or permitted external method. Use Split payment for multiple tenders.
5. For external PayNow/bank/card entry, record reference and verify actual receipt according to the salon’s process. A staff-entered record is not provider verification.
6. Wait for confirmed payment state. If partial payment is permitted, save the receivable and tell the client the remaining balance.
7. Finalize once. Check receipt number and payment allocations; print/email or resend later. Failed receipt delivery does not justify recollecting payment.

Example with zero tax for illustration: service 100 + product 20 − discount 10 = 110. Deposit 30 and gift-card redemption 40 leave 40 in new tender. The receipt must show all allocations. A finalized commercial record is corrected with linked reversal/credit note, not overwritten.

## 8 Refunds and payment uncertainty

Role: manager/finance or authorized cashier. Sales → original sale → Refund → choose line/quantity and reason → select return condition and restock decision → review tax/discount allocation and original tenders → obtain approval → submit → inspect pending/succeeded/failed result.

Gift-card-funded value returns to the original gift card under the default policy. Package reversals restore eligible entitlement/value once. Refund does not automatically cancel future appointments or recurring membership. Tell the client the actual provider status and expected provider timing without inventing settlement dates.

If checkout times out, stop repeated collection. Find original payment reference, query status, and route unresolved cases to finance. A successful charge with failed local receipt finalization is a recoverable exception; do not create a second sale and charge to make the screen appear correct.

## 9 Packages and memberships

R2: Benefits → Packages → Create. Define eligible services, number of sessions, price, allocated values, activation, validity, cancellation rules and published terms. At sale, select client, explain terms, collect payment and verify issuance. At booking reserve an allowance; at actual service completion consume it. Paid extras remain due at checkout. Cancellation restores reserved allowance where policy permits.

Benefits → Memberships → Create upfront plan. Specify term and allowances/discounts. Sold terms remain unchanged when the template later changes. For pause/cancel, review effects on validity and benefits before confirming.

R3 recurring plans additionally require explicit mandate, cycle price, renewal schedule, failure retries and cancellation effective date. A failed renewal is not a successful paid period. Check status and collection history before promising benefits. Cancellation and refund are separate actions.

## 10 Gift cards and client credit

R2: Sales → New sale → Gift card → choose value, permitted validity and recipient → review terms → collect payment → issue after success. Keep the code private; do not paste it into team chats. At redemption verify code through the protected form, apply permitted amount and collect remainder.

Default exclusions: buying another gift card, credit top-up, package or membership using gift/credit tender. Balances are salon-limited, not withdrawable bank funds. Purchased credit and goodwill credit have separate rules. For lost cards use authorized reissue; never simply issue a second funded balance. Balance adjustments require permission, reason and audit record.

## 11 Products and inventory

Products → Add → enter SKU/barcode, retail/internal-use flag, unit, selling price, tax, cost and reorder threshold. Record opening stock as an approved movement.

R1 receipts/adjustments: Products → Stock movements → choose product/location → record actual receipt, damage, consumption or authorized adjustment → enter reference and reason. Retail sales reduce stock once. A returned item is restocked only if chosen sellable.

R2 count: Products → Stock count → begin snapshot → count units → review intervening sales/receipts → approve differences → confirm movement log. Do not overwrite the quantity to hide a mismatch.

R3 purchase orders/transfers: receive actual partial quantities against the order; repeated receive action must not add stock twice. Transferred stock is in transit until acknowledged at destination, not available at both places.

## 12 Promotions and campaigns

Role: marketer/manager with approval. Marketing → Promotions → define eligible items, exclusions, threshold, discount, dates, usage caps and stacking → test qualifying and nonqualifying baskets → publish.

Example: 20 off minimum 150 eligible service spend, packages excluded. At 149.99 no discount; at 150 discount 20. A package line does not contribute to the threshold. Tax and threshold basis must match published terms.

Marketing → Campaigns → choose consented segment → draft content and valid offer → preview audience exclusions and cost → send internal test → authorized approval/schedule → monitor failures, opt-outs and attributed sales. Check consent at actual send time. Stop cancels unsent jobs, not already delivered messages. Do not upload personal contact lists as implied marketing consent.

Email launches at R2; SMS/WhatsApp only after R3 connector activation and sender approval. Reports label attribution window; attributed revenue is not proof the campaign caused incremental sales.

## 13 Internal and client messaging

Inbox → Client conversations → confirm client/channel → read context → select External reply → check recipient/content → send → inspect delivery status → assign follow-up or resolve. Use a distinct Internal note action for staff-only discussion. Never type sensitive staff notes into a client reply draft.

Team channels/direct messages have participant and location restrictions. Attachments must be permitted and scanned. Sent, delivered, failed and read are different states; do not tell a client a message was delivered when only queued.

## 14 Registers wallets and daily close

At opening, Sales → Registers → Open → count float and record actor. Record every cash in/out with a reason.

At close, Reports → Daily close → select location/date → review finalized sales, receivables, pending payments and refunds → verify manual bank entries against actual receipts → count cash → compare expected → explain variance → manager approves → export and lock.

Example: float 100 + receipts 250 − refunds 20 − approved cash-out 10 = expected cash 320. Count 315 means variance −5; record it rather than changing receipts.

Payments → Settlements shows processor-managed balances only. Reconcile gross captures − refunds − fees ± adjustments against settlement/payout records; payouts may occur on a later date. Do not include cash in provider available balance. Owner-only bank changes require reauthentication. Client credit balances are liabilities, not the salon’s withdrawable wallet.

## 15 Reporting and management rhythm

Reports → choose metric → select period, location and staff → check timezone, date basis and freshness → drill into exceptions → export authorized view. Sales, collections, earned prepaid value and payout totals answer different questions.

Daily: bookings/no-shows, cash/tender close, pending payments, refunds, delivery failures and low stock. Weekly: net service/retail value, staff utilization, rebooking, campaign results, credit/package usage and unresolved balances. Monthly: provider/bank reconciliation, prepaid liability roll-forward, stock valuation, approved earnings, platform fees and locked-period export.

For a five-visit package sold at 400 with equal allocation, the first completed visit recognizes 80 and leaves liability 320 and four visits. Do not count package sale and redemption as two cash collections. Staff performance uses actual allocated service minutes/value, not the entire multi-staff appointment for each practitioner.

## 16 Workspace subscription billing

Owner: Settings → Billing → view platform plan, seats/add-ons, usage, fee estimate and invoices. Review price/effective date before approving a change. SalonOS invoices here are distinct from salon receipts to clients. On failed platform charge, follow billing notices/grace policy; never delete business records to resolve a subscription issue.

## 17 Troubleshooting

| Problem | Action |
|---|---|
| No appointment slots | Check location hours, staff shift/skills, leave, resource occupancy, duration/buffers and booking notice/horizon |
| Payment result unknown | Stop new charge attempts; look up original reference and escalate pending state |
| Gift/session unavailable | Check activation payment, expiry, eligible item, reservation and ledger history; do not force balance |
| Discount not applied | Check dates, eligible threshold, exclusions, cap and stacking; test against published rule |
| Message failed | Check recipient/channel/provider status; retry only failed operation through the tracked workflow |
| Report differs from bank | Compare date basis, manual verification, settlement delays, fees, refunds and prepaid issuance/redemption |
| Staff cannot access feature | Owner reviews role/location scope; never share another account |
| Stock differs | Inspect movement/count history and intervening sales; approve explicit adjustment |
| Suspected data exposure | Stop affected workflow, restrict access, notify owner/security responder and preserve evidence without copying sensitive data into public tickets |
| Service outage | Follow approved manual log for appointments and verified payments; after recovery reconcile each external reference before entry; never blindly replay charges |

## 18 Training and operational handoff

Reception practices booking, rescheduling, deposit/split checkout and pending payment handling. Practitioner practices assigned-client access, treatment completion and confidential notes. Manager practices refunds, roster conflicts, stock count and daily close. Marketer practices test campaign, opt-out and promotion boundaries. Owner/finance practices liability reconciliation, access revocation, billing and incident escalation.

Record trainee, role, test build, date, result and reviewer. QA must verify instructions against the released build and replace planned screenshots with sanitized actual screenshots only when available. Handoff is complete when staff can perform their workflows, support contacts are confirmed, and the owner accepts the release evidence.
