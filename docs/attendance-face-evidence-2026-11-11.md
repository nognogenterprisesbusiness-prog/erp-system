# QR verification followed by a new face photo

The confirmed client flow is: Foreman scans the worker's current ID QR, checks the resolved worker name and employee code, captures a new face photo, reviews it, then saves time-in/time-out. This is photo evidence for human review, not face recognition or automated liveness detection.

## Posting and user feedback

QR verification creates a short-lived pending attempt only. It does not create a scan, attendance or labour cost. The app stops the QR camera after identifying a card and locks the resolved worker while capturing/reviewing a photo. Cancelling before submission creates no scan. A submitted request that loses its response must be retried with the same key and photo: the server may already have committed it.

The face camera uses a new capture, with front/rear switching and no gallery selection. Uploads are decoded, rotated, resized and re-encoded on the server; original metadata is stripped. QR verification expires after ten minutes or a Philippine date change. The database checks that an uploaded photo exists at the recorder/attempt path and was uploaded after verification. Card validity, worker/site assignment, permissions and current scan state are checked again when saving.

The original scan ledger and five-minute duplicate guard remain. Concurrent retries produce one scan and one immutable photo attachment. A changed-photo retry is rejected. Photos are private and readable by Admin and the current authorized Foreman; Engineer, Warehouse, Finance and unrelated Foremen cannot read them. Earlier scans retain an explicit no-photo label.

Scans do not post labour cost. A time-in alone no longer invents eight hours or automatically joins the attendance posting list. After time-out, calculated elapsed hours can be reviewed and recorded using the existing attendance command and historical rate snapshot. Break deductions and overtime are not inferred. Manual attendance remains available for a forgotten card and is explicitly labelled as having no QR/photo evidence.

## Web review

Projects → Attendance → **ID scans & face photos** opens a date-filtered, paginated history. Admin and authorized Foremen can review worker identity, site, server time and photo. The photo endpoint and Storage both enforce access; the browser receives no public bucket URL. Financial viewers do not gain access to face photos through their labour-cost permission.

## Fixes found during this audit

- Time-in previously prefilled eight hours before any time-out; the QR flow now waits for time-out.
- Missing rate configuration previously defaulted selected workers to Absent. Scanned workers now wait for rate setup; manual selection defaults honestly to Present and blocks posting until a basis is configured. Absence requires an explicit choice.
- Posting attendance did not invalidate the mobile scan cache; both the scan list and worker resources now refresh on posting/reversal.
- The scanner previously could keep processing camera callbacks around another pending action; it now stops before verification and guards concurrent callbacks/captures.
- Private captures are cleared from the native app cache after success, cancellation or retake. Failed submissions retain the same capture for safe retry.

## Validation

- 141 web/domain/UI tests; TypeScript, lint, 149 unique migration versions and production build passed.
- Mobile readiness regression checks cover unfinished scans, missing rates and already-posted attendance, in addition to the existing mobile tests.
- Isolated PostgreSQL: QR attendance, face evidence, automatic attendance and mobile integration suites passed. They cover current/replaced/unknown cards, missing or expired verification, missing/older photos, worker reassignment while the form is open, access to evidence, concurrent retries, immutable attachments, attendance rollback and once-only labour costs.
- Hosted migration was applied by the user and verified through authenticated reads and the local API. Both active workers have one current ID card; no duplicate unreversed worker/project/day attendance was found. A real assigned worker's QR resolved to the correct employee; photo-free submission was rejected. No new scan, attendance, face photo or labour cost was posted to hosted staging during this verification. See `output/attendance-staging-verification-20261111.json` outside this repository.

## Rollout and remaining acceptance

Migration: `supabase/migrations/20261111090000_attendance_face_evidence.sql` (user-confirmed applied to staging). Deploy the corresponding web/API code before using Android build 32's new scanner. Earlier apps retain manual attendance; their photo-free QR scan request is rejected with an update message after the API change.

No web push/deployment or Play Store submission is included in this local-files-only task. Physical phone camera acceptance is outstanding: scan a printed card, verify the worker, capture/retake/cancel, save, simulate a lost response and retry, then review the photo in Admin. Use two actual scans separated by more than five minutes for time-in/time-out.

Pending verification attempts and failed/unlinked uploads are private and retained for retry; they are not attendance. No automatic photo purge or retention period has been invented. The project owner should set operational retention before routine employee photo collection.
