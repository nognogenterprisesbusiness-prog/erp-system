# Notification and record-navigation review — 2026-11-12

## Findings and refinements

- Notification subjects and bell entries led to a full detail page containing a second generic link. Replaced these with compact mail-style previews. The inbox has one View action per notification; the bell row opens that same preview on the current screen.
- Kept explicit Mark as read and existing ownership/RLS commands. Previewing alone does not mark a message read. Existing notification detail URLs validate access then redirect to the inbox preview. Time remains labelled PHT.
- Related-record buttons name the destination, such as View daily report. Preview dismissal precedes navigation, preventing stale notification dialogs behind a record panel.
- QR labels, supplier quotations and purchase approvals lacked contextual panels. Their route adapters now reuse canonical content and guards, preserving direct URLs.
- Quotations had a small reference link and a separate Use quote action. One View-only button or one three-dot View/Use quote menu now follows the app's action rule.
- Purchasing duplicate number shortcuts were removed where a row action already opens the same purchase. Supplier payment rows now have a clear View column instead of a small purchase-number link. Purchase source context, QR history and pagination now use standard buttons. Rename and Use quote have matching menu icons. QR registry View and Print now share one three-dot menu; inactive labels expose only View. Opening Details from the QR preview closes it before the contextual panel opens.
- Reviewed source page action/disclosure placements. Remaining disclosures are read-only request, supplier-price, report-revision and technical audit history. Main project, inventory, purchasing and payroll workspaces remain full screens. Route/edit compatibility URLs are retained; removing them would break bookmarks.

## Verification

TypeScript, lint, production build and 175 tests, including notification destination and unsupported/missing-entity checks. Desktop browser checks cover inbox preview, bell preview retaining Dashboard URL, related daily-report drawer, 390px preview layout, and QR menu → preview → contextual details with the previous dialog closed. Quotation list currently has no staging rows; conditional View/Use quote controls are checked in source, not exercised by creating hosted quotations. No reports approved/returned, no notifications marked read/unread and no financial or inventory writes were made during visual review.

Source inventory: D:/Client-Project/output/ui-placement-inventory-20261112.json. This pass does not certify every ERP workflow or record state. No migration or mobile build required.
