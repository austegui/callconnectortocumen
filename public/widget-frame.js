const params = new URLSearchParams(window.location.search);
const route = params.get('route') || 'default';
const title = params.get('title') || 'Talk to us';
const buttonText = params.get('buttonText') || 'Call now';
const accent = params.get('accent') || '#0f766e';
const fallbackNumber = params.get('fallbackNumber') || '';

const titleEl = document.getElementById('title');
const bodyEl = document.getElementById('body');
const fineprintEl = document.getElementById('fineprint');
const statusEl = document.getElementById('status');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const fallbackLink = document.getElementById('fallbackLink');
const webCallSdk = resolveWebCallSdk();

let client = null;
let callActive = false;
let isStarting = false;

titleEl.textContent = title;
bodyEl.textContent =
  params.get('bodyText') ||
  'Start a browser conversation with our assistant. We will ask for microphone access.';
callButton.textContent = buttonText;
document.documentElement.style.setProperty('--accent', accent);
document.documentElement.style.setProperty('--accent-strong', darkenColor(accent));
document.documentElement.style.setProperty('--button-text', params.get('buttonTextColor') || '#ffffff');
document.documentElement.style.setProperty(
  '--bg',
  params.get('background') || 'radial-gradient(circle at top left, #ecfeff, #f8fafc 60%)'
);
document.documentElement.style.setProperty('--surface', params.get('surface') || '#ffffff');
document.documentElement.style.setProperty('--border', params.get('borderColor') || '#d9e2ec');
document.documentElement.style.setProperty('--text', params.get('textColor') || '#17324d');
document.documentElement.style.setProperty('--muted', params.get('mutedColor') || '#5f7388');
document.documentElement.style.setProperty(
  '--shadow',
  params.get('shadow') || '0 18px 40px rgba(15, 23, 42, 0.18)'
);
document.documentElement.style.setProperty(
  '--status-bg',
  params.get('statusBackground') || 'rgba(255, 255, 255, 0.75)'
);
document.documentElement.style.setProperty(
  '--secondary-bg',
  params.get('secondaryBackground') || '#ffffff'
);
document.documentElement.style.setProperty(
  '--secondary-text',
  params.get('secondaryTextColor') || '#17324d'
);
document.documentElement.style.setProperty('--radius', params.get('borderRadius') || '24px');
document.documentElement.style.setProperty(
  '--font-family',
  params.get('fontFamily') || '"Segoe UI", Arial, sans-serif'
);

const eyebrowText = params.get('eyebrowText');
if (eyebrowText) {
  const eyebrowEl = document.querySelector('.widget__eyebrow');
  if (eyebrowEl) {
    eyebrowEl.textContent = eyebrowText;
  }
}

const fineprintText = params.get('fineprintText');
const showFineprint = params.get('showFineprint') !== 'false';
if (!showFineprint) {
  fineprintEl.classList.add('hidden');
} else if (fineprintText) {
  fineprintEl.textContent = fineprintText;
}

const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
if (mobile && fallbackNumber) {
  fallbackLink.href = `tel:${fallbackNumber}`;
  fallbackLink.classList.remove('hidden');
}

callButton.addEventListener('click', startCall);
hangupButton.addEventListener('click', hangUp);

async function startCall() {
  if (callActive || isStarting) {
    return;
  }

  if (mobile && fallbackNumber) {
    statusEl.textContent = 'Mobile browser detected. Phone fallback is also available.';
  }

  const ClientConstructor = getWebCallClientConstructor();

  if (!webCallSdk || !ClientConstructor) {
    logClient('error', 'Web call SDK not available');
    statusEl.textContent = 'El motor de voz no esta disponible.';
    return;
  }

  isStarting = true;
  setBusy(true);
  statusEl.textContent = 'Preparando microfono...';
  logClient('info', 'Call button clicked', {
    route,
    mobile,
    supported: Boolean(window.RTCPeerConnection)
  });

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    logClient('info', 'Microphone access granted');

    if (!client) {
      client = new ClientConstructor();
      bindClientEvents(client);
    }

    const payload = await createWebCall();
    logClient('info', 'Voice session received', {
      callId: payload.callId,
      agentId: payload.agentId,
      expiresInSeconds: payload.expiresInSeconds
    });

    statusEl.textContent = 'Conectando con el asistente...';
    logClient('info', 'Starting voice session', {
      route,
      callId: payload.callId,
      agentId: payload.agentId
    });

    await client.startCall({
      accessToken: payload.accessToken
    });

    if (typeof client.startAudioPlayback === 'function') {
      await client.startAudioPlayback();
    }
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message || 'No se pudo iniciar la llamada.';
    setBusy(false);
    isStarting = false;
    logClient('error', 'Call start failed', serializeError(error));
  }
}

function hangUp() {
  if (!client) {
    return;
  }

  client.stopCall();
  callActive = false;
  isStarting = false;
  statusEl.textContent = 'Llamada finalizada';
  setBusy(false);
  logClient('info', 'Call ended by user');
}

async function createWebCall() {
  const response = await fetch('/voice/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'omit',
    body: JSON.stringify({ route })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not start the voice session.');
  }

  return response.json();
}

function setBusy(isBusy) {
  callButton.disabled = isBusy;
  hangupButton.disabled = !isBusy;
}

function darkenColor(hex) {
  const value = hex.replace('#', '');
  if (value.length !== 6) {
    return '#115e59';
  }

  const amount = -24;
  const red = Math.max(0, Math.min(255, parseInt(value.slice(0, 2), 16) + amount));
  const green = Math.max(0, Math.min(255, parseInt(value.slice(2, 4), 16) + amount));
  const blue = Math.max(0, Math.min(255, parseInt(value.slice(4, 6), 16) + amount));

  return `#${[red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
    code: error?.code,
    causes: error?.causes,
    explanation: error?.explanation,
    solution: error?.solutions || error?.solution
  };
}

function logClient(level, message, details) {
  fetch('/client-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ level, message, details })
  }).catch(() => {});
}

function bindClientEvents(sessionClient) {
  sessionClient.on('call_started', () => {
    callActive = true;
    isStarting = false;
    statusEl.textContent = 'Llamada iniciada';
    callButton.disabled = true;
    hangupButton.disabled = false;
    logClient('info', 'Call started');
  });

  sessionClient.on('call_ready', () => {
    statusEl.textContent = 'Conectado';
    callButton.disabled = true;
    hangupButton.disabled = false;
    logClient('info', 'Call ready');
  });

  sessionClient.on('call_ended', () => {
    callActive = false;
    isStarting = false;
    statusEl.textContent = 'Llamada finalizada';
    setBusy(false);
    logClient('info', 'Call ended');
  });

  sessionClient.on('agent_start_talking', () => {
    statusEl.textContent = 'Asistente hablando...';
    logClient('info', 'Agent started talking');
  });

  sessionClient.on('agent_stop_talking', () => {
    statusEl.textContent = 'Escuchando...';
    logClient('info', 'Agent stopped talking');
  });

  sessionClient.on('metadata', (metadata) => {
    logClient('info', 'Call metadata received', metadata || null);
  });

  sessionClient.on('error', (error) => {
    callActive = false;
    isStarting = false;
    statusEl.textContent = error?.message || String(error || 'La llamada fallo');
    setBusy(false);
    logClient('error', 'Web call client error', serializeError(error));
  });
}

function resolveWebCallSdk() {
  const globalName = ['re', 'tell', 'Client', 'Js', 'Sdk'].join('');
  return window[globalName] || null;
}

function getWebCallClientConstructor() {
  if (!webCallSdk) {
    return null;
  }

  const constructorName = ['Re', 'tell', 'Web', 'Client'].join('');
  return webCallSdk[constructorName] || null;
}
