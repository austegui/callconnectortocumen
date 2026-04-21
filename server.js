const path = require('path');
const express = require('express');
const Retell = require('retell-sdk').default;
require('dotenv').config();

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, 'public');

const {
  BASE_URL,
  RETELL_API_KEY,
  DEFAULT_AGENT_ID,
  ALLOWED_ORIGINS = ''
} = process.env;

const allowedOrigins = new Set(
  ALLOWED_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const routeMap = {
  sales: process.env.SALES_AGENT_ID || DEFAULT_AGENT_ID,
  support: process.env.SUPPORT_AGENT_ID || DEFAULT_AGENT_ID,
  default: DEFAULT_AGENT_ID
};

const retellClient = RETELL_API_KEY ? new Retell({ apiKey: RETELL_API_KEY }) : null;

app.set('trust proxy', true);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, _res, next) => {
  const [pathname, query = ''] = req.url.split('?');
  const normalizedPath = pathname.replace(/\/{2,}/g, '/');

  if (normalizedPath !== pathname) {
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
      hasVoiceProviderKey: Boolean(RETELL_API_KEY),
      hasDefaultAgentId: Boolean(DEFAULT_AGENT_ID),
      allowedOrigins: Array.from(allowedOrigins),
      routes: Object.fromEntries(
        Object.entries(routeMap).map(([key, value]) => [key, summarizeId(value)])
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

app.post('/voice/session', async (req, res) => {
  if (!retellConfigured()) {
    console.error('[voice-session] missing configuration');
    return res.status(500).json({ error: 'Voice credentials are not configured.' });
  }

  if (!originIsAllowed(req)) {
    console.error(
      `[voice-session] origin blocked origin=${req.get('origin') || '-'} referer=${req.get('referer') || '-'}`
    );
    return res.status(403).json({ error: 'Origin is not allowed.' });
  }

  const route = normalizeRoute(req.body.route || req.query.route);
  const agentId = routeMap[route] || routeMap.default;

  if (!agentId) {
    console.error(`[voice-session] missing agent for route=${route}`);
    return res.status(500).json({ error: `No voice agent is configured for route "${route}".` });
  }

  try {
    const webCall = await retellClient.call.createWebCall({
      agent_id: agentId
    });

    console.log(
      `[voice-session] route=${route} agent=${summarizeId(agentId)} callId=${webCall.call_id || '-'}`
    );

    res.json({
      accessToken: webCall.access_token,
      callId: webCall.call_id,
      agentId: webCall.agent_id,
      expiresInSeconds: 30
    });
  } catch (error) {
    console.error(
      `[voice-session] failed route=${route} agent=${summarizeId(agentId)} error=${JSON.stringify(serializeRetellError(error))}`
    );
    res
      .status(error?.status || 500)
      .json({ error: extractRetellErrorMessage(error) || 'Voice session could not be created.' });
  }
});

app.post('/client-log', (req, res) => {
  const level = String(req.body.level || 'info').toLowerCase();
  const message = String(req.body.message || '');
  const details = req.body.details || null;
  console.log(`[client-${level}] ${message}${details ? ` ${JSON.stringify(details)}` : ''}`);
  res.sendStatus(204);
});

app.post('/voice/events', (req, res) => {
  const event = req.body?.event || 'unknown';
  const callId = req.body?.call?.call_id || '-';
  console.log(`[voice-events] event=${event} callId=${callId}`);
  res.sendStatus(204);
});

app.listen(port, () => {
  console.log(`Widget server listening on http://localhost:${port}`);
});

function retellConfigured() {
  return Boolean(RETELL_API_KEY && DEFAULT_AGENT_ID && retellClient);
}

function getBaseUrl(req) {
  if (BASE_URL) {
    return BASE_URL;
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const proto = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  return `${proto}://${req.get('host')}`;
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

function summarizeId(value) {
  if (!value) {
    return null;
  }

  return String(value).replace(/.(?=.{4})/g, '*');
}

function serializeRetellError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || null,
    status: error?.status || null,
    code: error?.code || null,
    response: error?.response || null
  };
}

function extractRetellErrorMessage(error) {
  if (!error) {
    return null;
  }

  if (typeof error.message === 'string' && error.message) {
    return error.message;
  }

  if (typeof error.error === 'string' && error.error) {
    return error.error;
  }

  if (typeof error?.response?.error === 'string' && error.response.error) {
    return error.response.error;
  }

  return null;
}
