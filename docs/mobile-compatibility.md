# Mobile compatibility checks

The required-update screen is driven by a verified API-contract mismatch or an administrator-activated minimum native build. Ordinary request conflicts, authentication denials and internet outages do not force an update.

## Current behavior

- The build-aware client exports `mobileProtocolVersion = 2`. The backend supports protocols 1 through 2 until a replacement release is ready. The minimum Android/iOS build is inactive until set for that released replacement.
- Installed native builds send their platform and actual native build number on each protected API call. Build numbers are compared per platform. A known build below its configured minimum receives HTTP 426 before any mutation runs. Older clients without platform headers remain usable during a one-platform rollout because the server cannot identify their platform; enable the protocol-2 bridge only when replacement builds are available on both active platforms.
- `/api/mobile/v1/compatibility` publishes only the supported protocol range and optional Android/iOS download links, with `Cache-Control: no-store`. It requires no account login and exposes no company records.
- New app calls send `X-Nognog-Mobile-Protocol`. The existing mobile context checks compatibility before reading a command body or invoking any mutation. An incompatible older protocol gets HTTP 426 with `APP_UPDATE_REQUIRED` and validated compatibility metadata. A client newer than the server gets HTTP 503 asking for an ERP update, rather than an incorrect app-update prompt. Existing bearer, role, site, rate-limit and RLS checks remain mandatory.
- The mobile boundary checks in the background on launch, foreground and reconnect, without delaying compatible startup. A confirmed protocol or build mismatch displays the required-update screen; received HTTP 426 responses can activate it immediately. The query and request helpers stop automatic retries of incompatible operations.
- A timeout, 404, invalid response or offline connection does not infer an update requirement. It also does not erase a requirement already confirmed during the current app run. The confirmed policy is held in memory; an offline restart can still show cached reads, while online commands always pass the backend's compatibility and permission guards. A fresh compatible response clears the requirement and refreshes mobile queries.
- The boundary leaves the underlying screens mounted while displaying its modal. It does not sign the user out or automatically retry stock writes. Installing/restarting an app can discard unsaved local forms under the existing mobile behavior; check history before re-entering a submission with an uncertain result.

## Release control

Optional server-only settings:

```text
MOBILE_ANDROID_UPDATE_URL=<released compatible HTTPS APK or Google Play URL>
MOBILE_IOS_UPDATE_URL=<released compatible HTTPS distribution or App Store URL>
MOBILE_ANDROID_MIN_BUILD=<minimum released Android versionCode>
MOBILE_IOS_MIN_BUILD=<minimum released iOS buildNumber>
MOBILE_MIN_PROTOCOL=2
```

Only public HTTPS URLs without embedded credentials are accepted. Invalid or missing links become `null`. If a required update has no configured link, the screen tells the user to contact their administrator and offers Check again. No download occurs automatically. Set each platform's minimum build **after** the replacement is installed or downloadable and its link is configured. Raising the Android minimum to 7 blocks build 6 while allowing build 7; raising the iOS minimum to 2 is independent. Clear a minimum setting to roll back a release gate. Any new mandatory release requires raising the corresponding minimum to that release's build number. Set `MOBILE_MIN_PROTOCOL=2` only after protocol-2 builds are available on every active platform; this lets older protocol-1 apps that already have the compatibility screen show their existing update prompt during the first transition. Leave it unset while old builds must remain usable.

Do not raise the minimum protocol or build merely because source code was pushed. For an actual breaking contract, release and test a compatible client first, update the backend, configure the matching released download links, then raise the minimum. The minimum may never exceed the current shared protocol. Apps installed before any compatibility screen existed cannot gain that screen from a server deployment; they can be blocked with HTTP 426 but may show only their older generic error. Distribute the build-aware client before enforcing later build releases.

This check is not Expo OTA delivery. The app currently has no `expo-updates` dependency or EAS Update configuration. A new installed APK/iOS build is required to introduce this checking feature to existing phones; a source push or native JavaScript export does not install it. Older installed apps remain supported now, but cannot gain the new screen retroactively. Native-code compatibility for any later OTA setup is a separate concern governed by [Expo runtime versions](https://docs.expo.dev/eas-update/runtime-versions/).

## Receipt endpoint repair

The Engineer's `uploadSitePurchase` sends `POST /api/mobile/v1/site-purchases/receipt`. Its multipart handler had been placed in GET and could not be reached by the app's POST. It now runs in POST after the write context guard, preserving body limits, command validation, site authorization, receipt image verification, storage and idempotent submission. GET no longer contains this posting path. No SQL migration is needed.

## Validation and remaining acceptance

Web unit tests cover legacy support, malformed headers, future policy rejection before body consumption, HTTP 426 metadata, server-outdated distinction and safe download URLs. The local production HTTP suite covers uncached metadata, missing/cookie-only authentication, invalid/newer headers, and protected receipt uploads. Mobile tests cover requirement activation, outage behavior, fresh-policy rollback and subscriptions. Native iOS/Android export is a bundling check, not a new installable release or phone acceptance. Authenticated native receipt upload, installing a real upgrade and device accessibility remain walkthrough items.
