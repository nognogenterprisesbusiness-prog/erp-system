# Mobile compatibility checks

The required-update screen is driven by a verified API-contract mismatch, not by the latest app version, a visual release, an ordinary request conflict, an authentication denial or an internet outage.

## Current behavior

- The shared domain package exports `mobileProtocolVersion = 1`. The backend supports protocols 1 through 1. Legacy apps without the header are treated as protocol 1 and continue working.
- `/api/mobile/v1/compatibility` publishes only the supported protocol range and optional Android/iOS download links, with `Cache-Control: no-store`. It requires no account login and exposes no company records.
- New app calls send `X-Nognog-Mobile-Protocol`. The existing mobile context checks compatibility before reading a command body or invoking any mutation. An incompatible older protocol gets HTTP 426 with `APP_UPDATE_REQUIRED` and validated compatibility metadata. A client newer than the server gets HTTP 503 asking for an ERP update, rather than an incorrect app-update prompt. Existing bearer, role, site, rate-limit and RLS checks remain mandatory.
- The mobile boundary checks in the background on launch, foreground and reconnect, without delaying compatible startup. A confirmed mismatch displays the required-update screen; received HTTP 426 responses can activate it immediately. The query and request helpers stop automatic retries of incompatible operations.
- A timeout, 404, invalid response or offline connection does not infer an update requirement. It also does not erase a requirement already confirmed during the current app run. The confirmed policy is held in memory; an offline restart can still show cached reads, while online commands always pass the backend's compatibility and permission guards. A fresh compatible response clears the requirement and refreshes mobile queries.
- The boundary leaves the underlying screens mounted while displaying its modal. It does not sign the user out or automatically retry stock writes. Installing/restarting an app can discard unsaved local forms under the existing mobile behavior; check history before re-entering a submission with an uncertain result.

## Release control

Optional server-only settings:

```text
MOBILE_ANDROID_UPDATE_URL=<released compatible HTTPS APK or Google Play URL>
MOBILE_IOS_UPDATE_URL=<released compatible HTTPS distribution or App Store URL>
```

Only public HTTPS URLs without embedded credentials are accepted. Invalid or missing links become `null`. If a required update has no configured link, the screen tells the user to contact their administrator and offers Check again. No download occurs automatically.

Keep protocol 1 for additive endpoints and compatible UI changes. For an actual breaking contract, release and test a client with the new protocol first, update the backend to support that contract, configure the matching released download links, then raise `minimumSupportedMobileProtocol` only when older clients truly cannot work safely. The minimum may never exceed the current shared protocol. Do not point a required-update link at a build that still uses an unsupported protocol.

This check is not Expo OTA delivery. The app currently has no `expo-updates` dependency or EAS Update configuration. A new installed APK/iOS build is required to introduce this checking feature to existing phones; a source push or native JavaScript export does not install it. Older installed apps remain supported now, but cannot gain the new screen retroactively. Native-code compatibility for any later OTA setup is a separate concern governed by [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

## Receipt endpoint repair

The Engineer's `uploadSitePurchase` sends `POST /api/mobile/v1/site-purchases/receipt`. Its multipart handler had been placed in GET and could not be reached by the app's POST. It now runs in POST after the write context guard, preserving body limits, command validation, site authorization, receipt image verification, storage and idempotent submission. GET no longer contains this posting path. No SQL migration is needed.

## Validation and remaining acceptance

Web unit tests cover legacy support, malformed headers, future policy rejection before body consumption, HTTP 426 metadata, server-outdated distinction and safe download URLs. The local production HTTP suite covers uncached metadata, missing/cookie-only authentication, invalid/newer headers, and protected receipt uploads. Mobile tests cover requirement activation, outage behavior, fresh-policy rollback and subscriptions. Native iOS/Android export is a bundling check, not a new installable release or phone acceptance. Authenticated native receipt upload, installing a real upgrade and device accessibility remain walkthrough items.
