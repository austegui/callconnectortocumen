const params = new URLSearchParams(window.location.search);
const route = params.get('route') || 'default';
const title = params.get('title') || 'Talk to us';
const buttonText = params.get('buttonText') || 'Call now';
const accent = params.get('accent') || '#0f766e';
const fallbackNumber = params.get('fallbackNumber') || '';

const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const fallbackLink = document.getElementById('fallbackLink');

let client = null;
let callActive = false;
let isStarting = false;

titleEl.textContent = title;
callButton.textContent = buttonText;
document.documentElement.style.setProperty('--accent', accent);
document.documentElement.style.setProperty('--accent-strong', darkenColor(accent));

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

  if (!window.retellClientJsSdk || !window.retellClientJsSdk.RetellWebClient) {
    logClient('error', 'Retell Web SDK not available');
    statusEl.textContent = 'Retell Web SDK is not available.';
    return;
  }

  isStarting = true;
  setBusy(true);
  statusEl.textContent = 'Preparing microphone...';
  logClient('info', 'Call button clicked', {
    route,
    mobile,
    supported: Boolean(window.RTCPeerConnection)
  });

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    logClient('info', 'Microphone access granted');

    if (!client) {
      client = new window.retellClientJsSdk.RetellWebClient();
      bindClientEvents(client);
    }

    const payload = await createWebCall();
    logClient('info', 'Retell web call token received', {
      callId: payload.callId,
      agentId: payload.agentId,
      expiresInSeconds: payload.expiresInSeconds
    });

    statusEl.textContent = 'Connecting to agent...';
    logClient('info', 'Starting Retell web call', {
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
    statusEl.textContent = error.message || 'Call could not be started.';
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
  statusEl.textContent = 'Call ended';
  setBusy(false);
  logClient('info', 'Call ended by user');
}

async function createWebCall() {
  const response = await fetch('/retell/web-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'omit',
    body: JSON.stringify({ route })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not start the Retell web call.');
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

function bindClientEvents(retellClient) {
  retellClient.on('call_started', () => {
    callActive = true;
    isStarting = false;
    statusEl.textContent = 'Call started';
    callButton.disabled = true;
    hangupButton.disabled = false;
    logClient('info', 'Retell call started');
  });

  retellClient.on('call_ready', () => {
    statusEl.textContent = 'Connected';
    callButton.disabled = true;
    hangupButton.disabled = false;
    logClient('info', 'Retell call ready');
  });

  retellClient.on('call_ended', () => {
    callActive = false;
    isStarting = false;
    statusEl.textContent = 'Call ended';
    setBusy(false);
    logClient('info', 'Retell call ended');
  });

  retellClient.on('agent_start_talking', () => {
    statusEl.textContent = 'Agent speaking...';
    logClient('info', 'Agent started talking');
  });

  retellClient.on('agent_stop_talking', () => {
    statusEl.textContent = 'Listening...';
    logClient('info', 'Agent stopped talking');
  });

  retellClient.on('metadata', (metadata) => {
    logClient('info', 'Retell metadata received', metadata || null);
  });

  retellClient.on('error', (error) => {
    callActive = false;
    isStarting = false;
    statusEl.textContent = error?.message || String(error || 'Call failed');
    setBusy(false);
    logClient('error', 'Retell web client error', serializeError(error));
  });
}
