(function () {
  const globalName = 'InferenciaDigitalVoice';

  function mount(options) {
    const normalized = normalizeOptions(options || {});
    const iframe = document.createElement('iframe');

    iframe.src = buildFrameUrl(normalized);
    iframe.title = normalized.title || 'Asistente de Voz';
    iframe.allow = 'microphone';
    iframe.setAttribute('scrolling', 'no');
    iframe.style.border = '0';
    iframe.style.background = 'transparent';
    iframe.style.overflow = 'hidden';
    iframe.style.display = 'block';

    applyIframeLayout(iframe, normalized);

    const container = resolveContainer(normalized.container);
    container.appendChild(iframe);

    return {
      iframe,
      destroy() {
        iframe.remove();
      }
    };
  }

  function bootFromCurrentScript() {
    const currentScript =
      document.currentScript ||
      Array.from(document.getElementsByTagName('script')).slice(-1)[0];

    if (!currentScript || currentScript.dataset.autoInit === 'false') {
      return;
    }

    mount(optionsFromScript(currentScript));
  }

  function normalizeOptions(options) {
    const scriptUrl = new URL(
      options.scriptSrc || findCurrentScriptSrc() || '/embed.js',
      window.location.href
    );
    const mode = options.mode === 'inline' ? 'inline' : 'floating';

    return {
      baseUrl: options.baseUrl || scriptUrl.origin,
      container: options.container || null,
      mode,
      route: options.route || 'default',
      title: options.title || 'Habla con Nosotros',
      bodyText:
        options.bodyText ||
        'Inicia una llamada desde el navegador. Te solicitaremos acceso al microfono y, si hace falta, la llamada puede transferirse.',
      buttonText: options.buttonText || 'Iniciar Llamada',
      eyebrowText: options.eyebrowText || 'Asistente de Voz',
      fineprintText:
        options.fineprintText ||
        'Operado por Inferencia Digital.',
      showFineprint: options.showFineprint !== false,
      accent: options.color || options.accent || '#0f766e',
      buttonTextColor: options.buttonTextColor || '#ffffff',
      background:
        options.background || 'radial-gradient(circle at top left, #ecfeff, #f8fafc 60%)',
      surface: options.surface || '#ffffff',
      borderColor: options.borderColor || '#d9e2ec',
      textColor: options.textColor || '#17324d',
      mutedColor: options.mutedColor || '#5f7388',
      shadow: options.shadow || '0 18px 40px rgba(15, 23, 42, 0.18)',
      statusBackground: options.statusBackground || 'rgba(255, 255, 255, 0.75)',
      secondaryBackground: options.secondaryBackground || '#ffffff',
      secondaryTextColor: options.secondaryTextColor || '#17324d',
      borderRadius: String(options.borderRadius || '24px'),
      fontFamily: options.fontFamily || '"Segoe UI", Arial, sans-serif',
      width: normalizeSize(options.width || '360px'),
      height: normalizeSize(options.height || '460px'),
      mobileHeight: normalizeSize(options.mobileHeight || '400px'),
      right: normalizeSize(options.right || '20px'),
      left: normalizeSize(options.left || ''),
      bottom: normalizeSize(options.bottom || '20px'),
      top: normalizeSize(options.top || ''),
      zIndex: String(options.zIndex || '999999')
    };
  }

  function buildFrameUrl(options) {
    const url = new URL('/widget/frame', options.baseUrl);

    const query = {
      route: options.route,
      title: options.title,
      bodyText: options.bodyText,
      buttonText: options.buttonText,
      eyebrowText: options.eyebrowText,
      fineprintText: options.fineprintText,
      showFineprint: String(options.showFineprint),
      accent: options.accent,
      buttonTextColor: options.buttonTextColor,
      background: options.background,
      surface: options.surface,
      borderColor: options.borderColor,
      textColor: options.textColor,
      mutedColor: options.mutedColor,
      shadow: options.shadow,
      statusBackground: options.statusBackground,
      secondaryBackground: options.secondaryBackground,
      secondaryTextColor: options.secondaryTextColor,
      borderRadius: options.borderRadius,
      fontFamily: options.fontFamily
    };

    Object.entries(query).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  function applyIframeLayout(iframe, options) {
    const mobile = window.matchMedia('(max-width: 640px)').matches;

    if (options.mode === 'inline') {
      iframe.style.position = 'relative';
      iframe.style.width = '100%';
      iframe.style.height = mobile ? options.mobileHeight : options.height;
      iframe.style.minHeight = mobile ? options.mobileHeight : options.height;
      return;
    }

    iframe.style.position = 'fixed';
    iframe.style.width = mobile ? 'auto' : options.width;
    iframe.style.height = mobile ? options.mobileHeight : options.height;
    iframe.style.zIndex = options.zIndex;
    iframe.style.right = mobile ? '12px' : options.right;
    iframe.style.left = mobile ? '12px' : options.left;
    iframe.style.bottom = mobile ? '12px' : options.bottom;
    iframe.style.top = mobile ? '' : options.top;
  }

  function resolveContainer(container) {
    if (!container) {
      return document.body;
    }

    if (typeof container === 'string') {
      const element = document.querySelector(container);
      if (!element) {
        throw new Error(`InferenciaDigitalVoice container not found: ${container}`);
      }
      return element;
    }

    return container;
  }

  function optionsFromScript(script) {
    return {
      scriptSrc: script.src,
      container: script.dataset.container || null,
      mode: script.dataset.mode || 'floating',
      route: script.dataset.route || 'default',
      title: script.dataset.title || 'Habla con Nosotros',
      bodyText: script.dataset.bodyText,
      buttonText: script.dataset.buttonText || 'Iniciar Llamada',
      eyebrowText: script.dataset.eyebrowText,
      fineprintText: script.dataset.fineprintText,
      showFineprint: script.dataset.showFineprint !== 'false',
      color: script.dataset.color,
      buttonTextColor: script.dataset.buttonTextColor,
      background: script.dataset.background,
      surface: script.dataset.surface,
      borderColor: script.dataset.borderColor,
      textColor: script.dataset.textColor,
      mutedColor: script.dataset.mutedColor,
      shadow: script.dataset.shadow,
      statusBackground: script.dataset.statusBackground,
      secondaryBackground: script.dataset.secondaryBackground,
      secondaryTextColor: script.dataset.secondaryTextColor,
      borderRadius: script.dataset.borderRadius,
      fontFamily: script.dataset.fontFamily,
      width: script.dataset.width,
      height: script.dataset.height,
      mobileHeight: script.dataset.mobileHeight,
      right: script.dataset.right,
      left: script.dataset.left,
      bottom: script.dataset.bottom,
      top: script.dataset.top,
      zIndex: script.dataset.zIndex
    };
  }

  function findCurrentScriptSrc() {
    const script =
      document.currentScript ||
      Array.from(document.getElementsByTagName('script')).slice(-1)[0];

    return script ? script.src : null;
  }

  function normalizeSize(value) {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    return String(value);
  }

  window[globalName] = {
    mount
  };

  bootFromCurrentScript();
})();
