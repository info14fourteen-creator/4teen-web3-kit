let activeConnection = null;
let activeModal = null;
let pendingPromise = null;
let isConnecting = false;

const WALLET_ORDER = ['okx', 'binance', 'trust', 'tronlink'];
const FALLBACK_WALLET_ORDER = ['tronlink', 'okx', 'binance', 'trust'];

function getWalletApi() {
  if (!window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  return window.FourteenWallet;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isOKXInAppBrowser() {
  const ua = getUserAgent();
  return /OKX|OKApp/i.test(ua) || !!window?.okxwallet;
}

function isBinanceInAppBrowser() {
  const ua = getUserAgent();
  return /Binance/i.test(ua) || !!window?.binancew3w || !!window?.BinanceChain;
}

function isTrustInAppBrowser() {
  const ua = getUserAgent();
  return /Trust|TrustWallet/i.test(ua) || !!window?.trustwallet || !!window?.trustWallet;
}

function prettyWalletName(type) {
  switch (type) {
    case 'tronlink':
      return 'TronLink';
    case 'okx':
      return 'OKX Wallet';
    case 'binance':
      return 'Binance Web3 Wallet';
    case 'trust':
      return 'Trust Wallet';
    default:
      return type;
  }
}

function resolveDetectedWallets(rawDetected = {}) {
  const detected = {
    tronlink: Boolean(rawDetected.tronlink),
    okx: Boolean(rawDetected.okx),
    binance: Boolean(rawDetected.binance),
    trust: Boolean(rawDetected.trust)
  };

  if (detected.okx && isOKXInAppBrowser()) {
    return {
      tronlink: false,
      okx: true,
      binance: false,
      trust: false
    };
  }

  if (detected.binance && isBinanceInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: true,
      trust: false
    };
  }

  if (detected.trust && isTrustInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: false,
      trust: true
    };
  }

  return detected;
}

function getDetectedWallets() {
  const wallet = getWalletApi();
  const detected = wallet.detectWallets?.() || {};
  return resolveDetectedWallets(detected);
}

function getAvailableWallets() {
  const detected = getDetectedWallets();
  return WALLET_ORDER.filter((type) => detected[type]);
}

function getFallbackWallets() {
  return FALLBACK_WALLET_ORDER.slice();
}

function getCurrentConnection() {
  const wallet = window.FourteenWallet;

  if (activeConnection?.tronWeb?.defaultAddress?.base58) {
    return activeConnection;
  }

  if (!wallet) {
    return activeConnection;
  }

  if (wallet.isConnected?.()) {
    const state =
      wallet.getState?.() ||
      wallet.getWalletState?.() ||
      null;

    const tronWeb = wallet.getTronWeb?.();
    const address =
      state?.address ||
      wallet.getAddress?.() ||
      tronWeb?.defaultAddress?.base58 ||
      null;

    if (tronWeb && address) {
      activeConnection = {
        ...(state || {}),
        walletType: state?.walletType || state?.type || activeConnection?.walletType || null,
        address,
        tronWeb,
        provider: state?.provider || activeConnection?.provider || null
      };

      return activeConnection;
    }
  }

  return activeConnection;
}

function removeWalletModal() {
  if (activeModal?.parentNode) {
    activeModal.parentNode.removeChild(activeModal);
  }

  activeModal = null;
}

function normalizeConnectResult(result, walletType) {
  const wallet = getWalletApi();
  const state =
    result ||
    wallet.getState?.() ||
    wallet.getWalletState?.() ||
    {};

  const tronWeb = state?.tronWeb || wallet.getTronWeb?.();
  const address =
    state?.address ||
    wallet.getAddress?.() ||
    tronWeb?.defaultAddress?.base58 ||
    null;

  if (!tronWeb || !address) {
    throw new Error(`${prettyWalletName(walletType)} did not provide a ready TRON account`);
  }

  return {
    ...state,
    walletType: state?.walletType || state?.type || walletType,
    address,
    tronWeb,
    provider: state?.provider || null
  };
}

function createBaseButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.width = '100%';
  btn.style.padding = '14px 16px';
  btn.style.borderRadius = '14px';
  btn.style.border = '1px solid rgba(255,255,255,0.10)';
  btn.style.background = '#181818';
  btn.style.color = '#ffffff';
  btn.style.fontSize = '15px';
  btn.style.fontWeight = '600';
  btn.style.cursor = 'pointer';
  btn.style.textAlign = 'left';
  btn.style.transition = 'all 0.18s ease';
  btn.style.outline = 'none';
  return btn;
}

function setButtonIdleStyles(btn) {
  btn.style.background = '#181818';
  btn.style.borderColor = 'rgba(255,255,255,0.10)';
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
}

function setButtonBusyStyles(btn) {
  btn.style.background = '#232323';
  btn.style.borderColor = 'rgba(255,255,255,0.16)';
  btn.style.opacity = '0.8';
  btn.style.cursor = 'wait';
}

function disableAllWalletButtons(buttons, except = null) {
  buttons.forEach((btn) => {
    btn.disabled = true;

    if (btn === except) {
      setButtonBusyStyles(btn);
    } else {
      btn.style.opacity = '0.45';
      btn.style.cursor = 'not-allowed';
    }
  });
}

function enableAllWalletButtons(buttons) {
  buttons.forEach((btn) => {
    btn.disabled = false;
    setButtonIdleStyles(btn);
  });
}

function createWalletModal(options, resolve, reject) {
  removeWalletModal();

  const wallet = getWalletApi();

  const overlay = document.createElement('div');
  overlay.id = 'fourteenWalletModal';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.72)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.webkitBackdropFilter = 'blur(4px)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px';

  const box = document.createElement('div');
  box.style.width = '100%';
  box.style.maxWidth = '420px';
  box.style.background = '#0f0f0f';
  box.style.border = '1px solid rgba(255,255,255,0.08)';
  box.style.borderRadius = '20px';
  box.style.boxShadow = '0 24px 70px rgba(0,0,0,0.45)';
  box.style.padding = '22px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '12px';
  header.style.marginBottom = '10px';

  const titleWrap = document.createElement('div');

  const title = document.createElement('div');
  title.textContent = 'Select Wallet';
  title.style.color = '#ffffff';
  title.style.fontSize = '20px';
  title.style.fontWeight = '700';
  title.style.lineHeight = '1.2';

  const subtitle = document.createElement('div');
  subtitle.textContent = options.length
    ? 'Choose the wallet you want to use.'
    : 'No wallet was detected automatically. You can still try one manually.';
  subtitle.style.color = 'rgba(255,255,255,0.68)';
  subtitle.style.fontSize = '14px';
  subtitle.style.lineHeight = '1.45';
  subtitle.style.marginTop = '6px';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const closeX = document.createElement('button');
  closeX.type = 'button';
  closeX.textContent = '×';
  closeX.style.width = '38px';
  closeX.style.height = '38px';
  closeX.style.borderRadius = '12px';
  closeX.style.border = '1px solid rgba(255,255,255,0.1)';
  closeX.style.background = 'transparent';
  closeX.style.color = '#ffffff';
  closeX.style.fontSize = '24px';
  closeX.style.lineHeight = '1';
  closeX.style.cursor = 'pointer';
  closeX.style.flexShrink = '0';

  header.appendChild(titleWrap);
  header.appendChild(closeX);

  const list = document.createElement('div');
  list.style.display = 'grid';
  list.style.gap = '10px';
  list.style.marginTop = '18px';

  const errorBox = document.createElement('div');
  errorBox.style.display = 'none';
  errorBox.style.marginTop = '14px';
  errorBox.style.padding = '12px 14px';
  errorBox.style.borderRadius = '12px';
  errorBox.style.background = 'rgba(127,29,29,0.28)';
  errorBox.style.border = '1px solid rgba(239,68,68,0.24)';
  errorBox.style.color = '#fecaca';
  errorBox.style.fontSize = '13px';
  errorBox.style.lineHeight = '1.45';

  const manualOrder = options.length ? options : getFallbackWallets();
  const walletButtons = [];

  function closeModalWithError(message) {
    removeWalletModal();
    pendingPromise = null;
    isConnecting = false;
    reject(new Error(message));
  }

  function clearError() {
    errorBox.style.display = 'none';
    errorBox.textContent = '';
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  manualOrder.forEach((walletType) => {
    const btn = createBaseButton();
    const available = options.includes(walletType);

    btn.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#fff;">${prettyWalletName(walletType)}</div>
          <div style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:4px;">
            ${available ? 'Detected in this browser' : 'Try manually'}
          </div>
        </div>
        <div style="font-size:12px; color:${available ? '#86efac' : 'rgba(255,255,255,0.45)'};">
          ${available ? 'Available' : 'Manual'}
        </div>
      </div>
    `;

    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) {
        btn.style.background = '#202020';
        btn.style.borderColor = 'rgba(255,255,255,0.18)';
      }
    });

    btn.addEventListener('mouseleave', () => {
      if (!btn.disabled) {
        setButtonIdleStyles(btn);
      }
    });

    btn.addEventListener('click', async () => {
      if (isConnecting) return;

      clearError();
      isConnecting = true;
      disableAllWalletButtons(walletButtons, btn);

      const originalHtml = btn.innerHTML;
      btn.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
          <div style="font-size:15px; font-weight:700; color:#fff;">Connecting ${prettyWalletName(walletType)}...</div>
          <div style="font-size:12px; color:rgba(255,255,255,0.65);">Please confirm</div>
        </div>
      `;

      try {
        const result = await wallet.connect(walletType);
        const connection = normalizeConnectResult(result, walletType);

        activeConnection = connection;
        removeWalletModal();
        pendingPromise = null;
        isConnecting = false;

        resolve(connection);
      } catch (error) {
        console.error(`[walletController] ${walletType} connect error:`, error);

        isConnecting = false;
        btn.innerHTML = originalHtml;
        enableAllWalletButtons(walletButtons);

        const message =
          error?.message ||
          `${prettyWalletName(walletType)} connection failed`;

        showError(message);
      }
    });

    walletButtons.push(btn);
    list.appendChild(btn);
  });

  const footer = document.createElement('div');
  footer.style.marginTop = '16px';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.gap = '10px';

  const hint = document.createElement('div');
  hint.textContent = 'If several wallets are installed, choose the one you want to use.';
  hint.style.fontSize = '12px';
  hint.style.lineHeight = '1.4';
  hint.style.color = 'rgba(255,255,255,0.48)';
  hint.style.flex = '1';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.padding = '11px 14px';
  closeBtn.style.borderRadius = '12px';
  closeBtn.style.border = '1px solid rgba(255,255,255,0.10)';
  closeBtn.style.background = 'transparent';
  closeBtn.style.color = 'rgba(255,255,255,0.9)';
  closeBtn.style.fontSize = '14px';
  closeBtn.style.fontWeight = '600';
  closeBtn.style.cursor = 'pointer';

  footer.appendChild(hint);
  footer.appendChild(closeBtn);

  function handleClose() {
    if (isConnecting) return;
    closeModalWithError('Wallet connection cancelled');
  }

  closeBtn.addEventListener('click', handleClose);
  closeX.addEventListener('click', handleClose);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      handleClose();
    }
  });

  box.appendChild(header);
  box.appendChild(list);
  box.appendChild(errorBox);
  box.appendChild(footer);
  overlay.appendChild(box);

  document.body.appendChild(overlay);
  activeModal = overlay;
}

export async function connectWallet() {
  const existing = getCurrentConnection();
  if (existing?.tronWeb?.defaultAddress?.base58) {
    return existing;
  }

  if (pendingPromise) {
    return pendingPromise;
  }

  const available = getAvailableWallets();

  pendingPromise = new Promise((resolve, reject) => {
    createWalletModal(available, resolve, reject);
  }).finally(() => {
    pendingPromise = null;
  });

  return pendingPromise;
}

export function getWallet() {
  return getCurrentConnection();
}

export function resetWalletConnection() {
  activeConnection = null;
  pendingPromise = null;
  isConnecting = false;
  removeWalletModal();
}

export function isWalletModalOpen() {
  return Boolean(activeModal);
}
