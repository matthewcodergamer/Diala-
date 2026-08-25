# Diala V2

Diala is an iPhone-first AI call desk designed to feel like a focused iOS app rather than a desktop dashboard squeezed onto a phone.

## V2 highlights

- **Lia**, a voice-first personal assistant with a Siri-inspired animated orb.
- Foreground **hands-free listening**: after one user tap, Diala repeatedly restarts speech recognition while the web app remains visible. iOS can suspend a PWA in the background, so Diala does not claim permanent background microphone access.
- Natural TTS profiles through Puter-supported providers with an iPhone system-voice fallback.
- Time-aware greetings and fast local answers for time, daily goals, ETA and the next contact.
- Daily **Goals** with target, completed, remaining, pace, projected finish time and queue-day estimates.
- XLSX/CSV import, vCard import, and Contact Picker feature detection where supported.
- FaceTime and FaceTime Audio app launch integration.
- Google Meet handoff that copies the selected contact destination before opening Meet.
- TextNow app handoff with the contact number/message copied first; no dependency on TextNow's web UI.
- Embedded Jitsi meetings.
- Optional provider backend for real telephony actions such as hold, resume, mute and unmute.
- Secure people-enrichment proxy support; API secrets are never stored in the public GitHub Pages frontend.
- Personalized message templates, contact-specific photos, image cards and review-before-send workflow.
- Home Screen PWA layout with iOS safe areas, fixed app viewport, bottom tab bar, service worker, notifications and badge-ready push handling.

## Important platform boundaries

Diala does **not** pretend Safari can read or control private FaceTime or TextNow call history. FaceTime, TextNow and Google Meet are external app handoffs. True carrier calling, background missed-call events, automated SMS/MMS, hold/transfer and carrier-grade multi-line telephony require a compatible provider/backend.

Likewise, an installed iPhone web app can receive Web Push when configured with a push server, but iOS may suspend webpage JavaScript and microphone capture after the app leaves the foreground.

## Run

The project is static-host friendly. GitHub Pages can serve the repository root. The V2 shell is assembled from small local HTML/CSS/JS modules by `js/bootstrap-v2.js`, allowing it to remain a pure static PWA.
