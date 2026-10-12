# Vehicle diesel receipts

Engineer selects the assigned project/site, chooses a vehicle currently located there, enters the receipt total, selects Company cash or Own money, and attaches the receipt photo. Notes are optional. Philippine posting date and system reference are generated on submission and preserved on duplicate retries.

Amounts up to and including PHP 50,000 post one additional project expense automatically. Above PHP 50,000 remains submitted until Admin approves. Finance can review/reject and record reimbursement, but cannot approve above the owner limit. Fuel never creates material lines, material stock, supplier price history, or consumption costs.

The existing site-purchase list includes diesel with its real total and an explicit expense label. Mobile receipt rows open vehicle history for the selected site. Admin/Finance vehicle detail includes paginated diesel history, links to receipt detail/photo, approval status and expense reversal reason. Project expense corrections continue through the existing audited expense reversal command. Reimbursement and repeated approval do not post a second expense.

## Deployment

Apply `20261012150000_vehicle_fuel_receipts.sql` after the earlier pending October 12 migrations. Deploy the matching web/mobile API before distributing a new mobile build. Web changes are deliberately not pushed. Existing installed builds retain their itemized-material purchase endpoint and response compatibility. Production Android build 12 does not contain this feature; no new AAB is created by this change.

## Verification

- Web/mobile TypeScript and lint passed.
- 110 web/domain unit tests and 23 mobile tests passed.
- Five isolated PostgreSQL fuel scenarios passed: exact threshold, concurrent duplicate submissions and approval, reimbursement, changed retries, rejected entries, date retention across retry, denied roles, cross-site vehicle denial, missing photos, invalid totals, private command denial, reversal and unchanged stock.
- All 42 isolated ERP workflow checks passed across five roles, including existing itemized site purchase approval, valued stock, partial deliveries and consumption.
- Web production build and Android/iOS native exports passed. Migration versions are unique.
- Native device interaction and production database acceptance remain unverified.

## Remaining product decision

Superseded by the confirmed staff choice: Receipt expense or Inventory materials. See receipt-stock-entry-2026-10-12.md. PHP 50,000 remains the approval limit, not a stock classification cutoff.
