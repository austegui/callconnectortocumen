const params = new URLSearchParams(window.location.search);
const route = params.get('route') || 'default';
const title = params.get('title') || 'Habla con Nosotros';
const buttonText = params.get('buttonText') || 'Iniciar Llamada';
const accent = params.get('accent') || '#0f766e';
const fallbackNumber = params.get('fallbackNumber') || '';

const titleEl = document.getElementById('title');
const bodyEl = document.getElementById('body');
const fineprintEl = document.getElementById('fineprint');
const statusEl = document.getElementById('status');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const fallbackLink = document.getElementById('fallbackLink');

let device = null;
let activeCall = null;
let isStarting = false;

titleEl.textContent = title;
bodyEl.textContent =
  params.get('bodyText') ||
  'Inicia una llamada desde el navegador. Te solicitaremos acceso al microfono y, si hace falta, la llamada puede transferirse.';
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
window.addEventListener('beforeunload', () => {
  if (device) {
    device.destroy();
  }
});

async function startCall() {
  if (activeCall || isStarting) {
    return;
  }

  const DeviceConstructor = resolveTwilioDeviceConstructor();
  if (!DeviceConstructor) {
    logClient('error', 'Twilio Voice SDK no disponible');
    setStatus('El motor de voz no esta disponible.');
    return;
  }

  isStarting = true;
  setButtons({ canStart: false, canHangup: false });
  setStatus('Preparando microfono...');

  logClient('info', 'Call button clicked', {
    route,
    mobile,
    supported: Boolean(window.RTCPeerConnection)
  });

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    logClient('info', 'Microphone access granted');

    const tokenPayload = await fetchVoiceToken();
    logClient('info', 'Voice token received', {
      identity: tokenPayload.identity,
      expiresInSeconds: tokenPayload.expiresInSeconds
    });

    if (!device) {
      device = createDevice(DeviceConstructor, tokenPayload.token);
      bindDeviceEvents(device);
    } else {
      await device.updateToken(tokenPayload.token);
      logClient('info', 'Voice token refreshed');
    }

    setStatus('Conectando con la central...');
    logClient('info', 'Starting outbound connection', { route });

    activeCall = await device.connect({
      params: {
        route
      }
    });

    setButtons({ canStart: false, canHangup: true });
    bindCallEvents(activeCall);
    logClient('info', 'Twilio call object created');
  } catch (error) {
    console.error(error);
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus(error.message || 'No se pudo iniciar la llamada.');
    logClient('error', 'Call start failed', serializeError(error));
  }
}

function hangUp() {
  if (!activeCall) {
    return;
  }

  activeCall.disconnect();
  logClient('info', 'Call ended by user');
}

async function fetchVoiceToken() {
  const response = await fetch(`/voice/token?route=${encodeURIComponent(route)}`, {
    method: 'GET',
    credentials: 'omit'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'No se pudo obtener el acceso de voz.');
  }

  return response.json();
}

function createDevice(DeviceConstructor, token) {
  return new DeviceConstructor(token, {
    appName: 'inferencia-digital-transfer-widget',
    appVersion: '1.0.0',
    codecPreferences: ['opus', 'pcmu'],
    tokenRefreshMs: 30000
  });
}

function bindDeviceEvents(voiceDevice) {
  voiceDevice.on('registering', () => {
    setStatus('Registrando dispositivo...');
    logClient('info', 'Twilio device registering');
  });

  voiceDevice.on('registered', () => {
    logClient('info', 'Twilio device registered');
  });

  voiceDevice.on('tokenWillExpire', async () => {
    try {
      const tokenPayload = await fetchVoiceToken();
      await voiceDevice.updateToken(tokenPayload.token);
      logClient('info', 'Twilio token refreshed');
    } catch (error) {
      logClient('error', 'Twilio token refresh failed', serializeError(error));
    }
  });

  voiceDevice.on('error', (error) => {
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus(error?.message || 'La llamada fallo.');
    logClient('error', 'Twilio device error', serializeError(error));
  });
}

function bindCallEvents(call) {
  call.on('ringing', () => {
    isStarting = false;
    setStatus('Timbrando...');
    setButtons({ canStart: false, canHangup: true });
    logClient('info', 'Call ringing');
  });

  call.on('accept', () => {
    isStarting = false;
    setStatus('Llamada conectada');
    setButtons({ canStart: false, canHangup: true });
    logClient('info', 'Call accepted');
  });

  call.on('reconnecting', (error) => {
    setStatus('Reconectando...');
    logClient('info', 'Call reconnecting', serializeError(error));
  });

  call.on('reconnected', () => {
    setStatus('Conexion restablecida');
    logClient('info', 'Call reconnected');
  });

  call.on('disconnect', () => {
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus('Llamada finalizada');
    logClient('info', 'Call disconnected');
  });

  call.on('cancel', () => {
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus('La llamada fue cancelada.');
    logClient('info', 'Call cancelled');
  });

  call.on('reject', () => {
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus('La llamada fue rechazada.');
    logClient('info', 'Call rejected');
  });

  call.on('error', (error) => {
    activeCall = null;
    isStarting = false;
    setButtons({ canStart: true, canHangup: false });
    setStatus(error?.message || 'La llamada fallo.');
    logClient('error', 'Call error', serializeError(error));
  });
}

function setButtons({ canStart, canHangup }) {
  callButton.disabled = !canStart;
  hangupButton.disabled = !canHangup;
}

function setStatus(value) {
  statusEl.textContent = value;
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
    code: error?.code || error?.twilioError?.code,
    description: error?.description || error?.explanation || null,
    causes: error?.causes || null,
    solutions: error?.solutions || error?.solution || null
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

function resolveTwilioDeviceConstructor() {
  return window.Twilio?.Device || null;
}
