const path = require('path');
const crypto = require('crypto');
const express = require('express');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

const {
  BASE_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_CALLER_ID,
  DEFAULT_DESTINATION,
  ALLOWED_ORIGINS = ''
} = process.env;

const allowedOrigins = new Set(
  ALLOWED_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const routeMap = {
  sales: process.env.SALES_DESTINATION || DEFAULT_DESTINATION,
  support: process.env.SUPPORT_DESTINATION || DEFAULT_DESTINATION,
  default: DEFAULT_DESTINATION
};

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/widget/frame', (_req, res) => {
  res.sendFile(path.join(publicDir, 'widget-frame.html'));
});

app.get('/embed.js', (_req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(publicDir, 'embed.js'));
});

app.get('/voice/token', (req, res) => {
  if (!credentialsAreConfigured()) {
    return res.status(500).json({ error: 'Twilio credentials are not configured.' });
  }

  if (!originIsAllowed(req)) {
    return res.status(403).json({ error: 'Origin is not allowed.' });
  }

  const identity = `web-${crypto.randomUUID()}`;
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID
  });

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    {
      identity,
      ttl: 60 * 10
    }
  );

  token.addGrant(voiceGrant);

  res.json({
    token: token.toJwt(),
    identity,
    expiresInSeconds: 600
  });
});

app.post('/voice/twiml/outbound', (req, res) => {
  const route = normalizeRoute(req.body.route || req.query.route);
  const destination = routeMap[route] || routeMap.default;

  if (!destination) {
    return respondWithVoiceResponse(res, (voiceResponse) => {
      voiceResponse.say('We are unable to place this call right now.');
      voiceResponse.hangup();
    });
  }

  respondWithVoiceResponse(res, (voiceResponse) => {
    const dial = voiceResponse.dial({
      callerId: TWILIO_CALLER_ID,
      answerOnBridge: true,
      action: `${BASE_URL}/voice/dial-action?route=${encodeURIComponent(route)}`
    });

    if (destination.startsWith('client:')) {
      dial.client(destination.replace(/^client:/, ''));
      return;
    }

    if (destination.startsWith('sip:')) {
      dial.sip(destination);
      return;
    }

    dial.number(destination);
  });
});

app.post('/voice/dial-action', (req, res) => {
  const status = String(req.body.DialCallStatus || '').toLowerCase();

  respondWithVoiceResponse(res, (voiceResponse) => {
    if (status === 'completed' || status === 'answered') {
      voiceResponse.hangup();
      return;
    }

    voiceResponse.say('Sorry, nobody is available right now. Please try again later.');
    voiceResponse.hangup();
  });
});

app.post('/voice/status', (req, res) => {
  console.log('[voice-status]', JSON.stringify(req.body));
  res.sendStatus(204);
});

app.listen(port, () => {
  console.log(`Widget server listening on http://localhost:${port}`);
});

function credentialsAreConfigured() {
  return Boolean(
    BASE_URL &&
      TWILIO_ACCOUNT_SID &&
      TWILIO_API_KEY &&
      TWILIO_API_SECRET &&
      TWILIO_TWIML_APP_SID &&
      TWILIO_CALLER_ID
  );
}

function originIsAllowed(req) {
  if (allowedOrigins.size === 0) {
    return true;
  }

  const origin = req.get('origin');
  return origin ? allowedOrigins.has(origin) : false;
}

function normalizeRoute(value) {
  const normalized = String(value || 'default').trim().toLowerCase();
  return normalized || 'default';
}

function respondWithVoiceResponse(res, buildResponse) {
  const voiceResponse = new twilio.twiml.VoiceResponse();
  buildResponse(voiceResponse);
  res.type('text/xml');
  res.send(voiceResponse.toString());
}
