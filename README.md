# Twilio Website Call Widget Research

## Recommendation

The best implementation for your use case is a **hosted embeddable widget built on Twilio Voice JavaScript SDK**, not a raw phone-link and not a fully custom integration inside each client website.

That means:

1. You host the widget and the Twilio backend.
2. Your client adds one script tag to their website.
3. Website visitors start the call in the browser.
4. Your backend issues the short-lived Twilio Access Token and handles the TwiML routing.

This is the cleanest way to give clients a "plug it in" experience while keeping Twilio credentials and call routing logic under your control.

## Why this is the best fit

### What Twilio supports today

- Twilio's current browser calling product is the **Voice JavaScript SDK**.
- Outbound calls from the browser SDK must be handled by a **TwiML App Voice URL**.
- Twilio also publishes **Reference Components** specifically for browser voice use cases and says they can be incorporated as building blocks.

### Why not just give the client a direct API call or phone link

- A direct Twilio REST API call from the browser would expose secrets.
- A `tel:` link is easy, but it moves the experience to the visitor's phone dialer and is not a true browser widget.
- Embedding the widget from your own domain keeps setup simple for the client and centralizes support, analytics, routing, and abuse protection.

### Important limitation

Twilio documents that mobile browsers have important Voice JS limitations. Because of that, the most practical production setup is:

- **Desktop**: browser WebRTC call through Twilio Voice JS SDK
- **Mobile**: show a phone fallback (`tel:`) or a callback flow

The sample in this repo follows that recommendation.

## Architecture

### Recommended production flow

1. Client adds:

```html
<script
  src="https://your-widget-domain.example/embed.js"
  data-route="sales"
  data-title="Talk to Sales"
  data-button-text="Start Call"
  data-color="#0f766e"
  data-fallback-number="+15551234567"
></script>
```

2. `embed.js` injects an iframe widget hosted by you.
3. The widget fetches `/voice/token`.
4. Your server returns a short-lived Access Token with a `VoiceGrant`.
5. The widget starts `Twilio.Device` and calls `device.connect({ params: { route } })`.
6. Twilio sends the outbound webhook to your TwiML App Voice URL.
7. Your `/voice/twiml/outbound` endpoint returns TwiML to dial the real destination.

### Destination strategies

The widget server can route the browser call to four destination types:

- `+15557654321` for a regular PSTN number
- `client:agent-desktop` for a Twilio Voice SDK user
- `app:APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` for a TwiML App in Twilio
- `sip:agent@example.com` for a SIP endpoint

If your target is already inside Twilio, the highest-probability route is usually **`client:` or `app:`**, because it avoids the PSTN leg that can trigger carrier, compliance, or fraud blocking.

### Internal app test route

To validate that `<Dial><Application>` works before wiring your real receiving workflow, point a second TwiML App's Voice URL to:

```text
https://your-widget-domain.example/voice/twiml/receiver-test
```

Then set:

```text
DEFAULT_DESTINATION=app:THAT_SECOND_TWIML_APP_SID
```

If the browser caller hears "Connection successful", your app-to-app routing works and any remaining error is inside the real receiving TwiML App's logic.

## Security rules you should keep

- Never generate Twilio access tokens in the browser.
- Never trust `device.connect()` params blindly.
- Resolve browser-provided params to allowlisted destinations on the server.
- Add rate limiting, bot protection, and origin allowlisting before production.
- Keep the widget hosted by you so clients do not need Twilio credentials.

## Files in this starter

- `server.js`: token endpoint, TwiML outbound route, dial action webhook, static hosting
- `public/embed.js`: script your client pastes into their website
- `public/widget-frame.*`: the browser UI
- `scripts/copy-sdk.mjs`: copies `twilio.min.js` from `node_modules` after install

## Twilio Console setup

1. Create or reuse a **TwiML App**.
2. Set its **Voice Request URL** to:

```text
https://your-widget-domain.example/voice/twiml/outbound
```

3. Optionally set the TwiML App or phone number status callback to:

```text
https://your-widget-domain.example/voice/status
```

4. Put the TwiML App SID into `.env`.
5. Set `TWILIO_CALLER_ID` to a Twilio number or a verified caller ID you control.
6. Set `DEFAULT_DESTINATION` to the route you want the browser call to reach.

For Twilio-internal routing, examples are:

```text
DEFAULT_DESTINATION=client:agent-desktop
```

or

```text
DEFAULT_DESTINATION=app:APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Local setup

```bash
npm install
npm run prepare:sdk
copy .env.example .env
npm start
```

Then open `http://localhost:3000/widget/frame` for a local UI preview.

## When to choose a different approach

Use a callback flow instead of browser WebRTC if any of these are true:

- Most visitors are on mobile.
- The client wants zero microphone permission prompts.
- The client only needs "Call me now" and not true in-browser audio.

In that model, the website submits a phone number to your backend, and your backend starts the call with Twilio's Calls API, which can create outbound calls directly with a `POST` to the Calls resource.

If your destination is another Twilio workflow in the same account, prefer routing to a **TwiML App** or **Voice SDK client** before falling back to a PSTN number.

## Current Twilio references used

- Voice JavaScript SDK overview: https://www.twilio.com/docs/voice/sdks/javascript
- Voice JavaScript quickstart: https://www.twilio.com/docs/voice/sdks/javascript/get-started
- Voice JavaScript best practices: https://www.twilio.com/docs/voice/sdks/javascript/best-practices
- Voice SDKs overview: https://www.twilio.com/docs/voice/sdks
- Access Tokens: https://www.twilio.com/docs/iam/access-tokens
- Reference Components: https://www.twilio.com/docs/voice/sdks/javascript/reference-components
- TwiML `<Dial>`: https://www.twilio.com/docs/voice/twiml/dial
- Call resource / outbound calls API: https://www.twilio.com/docs/voice/api/call-resource
- Official SDK repository: https://github.com/twilio/twilio-voice.js
