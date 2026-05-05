# Transfer-Ready Website Call Widget

## What changed

This version is built for **browser calling with transfer support**.

Call flow:

1. Website visitor clicks the widget.
2. The browser connects with **Twilio Voice JavaScript SDK**.
3. Twilio fetches TwiML from this server.
4. This server dials a **Twilio phone number that has been moved to Elastic SIP Trunking and imported into Retell**.
5. Retell receives the call as a **phone call**, so its **transfer_call** feature can be used.

This replaces the previous direct Retell Web Call flow, which cannot use Retell's native transfer feature.

## Required setup

### Twilio

You need:

- a **TwiML App** whose Voice Request URL points to:
  - `https://your-domain.example/voice/twiml/outbound`
- a **Standard API Key**
- a **Twilio caller ID** for the outbound bridge leg
- a **Twilio phone number moved into Elastic SIP Trunking**

### Retell

You need:

- the same Twilio number **imported into Retell** through Elastic SIP Trunking
- your Retell agent configured to answer that imported number
- the Retell agent set up with **transfer_call** or a transfer node

## Environment

Required:

```text
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_twilio_api_secret
TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_CALLER_ID=+15551234567
DEFAULT_DESTINATION=+15557654321
```

Notes:

- `TWILIO_CALLER_ID` should be a Twilio number on your account or a verified outgoing caller ID.
- `DEFAULT_DESTINATION` should be the **Twilio number attached to Elastic SIP Trunking and imported into Retell**.

Optional per-route destinations:

```text
SALES_DESTINATION=+15557654321
SUPPORT_DESTINATION=+15557654321
```

Optional:

```text
ALLOWED_ORIGINS=https://client-site.example
BASE_URL=https://tocumenwebcall.inferencia.digital
```

## Local setup

```bash
npm install
copy .env.example .env
npm start
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/widget/frame`
- `http://localhost:3000/debug/voice`

## Main files

- `server.js`: Twilio Access Token endpoint, TwiML outbound handler, diagnostics
- `public/embed.js`: script for client websites
- `public/widget-frame.html`: widget shell
- `public/widget-frame.js`: browser calling flow with Twilio Voice SDK
- `scripts/copy-sdk.mjs`: copies `twilio.min.js` into `public/vendor`

## Official references used

- Twilio Voice JavaScript SDK: https://www.twilio.com/docs/voice/sdks/javascript
- Twilio Device API: https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice
- Twilio Access Tokens: https://www.twilio.com/docs/iam/access-tokens
- Twilio Voice SDKs overview: https://www.twilio.com/docs/voice/sdks
- Twilio `<Dial>`: https://www.twilio.com/docs/voice/twiml/dial
- Twilio Reference Components: https://www.twilio.com/docs/voice/sdks/javascript/reference-components
- Twilio SIP REFER transfer: https://www.twilio.com/docs/sip-trunking/call-transfer
- Retell custom telephony overview: https://docs.retellai.com/deploy/custom-telephony
- Retell Twilio SIP trunking: https://docs.retellai.com/deploy/twilio
- Retell transfer_call: https://docs.retellai.com/build/single-multi-prompt/transfer-call
