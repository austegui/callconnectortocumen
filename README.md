# Retell Website Call Widget

## Recommendation

For a website visitor talking directly to a Retell AI agent, the highest-probability architecture is a **hosted embeddable widget built on Retell Web Call**.

That means:

1. You host the widget and the small backend proxy.
2. Your client adds one script tag to their website.
3. Website visitors start the call in the browser.
4. Your backend calls Retell's `createWebCall` API and returns the short-lived access token.
5. The browser joins the Retell WebRTC room using Retell's Web SDK.

This avoids the PSTN leg entirely, which is exactly where Twilio-to-phone-number routing caused trouble in the earlier approach.

## Architecture

### Recommended production flow

1. Client adds:

```html
<script
  src="https://tocumenwebcall.inferencia.digital/embed.js"
  data-route="sales"
  data-title="Talk to Sales"
  data-button-text="Start Call"
  data-color="#0f766e"
  data-fallback-number="+15551234567"
></script>
```

2. `embed.js` injects a hosted iframe widget.
3. The widget calls `/retell/web-call` on your backend.
4. Your backend calls Retell `createWebCall({ agent_id })`.
5. The widget starts the Retell Web SDK with the returned access token.
6. The website visitor talks directly to the Retell agent in the browser.

## Environment

Required:

```text
RETELL_API_KEY=key_xxxxxxxxxxxxxxxxxxxxx
DEFAULT_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxx
```

Optional per-route agent IDs:

```text
SALES_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxx
SUPPORT_AGENT_ID=agent_xxxxxxxxxxxxxxxxxxx
```

Optional:

```text
ALLOWED_ORIGINS=https://client-site.example
BASE_URL=https://tocumenwebcall.inferencia.digital
```

## Files in this starter

- `server.js`: Retell web-call token endpoint, diagnostics, static hosting
- `public/embed.js`: script your client pastes into their website
- `public/widget-frame.*`: the browser UI and Retell Web SDK integration
- `scripts/copy-sdk.mjs`: copies the browser SDK bundles from `node_modules`

## Local setup

```bash
npm install
copy .env.example .env
npm start
```

Then open `http://localhost:3000/` for the full demo page or `http://localhost:3000/widget/frame` for the widget preview.

## Current official references used

- Retell Web Call: https://docs.retellai.com/deploy/web-call
- Retell Create Web Call API: https://docs.retellai.com/api-references/create-web-call
- Retell SDKs: https://docs.retellai.com/get-started/sdk
- Retell migration guide: https://docs.retellai.com/api-references/migration-doc
- Retell Twilio integration / SIP trunking: https://docs.retellai.com/deploy/twilio
