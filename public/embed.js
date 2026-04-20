(function () {
  const currentScript =
    document.currentScript ||
    Array.from(document.getElementsByTagName('script')).slice(-1)[0];

  if (!currentScript) {
    return;
  }

  const scriptUrl = new URL(currentScript.src, window.location.href);
  const baseUrl = scriptUrl.origin;
  const route = currentScript.dataset.route || 'default';
  const title = currentScript.dataset.title || 'Talk to us';
  const buttonText = currentScript.dataset.buttonText || 'Call now';
  const accent = currentScript.dataset.color || '#0f766e';
  const fallbackNumber = currentScript.dataset.fallbackNumber || '';

  const iframe = document.createElement('iframe');
  iframe.src =
    `${baseUrl}/widget/frame?route=${encodeURIComponent(route)}` +
    `&title=${encodeURIComponent(title)}` +
    `&buttonText=${encodeURIComponent(buttonText)}` +
    `&accent=${encodeURIComponent(accent)}` +
    `&fallbackNumber=${encodeURIComponent(fallbackNumber)}`;
  iframe.title = title;
  iframe.allow = 'microphone';
  iframe.style.position = 'fixed';
  iframe.style.right = '20px';
  iframe.style.bottom = '20px';
  iframe.style.width = '360px';
  iframe.style.height = '460px';
  iframe.style.border = '0';
  iframe.style.zIndex = '999999';
  iframe.style.background = 'transparent';
  iframe.style.overflow = 'hidden';

  const mobile = window.matchMedia('(max-width: 640px)').matches;
  if (mobile) {
    iframe.style.right = '12px';
    iframe.style.left = '12px';
    iframe.style.bottom = '12px';
    iframe.style.width = 'auto';
    iframe.style.height = '400px';
  }

  document.body.appendChild(iframe);
})();
