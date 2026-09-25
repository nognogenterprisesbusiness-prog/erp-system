# Package 3 web-scope coverage — 2026-09-25

This is an implementation audit, not client sign-off or a production acceptance certificate. The README checkboxes remain open until the connected database, role policies, and end-to-end transactions are tested. Android/iOS and deployment are deferred by the current instruction.

| Confirmed need | Connected web code | Local demo preview | Remaining acceptance gap |
|---|---|---|---|
| Responsive ERP and portable contracts | Next.js web and typed domain package | Responsive role-switched preview | Real-account browser UAT and connected migrations |
| Project setup, dates, progress, expenses, billing and reports | Project, progress, costs, billing and daily-report routes | Projects and daily reports; material plan now editable | Demo finance/progress parity; connected transaction tests |
| Material use, remaining stock and project cost | Request fulfillment, site balance and weighted-average consumption migrations | Request → dispatch → receive → use, with illustrative cost | Actual opening-value reconciliation and database cost tests |
| Consumables versus fixed/reusable items | Material kind and separate asset registries | Materials and equipment separated | Reusable material custody is **not implemented**; current posting deliberately blocks reusable items |
| Equipment/vehicles separate from materials | Registries, asset events and handover path | Equipment registry and handovers | Connected handover/RLS tests; demo usage-hour/cost preview |
| Multiple warehouses and project-site stock | Location-scoped inventory and transfers | Multiple warehouses, site balances and selector | Real two-warehouse/two-site reconciliation and permission tests |
| Site-staff requests and warehouse issue/receipt | Material and equipment request routes/commands | Engineer/foreman request; warehouse and admin transitions | Staging role, concurrency, retry and partial-fulfillment tests |
| Request, release, receipt, consumption, return and transfer history | Ledgers, stock-card and request detail | Material request and equipment histories; stock-in audit | Demo return/transfer parity; connected ledger reconciliation |
| Shortage before request/procurement | Project material-plan and PO prefill routes | Project modal now calculates need and prefills staff request | Demo PO/receipt path; connected shortage under concurrent reservations |
| Supplier purchase and historical prices | Dated prices, POs and receipt-linked purchase history | Append-only dated quotes; no local PO posting | Connected PO receipts in staging and local procurement preview |
| Employee attendance, rates and labor cost | Attendance/rate/cost commands | Worker persona and personal attendance | Local hours/rates/cost preview; connected role and overlap tests |
| Equipment assignment, hours and costs | Requests, usage/rate/cost commands and detail history | Handovers and asset history | Local usage/rate preview; connected overlap and cost tests |
| Daily reports and project transactions | Report review, progress and cost pages | Report submission/list and material transactions | Explicit links from approved reports to posted material/labor/equipment entries without double-posting |
| QR identification | Registry, printing and permission-scoped scan routes | Generated labels and preview | Authenticated scan/permission tests against staging |
| Role-scoped visibility | Auth, membership and RLS migrations | Role-switched local access checks | Real-account negative RLS/export/Storage tests |
| Package 1–3 web extras | POs, dashboards, low-stock alerts, PDF/XLSX, notifications and audit routes | Dashboard, local notices and audit; finance/procurement partial | Scheduled notification processing, exports, finance postings and recovery tests in staging |

The current local demo is for interface and workflow review; its monetary figures do not establish live weighted-average valuation or profit. New connected migrations remain unapplied because no isolated staging database is available. See [web release readiness](web-release-readiness.md) for the release gate.
