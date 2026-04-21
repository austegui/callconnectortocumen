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

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, _res, next) => {
  const [path, query = ''] = req.url.split('?');
  const normalizedPath = path.replace(/\/{2,}/g, '/');

  if (normalizedPath !== path) {
    req.url = query ? `${normalizedPath}?${query}` : normalizedPath;
  }

  next();
});
app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms origin=${req.get('origin') || '-'} referer=${req.get('referer') || '-'}`
    );
  });

  next();
});
app.use(express.static(publicDir));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.get('/debug/voice', (req, res) => {
  res.json({
    ok: true,
    baseUrl: getBaseUrl(req),
    config: {
      hasAccountSid: Boolean(TWILIO_ACCOUNT_SID),
      hasApiKey: Boolean(TWILIO_API_KEY),
      hasApiSecret: Boolean(TWILIO_API_SECRET),
      hasTwimlAppSid: Boolean(TWILIO_TWIML_APP_SID),
      hasCallerId: Boolean(TWILIO_CALLER_ID),
      hasDefaultDestination: Boolean(DEFAULT_DESTINATION),
      allowedOrigins: Array.from(allowedOrigins),
      routes: Object.fromEntries(
        Object.entries(routeMap).map(([key, value]) => [key, summarizeDestination(value)])
      )
    }
  });
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
    console.error('[voice-token] missing credentials');
    return res.status(500).json({ error: 'Twilio credentials are not configured.' });
  }

  if (!originIsAllowed(req)) {
    console.error(
      `[voice-token] origin blocked origin=${req.get('origin') || '-'} referer=${req.get('referer') || '-'}`
    );
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

  console.log(`[voice-token] issued identity=${identity} routeHint=${req.query.route || '-'}`);

  res.json({
    token: token.toJwt(),
    identity,
    expiresInSeconds: 600
  });
});

app.post('/client-log', (req, res) => {
  const level = String(req.body.level || 'info').toLowerCase();
  const message = String(req.body.message || '');
  const details = req.body.details || null;
  console.log(`[client-${level}] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
  res.sendStatus(204);
});

app.post('/voice/twiml/outbound', (req, res) => {
  const route = normalizeRoute(req.body.route || req.query.route);
  const destination = routeMap[route] || routeMap.default;

  console.log(
    `[voice-twiml] route=${route} destination=${summarizeDestination(destination)} from=${req.body.From || '-'} to=${req.body.To || '-'} body=${JSON.stringify(sanitizeWebhookBody(req.body))}`
  );

  if (!destination) {
    return respondWithVoiceResponse(res, (voiceResponse) => {
      voiceResponse.say('We are unable to place this call right now.');
      voiceResponse.hangup();
    });
  }

  respondWithVoiceResponse(res, (voiceResponse) => {
    const dialOptions = {
      answerOnBridge: true,
      action: `${getBaseUrl(req)}/voice/dial-action?route=${encodeURIComponent(route)}`
    };

    const callerId = getCallerIdForDestination(destination, req);
    if (callerId) {
      dialOptions.callerId = callerId;
    }

    const dial = voiceResponse.dial(dialOptions);

    if (destination.startsWith('app:')) {
      const application = dial.application({
        copyParentTo: true
      });
      application.applicationSid(destination.replace(/^app:/, ''));
      return;
    }

    if (destination.startsWith('application:')) {
      const application = dial.application({
        copyParentTo: true
      });
      application.applicationSid(destination.replace(/^application:/, ''));
      return;
    }

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
  console.log(
    `[voice-dial-action] status=${status || '-'} route=${req.query.route || '-'} body=${JSON.stringify(sanitizeWebhookBody(req.body))}`
  );

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
    TWILIO_ACCOUNT_SID &&
      TWILIO_API_KEY &&
      TWILIO_API_SECRET &&
      TWILIO_TWIML_APP_SID &&
      TWILIO_CALLER_ID
  );
}

function getBaseUrl(req) {
  if (BASE_URL) {
    return BASE_URL;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = req.get('host');

  return `${proto}://${host}`;
}

function originIsAllowed(req) {
  if (allowedOrigins.size === 0) {
    return true;
  }

  const origin = req.get('origin');
  if (origin) {
    return allowedOrigins.has(origin);
  }

  const referer = req.get('referer');
  if (!referer) {
    return true;
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return allowedOrigins.has(refererOrigin);
  } catch (_error) {
    return false;
  }
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

function summarizeDestination(destination) {
  if (!destination) {
    return null;
  }

  if (destination.startsWith('client:') || destination.startsWith('sip:')) {
    return destination;
  }

  return destination.replace(/.(?=.{4})/g, '*');
}

function sanitizeWebhookBody(body) {
  const sanitized = { ...body };

  for (const key of ['To', 'From', 'ForwardedFrom', 'Called']) {
    if (sanitized[key]) {
      sanitized[key] = summarizeDestination(String(sanitized[key]));
    }
  }

  return sanitized;
}

function getCallerIdForDestination(destination, req) {
  if (!destination) {
    return TWILIO_CALLER_ID || null;
  }

  if (destination.startsWith('client:')) {
    return req.body.From || null;
  }

  if (destination.startsWith('sip:')) {
    return 'call-connector';
  }

  if (destination.startsWith('app:') || destination.startsWith('application:')) {
    return null;
  }

  return TWILIO_CALLER_ID || null;
}
