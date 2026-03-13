import { isMobileDevice, openInstallPage, openWalletApp } from './walletLinks.js';

let activeConnection = null;
let activeModal = null;
let activeActionSheet = null;
let pendingPromise = null;
let isConnecting = false;

const FALLBACK_WALLET_ORDER = ['tronlink', 'okx', 'binance', 'trust'];

const WALLET_META = {
  tronlink: {
    label: 'TronLink',
    icon: '🟠'
  },
  okx: {
    label: 'OKX Wallet',
    icon: '⚫'
  },
  binance: {
    label: 'Binance Web3 Wallet',
    icon: '🟡'
  },
  trust: {
    label: 'Trust Wallet',
    icon: '🔵'
  }
};

function debugLog(...args) {
  console.log('[4TEEN][connectModal]', ...args);
}

function getWalletApi() {
  if (typeof window === 'undefined' || !window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  return window.FourteenWallet;
}

function prettyWalletName(type) {
  return WALLET_META[type]?.label || type;
}

function getWalletIcon(type) {
  return WALLET_META[type]?.icon || '⚪';
}

function getDetectedWallets() {
  const wallet = getWalletApi();
  const detected = wallet.detectWallets?.() || {};

  return {
    tronlink: Boolean(detected.tronlink),
    okx: Boolean(detected.okx),
    binance: Boolean(detected.binance),
    trust: Boolean(detected.trust)
  };
}

function getWalletOptions() {
  const wallet = getWalletApi();

  if (typeof wallet.getAvailableWalletOptions === 'function') {
    const options = wallet.getAvailableWalletOptions() || [];

    const normalized = options
      .map((item) => ({
        type: item.type || item.id,
        detected: Boolean(item.detected),
        label: item.label || prettyWalletName(item.type || item.id),
        icon: item.icon || getWalletIcon(item.type || item.id)
      }))
      .filter((item) => item.type)
      .filter((item) => item.type !== 'trust_mobile');

    if (normalized.length) {
      return normalized;
    }
  }

  const detected = getDetectedWallets();

  return FALLBACK_WALLET_ORDER.map((type) => ({
    type,
    detected: Boolean(detected[type]),
    label: prettyWalletName(type),
    icon: getWalletIcon(type)
  }));
}

function getManualOrder() {
  const options = getWalletOptions();
  const ordered = options.map((item) => item.type);
  const known = new Set(ordered);

  return [
    ...ordered,
    ...FALLBACK_WALLET_ORDER.filter((type) => !known.has(type))
  ];
}

function getCurrentConnection() {
  const wallet = typeof window !== 'undefined' ? window.FourteenWallet : null;

  if (activeConnection?.tronWeb && activeConnection?.address) {
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

function removeActionSheet() {
  if (activeActionSheet?.parentNode) {
    activeActionSheet.parentNode.removeChild(activeActionSheet);
  }

  activeActionSheet = null;
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
  btn.style.display = 'flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'space-between';
  btn.style.gap = '12px';
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
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
  btn.style.background = '#181818';
  btn.style.borderColor = 'rgba(255,255,255,0.10)';
}

function setButtonBusyStyles(btn) {
  btn.style.opacity = '0.9';
  btn.style.cursor = 'wait';
  btn.style.background = '#232323';
  btn.style.borderColor = 'rgba(255,255,255,0.16)';
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

function buildWalletButtonHtml(walletType, available) {
  const mobile = isMobileDevice();

  let desc = 'Try manually';
  let status = 'Manual';

  if (available) {
    desc = 'Detected in this browser';
    status = 'Available';
  } else if (mobile) {
    desc = 'Open app or install wallet';
    status = 'Mobile';
  }

  return `
    <div style="display:flex; align-items:center; gap:12px; min-width:0;">
      <div style="font-size:20px; flex-shrink:0;">${getWalletIcon(walletType)}</div>
      <div style="min-width:0;">
        <div style="font-size:15px; font-weight:700; color:#fff;">${prettyWalletName(walletType)}</div>
        <div style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:4px;">${desc}</div>
      </div>
    </div>
    <div style="font-size:12px; color:${available ? '#86efac' : 'rgba(255,255,255,0.45)'}; flex-shrink:0;">
      ${status}
    </div>
  `;
}

function buildConnectingButtonHtml(walletType) {
  return `
    <div style="display:flex; align-items:center; gap:12px; min-width:0;">
      <div style="font-size:20px; flex-shrink:0;">${getWalletIcon(walletType)}</div>
      <div style="min-width:0;">
        <div style="font-size:15px; font-weight:700; color:#fff;">Connecting ${prettyWalletName(walletType)}...</div>
        <div style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:4px;">Please confirm in wallet</div>
      </div>
    </div>
    <div style="font-size:12px; color:rgba(255,255,255,0.45); flex-shrink:0;">
      Waiting
    </div>
  `;
}

function openWalletActionSheet(walletType) {
  removeActionSheet();

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.72)';
  overlay.style.backdropFilter = 'blur(4px)';
  overlay.style.webkitBackdropFilter = 'blur(4px)';
  overlay.style.zIndex = '1000000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '20px';

  const box = document.createElement('div');
  box.style.width = '100%';
  box.style.maxWidth = '380px';
  box.style.background = '#0f0f0f';
  box.style.border = '1px solid rgba(255,255,255,0.08)';
  box.style.borderRadius = '20px';
  box.style.boxShadow = '0 24px 70px rgba(0,0,0,0.45)';
  box.style.padding = '18px';
  box.style.display = 'grid';
  box.style.gap = '10px';

  const title = document.createElement('div');
  title.textContent = prettyWalletName(walletType);
  title.style.color = '#fff';
  title.style.fontSize = '18px';
  title.style.fontWeight = '700';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Choose what to do next.';
  subtitle.style.color = 'rgba(255,255,255,0.65)';
  subtitle.style.fontSize = '14px';
  subtitle.style.lineHeight = '1.45';

  function makeActionButton(text, primary = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    btn.style.width = '100%';
    btn.style.padding = '13px 14px';
    btn.style.borderRadius = '14px';
    btn.style.border = primary
      ? '1px solid rgba(255,255,255,0.18)'
      : '1px solid rgba(255,255,255,0.10)';
    btn.style.background = primary ? '#1d1d1d' : 'transparent';
    btn.style.color = '#fff';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '600';
    btn.style.cursor = 'pointer';
    return btn;
  }

  const openBtn = makeActionButton('Open App', true);
  const installBtn = makeActionButton('Install');
  const cancelBtn = makeActionButton('Cancel');

  function closeSheet() {
    removeActionSheet();
  }

  openBtn.addEventListener('click', () => {
    closeSheet();
    openWalletApp(walletType);
  });

  installBtn.addEventListener('click', () => {
    closeSheet();
    openInstallPage(walletType);
  });

  cancelBtn.addEventListener('click', () => {
    closeSheet();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeSheet();
    }
  });

  box.appendChild(title);
  box.appendChild(subtitle);
  box.appendChild(openBtn);
  box.appendChild(installBtn);
  box.appendChild(cancelBtn);
  overlay.appendChild(box);

  document.body.appendChild(overlay);
  activeActionSheet = overlay;
}

function createWalletModal(options, resolve, reject) {
  removeWalletModal();

  const wallet = getWalletApi();
  const walletButtons = [];
  const normalizedOptions = Array.isArray(options) ? options : [];
  const availableSet = new Set(normalizedOptions);
  const manualOrder = getManualOrder();

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
  subtitle.textContent = 'Choose the wallet you want to use.';
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

  function closeModalWithError(message) {
    removeWalletModal();
    removeActionSheet();
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
    const available = availableSet.has(walletType);
    const btn = createBaseButton();

    btn.innerHTML = buildWalletButtonHtml(walletType, available);

    btn.addEventListener('click', async () => {
      if (isConnecting) return;

      clearError();

      if (!available) {
        if (isMobileDevice()) {
          openWalletActionSheet(walletType);
          return;
        }

        openInstallPage(walletType);
        return;
      }

      isConnecting = true;
      disableAllWalletButtons(walletButtons, btn);

      const originalHtml = btn.innerHTML;
      btn.innerHTML = buildConnectingButtonHtml(walletType);

      try {
        debugLog('manual connect start:', walletType);

        const result = await wallet.connect(walletType);

        if (result?.mode === 'redirect' || result?.pending === true) {
          removeWalletModal();
          isConnecting = false;
          resolve(result);
          return;
        }

        const connection = normalizeConnectResult(result, walletType);

        activeConnection = connection;
        removeWalletModal();
        pendingPromise = null;
        isConnecting = false;

        debugLog('manual connect success:', walletType);
        resolve(connection);
      } catch (error) {
        console.error(`[connectModal] ${walletType} connect error:`, error);

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
  hint.style.fontSize = '12px';
  hint.style.lineHeight = '1.4';
  hint.style.color = 'rgba(255,255,255,0.48)';
  hint.style.flex = '1';
  hint.textContent = isMobileDevice()
    ? 'On mobile you can open the wallet app or install it.'
    : 'If a wallet is not installed, the install page will open.';

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

export async function openConnectModal() {
  debugLog('openConnectModal called');

  const existing = getCurrentConnection();
  if (existing?.tronWeb && existing?.address) {
    return existing;
  }

  if (pendingPromise) {
    return pendingPromise;
  }

  pendingPromise = new Promise((resolve, reject) => {
    const available = getWalletOptions()
      .filter((item) => item.type !== 'trust_mobile')
      .filter((item) => FALLBACK_WALLET_ORDER.includes(item.type))
      .map((item) => item.type);

    createWalletModal(available, resolve, reject);
  }).finally(() => {
    pendingPromise = null;
  });

  return pendingPromise;
}

export async function connectWallet() {
  return openConnectModal();
}

export function getWallet() {
  return getCurrentConnection();
}

export function resetWalletConnection() {
  activeConnection = null;
  pendingPromise = null;
  isConnecting = false;
  removeWalletModal();
  removeActionSheet();
}

export function isWalletModalOpen() {
  return Boolean(activeModal);
}
