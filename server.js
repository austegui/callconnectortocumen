const crypto = require('crypto');
const path = require('path');
const express = require('express');
const twilio = require('twilio');
require('dotenv').config();

const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;
const { VoiceResponse } = twilio.twiml;

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

const {
  ALLOWED_ORIGINS = '',
  BASE_URL,
  DEFAULT_DESTINATION,
  SUPPORT_DESTINATION,
  SALES_DESTINATION,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
  TWILIO_CALLER_ID,
  TWILIO_TWIML_APP_SID
} = process.env;

const allowedOrigins = new Set(
  ALLOWED_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const routeMap = {
  sales: SALES_DESTINATION || DEFAULT_DESTINATION,
  support: SUPPORT_DESTINATION || DEFAULT_DESTINATION,
  default: DEFAULT_DESTINATION
};

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(normalizeDoubleSlashes);
app.use(logRequests);
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
        Object.entries(routeMap).map(([key, value]) => [key, summarizeValue(value)])
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
  if (!twilioConfigured()) {
    console.error('[voice-token] missing configuration');
    return res.status(500).json({ error: 'Las credenciales de voz no estan configuradas.' });
  }

  if (!originIsAllowed(req)) {
    console.error(
      `[voice-token] origin blocked origin=${req.get('origin') || '-'} referer=${req.get('referer') || '-'}`
    );
    return res.status(403).json({ error: 'El origen no esta permitido.' });
  }

  const identity = `web-${crypto.randomUUID()}`;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity,
    ttl: 600
  });

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: TWILIO_TWIML_APP_SID
    })
  );

  const routeHint = normalizeRoute(req.query.route);
  console.log(`[voice-token] issued identity=${identity} routeHint=${routeHint}`);

  res.json({
    token: token.toJwt(),
    identity,
    expiresInSeconds: 600
  });
});

app.all('/voice/twiml/outbound', (req, res) => {
  const requestBody = req.body || {};
  const route = normalizeRoute(requestBody.route || req.query.route);
  const destination = routeMap[route] || routeMap.default;
  const voiceResponse = new VoiceResponse();

  if (!destination) {
    console.error(`[voice-twiml] no destination route=${route}`);
    voiceResponse.say(
      { language: 'es-ES', voice: 'alice' },
      'No hay agentes disponibles en este momento.'
    );
    res.type('text/xml').send(voiceResponse.toString());
    return;
  }

  const target = parseDestination(destination);
  const actionUrl = buildAbsoluteUrl(req, `/voice/dial-action?route=${encodeURIComponent(route)}`);
  const dialOptions = {
    action: actionUrl,
    answerOnBridge: true,
    timeout: 30
  };

  if (target.type === 'number') {
    if (!TWILIO_CALLER_ID) {
      console.error(`[voice-twiml] missing caller id route=${route}`);
      voiceResponse.say(
        { language: 'es-ES', voice: 'alice' },
        'La configuracion del identificador de llamadas no es valida.'
      );
      return res.type('text/xml').send(voiceResponse.toString());
    }

    if (TWILIO_CALLER_ID) {
      dialOptions.callerId = TWILIO_CALLER_ID;
    }
  } else if (target.type === 'client') {
    dialOptions.callerId = requestBody.From || requestBody.Caller || 'client:web';
  }

  const dial = voiceResponse.dial(dialOptions);

  if (target.type === 'number') {
    dial.number(target.value);
  } else if (target.type === 'sip') {
    dial.sip(target.value);
  } else if (target.type === 'client') {
    dial.client(target.value);
  } else {
    console.error(`[voice-twiml] unsupported destination route=${route} destination=${destination}`);
    voiceResponse.say(
      { language: 'es-ES', voice: 'alice' },
      'La configuracion de la llamada no es valida.'
    );
    return res.type('text/xml').send(voiceResponse.toString());
  }

  console.log(
    `[voice-twiml] route=${route} destination=${summarizeValue(destination)} from=${requestBody.From || '-'} to=${requestBody.To || '-'} body=${JSON.stringify(requestBody)}`
  );

  res.type('text/xml').send(voiceResponse.toString());
});

app.all('/voice/dial-action', (req, res) => {
  const requestBody = req.body || {};
  const route = normalizeRoute(req.query.route);
  const dialStatus = requestBody.DialCallStatus || requestBody.CallStatus || 'unknown';
  const errorCode = requestBody.ErrorCode || '-';
  const errorMessage = requestBody.ErrorMessage || '-';

  console.log(
    `[voice-dial-action] status=${dialStatus} route=${route} errorCode=${errorCode} errorMessage=${JSON.stringify(errorMessage)} body=${JSON.stringify(requestBody)}`
  );

  const voiceResponse = new VoiceResponse();
  if (['completed', 'answered'].includes(dialStatus)) {
    voiceResponse.hangup();
  } else {
    voiceResponse.say(
      { language: 'es-ES', voice: 'alice' },
      'Lo sentimos. No pudimos completar la transferencia en este momento.'
    );
  }

  res.type('text/xml').send(voiceResponse.toString());
});

app.post('/client-log', (req, res) => {
  const level = String(req.body.level || 'info').toLowerCase();
  const message = String(req.body.message || '');
  const details = req.body.details || null;
  console.log(`[client-${level}] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
  res.sendStatus(204);
});

app.listen(port, () => {
  console.log(`Widget server listening on http://localhost:${port}`);
});

function normalizeDoubleSlashes(req, _res, next) {
  const [pathname, query = ''] = req.url.split('?');
  const normalizedPath = pathname.replace(/\/{2,}/g, '/');

  if (normalizedPath !== pathname) {
    req.url = query ? `${normalizedPath}?${query}` : normalizedPath;
  }

  next();
}

function logRequests(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms origin=${req.get('origin') || '-'} referer=${req.get('referer') || '-'}`
    );
  });

  next();
}

function twilioConfigured() {
  return Boolean(
    TWILIO_ACCOUNT_SID &&
      TWILIO_API_KEY &&
      TWILIO_API_SECRET &&
      TWILIO_TWIML_APP_SID &&
      DEFAULT_DESTINATION
  );
}

function getBaseUrl(req) {
  if (BASE_URL) {
    return BASE_URL;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function buildAbsoluteUrl(req, pathname) {
  return new URL(pathname, `${getBaseUrl(req)}/`).toString();
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
    return allowedOrigins.has(new URL(referer).origin);
  } catch (_error) {
    return false;
  }
}

function normalizeRoute(value) {
  const normalized = String(value || 'default').trim().toLowerCase();
  return normalized || 'default';
}

function parseDestination(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return { type: 'unknown', value: '' };
  }

  if (raw.startsWith('sip:')) {
    return { type: 'sip', value: raw };
  }

  if (raw.startsWith('client:')) {
    return { type: 'client', value: raw.slice('client:'.length) };
  }

  return { type: 'number', value: raw };
}

function summarizeValue(value) {
  if (!value) {
    return null;
  }

  return String(value).replace(/.(?=.{4})/g, '*');
}
