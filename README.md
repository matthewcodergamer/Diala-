# Diala — AI Call Desk

Diala is a free-first, mobile-first call-center/outreach workspace built for iPhone Safari and installable as a PWA. It keeps the CRM, spreadsheet import, scripts, personalized media and AI assistant inside one interface while treating communication providers as replaceable adapters.

## What works in this build

- Polished responsive PWA UI designed for iPhone Safari and desktop.
- `.xlsx`, `.xls` and `.csv` import with automatic matching for common Name, Phone, ZIP, Address, City, State, Email, Status and Notes headings.
- Local contact queue, search, dispositions, notes and activity timeline.
- Bulk contact selection and message preparation with exact `{{name}}`, `{{zip}}`, `{{address}}`, `{{phone}}`, `{{city}}` and `{{state}}` template replacement.
- Per-contact photo assignment plus bulk filename-to-contact matching.
- Canvas-based personalized cards so names/addresses are rendered exactly instead of asking an image model to spell them.
- Optional AI background generation through Puter.js using Google Imagen; exact contact text is overlaid separately.
- Device share sheet for personalized message + image when supported.
- Puter AI assistant with controlled tool/action calls rather than random UI clicking.
- Voice input using Web Speech Recognition when available.
- Natural Puter TTS with device `speechSynthesis` fallback.
- FaceTime and FaceTime Audio launch links.
- TextNow bridge that copies the number/message and opens TextNow.
- Google Meet “new meeting” launcher.
- Jitsi meeting embedded directly inside Diala.
- Native `tel:` and `sms:` fallbacks.
- Optional custom HTTPS provider endpoint for future Twilio/RingCentral/other telecom backends.
- Service worker/PWA shell and notification permission flow.

## Important platform limits

Diala does **not** pretend that Safari can read or control private FaceTime/TextNow call history. FaceTime and TextNow are launch/bridge integrations. Real background missed-call events, automated SMS/MMS, hold/transfer and carrier-grade multi-line telephony require a provider/backend that exposes those APIs.

Google Meet creation in this static build opens Google’s meeting creation page. A fully automated Meet REST API integration requires Google OAuth and a secure backend or serverless function.

Web Push permission can be enabled now, but true push while Diala is closed requires a server that sends Web Push notifications to the registered subscription.

## Run locally

Serve the folder over HTTP (service workers do not run reliably from `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The repository includes a Pages workflow. In **Settings → Pages**, set **Source** to **GitHub Actions** if it is not already enabled. The workflow deploys the static site on pushes to `main`.

Expected Pages URL after enabling Pages:

`https://matthewcodergamer.github.io/Diala-/`

## Spreadsheet example

Any equivalent headers are accepted, for example:

| Name | Phone | ZIP Code | Address | City | State | Status | Notes |
|---|---|---|---|---|---|---|---|
| Douglas Williams | +1 305 555 0142 | 33101 | 104 Harbor Avenue | Miami | FL | Callback | Call after 2 PM |

For contact photos, upload several images using **Queue → Match photos**. Filenames containing a contact name or the last seven digits of their phone number are matched automatically.

## AI and image generation

The frontend loads Puter.js directly. Users sign into their own Puter account and cover their own AI usage. No AI API key is committed to this repository.

The image workflow intentionally separates creative generation from exact text rendering:

1. Generate or upload a background/photo.
2. Diala renders the recipient’s name, ZIP and address with Canvas.
3. Review the result.
4. Share or send through a connected channel.

## Security

Do not place Twilio, RingCentral, Google OAuth client secrets or other server credentials in `app.js` or GitHub Pages. Use a backend/serverless function and configure its public HTTPS endpoint in Diala settings.
