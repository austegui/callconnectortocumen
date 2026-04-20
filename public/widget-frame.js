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

let device = null;
let activeCall = null;
let deviceReady = false;

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
  if (mobile && fallbackNumber) {
    statusEl.textContent = 'Mobile browser detected. Phone fallback is recommended.';
  }

  if (!window.Twilio || !window.Twilio.Device) {
    logClient('error', 'Twilio Voice SDK not available');
    statusEl.textContent = 'Twilio Voice SDK is not available.';
    return;
  }

  setBusy(true);
  statusEl.textContent = 'Preparing audio...';
  logClient('info', 'Call button clicked', { route, mobile, supported: window.Twilio.Device.isSupported });

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    logClient('info', 'Microphone access granted');

    if (!device) {
      const tokenPayload = await fetchToken();
      logClient('info', 'Voice token received', {
        identity: tokenPayload.identity,
        expiresInSeconds: tokenPayload.expiresInSeconds
      });

      device = new window.Twilio.Device(tokenPayload.token, {
        appName: 'call-connector-tocumen',
        appVersion: '1.0.0',
        logLevel: 1
      });

      device.on('registered', () => {
        deviceReady = true;
        statusEl.textContent = 'Ready to connect';
        logClient('info', 'Twilio device registered');
      });

      device.on('registering', () => {
        statusEl.textContent = 'Registering voice device...';
        logClient('info', 'Twilio device registering');
      });

      device.on('unregistered', () => {
        deviceReady = false;
        logClient('warn', 'Twilio device unregistered');
      });

      device.on('error', (error) => {
        logClient('error', 'Twilio device error', serializeError(error));
        statusEl.textContent = `Error: ${error.message}`;
        setBusy(false);
      });

      device.on('tokenWillExpire', async () => {
        try {
          const tokenPayload = await fetchToken();
          await device.updateToken(tokenPayload.token);
          logClient('info', 'Twilio token refreshed');
        } catch (error) {
          console.error('Token refresh failed', error);
          logClient('error', 'Token refresh failed', serializeError(error));
        }
      });
    }

    if (!deviceReady) {
      statusEl.textContent = 'Registering voice device...';
      await device.register();
    }

    statusEl.textContent = 'Connecting call...';
    logClient('info', 'Starting outbound connection', { route });
    activeCall = await device.connect({
      params: { route }
    });

    logClient('info', 'Twilio call object created');

    activeCall.on('accept', () => {
      statusEl.textContent = 'Connected';
      callButton.disabled = true;
      hangupButton.disabled = false;
      logClient('info', 'Call accepted');
    });

    activeCall.on('disconnect', () => {
      statusEl.textContent = 'Call ended';
      activeCall = null;
      setBusy(false);
      logClient('info', 'Call disconnected');
    });

    activeCall.on('cancel', () => {
      statusEl.textContent = 'Call canceled';
      activeCall = null;
      setBusy(false);
      logClient('warn', 'Call canceled');
    });

    activeCall.on('reject', () => {
      statusEl.textContent = 'Call rejected';
      activeCall = null;
      setBusy(false);
      logClient('warn', 'Call rejected');
    });

    activeCall.on('error', (error) => {
      statusEl.textContent = `Call error: ${error.message}`;
      activeCall = null;
      setBusy(false);
      logClient('error', 'Call error', serializeError(error));
    });
  } catch (error) {
    console.error(error);
    statusEl.textContent = error.message || 'Call could not be started.';
    setBusy(false);
    logClient('error', 'Call start failed', serializeError(error));
  }
}

function hangUp() {
  if (!device) {
    return;
  }

  device.disconnectAll();
  activeCall = null;
  statusEl.textContent = 'Call ended';
  setBusy(false);
}

async function fetchToken() {
  const response = await fetch('/voice/token', {
    credentials: 'omit'
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Could not retrieve access token.');
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
    solution: error?.solutions
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
