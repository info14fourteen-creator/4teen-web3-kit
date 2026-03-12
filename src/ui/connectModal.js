let activeConnection = null;
let activeModal = null;
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
      .filter((item) => item.type);

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

function getAvailableWallets() {
  return getWalletOptions()
    .filter((item) => item.detected)
    .map((item) => item.type);
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
  btn.className = 'fw-wallet-btn';
  return btn;
}

function setButtonIdleStyles(btn) {
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
  btn.style.background = '';
  btn.style.borderColor = '';
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
  return `
    <div class="fw-wallet-left">
      <div class="fw-wallet-icon">${getWalletIcon(walletType)}</div>
      <div>
        <div class="fw-wallet-name">${prettyWalletName(walletType)}</div>
        <div class="fw-wallet-desc">
          ${available ? 'Detected in this browser' : 'Try manually'}
        </div>
      </div>
    </div>
    <div class="fw-wallet-status ${available ? 'available' : 'manual'}">
      ${available ? 'Available' : 'Manual'}
    </div>
  `;
}

function buildConnectingButtonHtml(walletType) {
  return `
    <div class="fw-wallet-left">
      <div class="fw-wallet-icon">${getWalletIcon(walletType)}</div>
      <div>
        <div class="fw-wallet-name">Connecting ${prettyWalletName(walletType)}...</div>
        <div class="fw-wallet-desc">Please confirm in wallet</div>
      </div>
    </div>
    <div class="fw-wallet-status manual">Waiting</div>
  `;
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

  const box = document.createElement('div');
  box.className = 'fw-modal';

  const header = document.createElement('div');
  header.className = 'fw-header';

  const titleWrap = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'fw-title';
  title.textContent = 'Select Wallet';

  const subtitle = document.createElement('div');
  subtitle.className = 'fw-subtitle';
  subtitle.textContent = normalizedOptions.length
    ? 'Choose the wallet you want to use.'
    : 'No wallet was detected automatically. You can still try one manually.';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const closeX = document.createElement('button');
  closeX.type = 'button';
  closeX.className = 'fw-close';
  closeX.textContent = '×';

  header.appendChild(titleWrap);
  header.appendChild(closeX);

  const list = document.createElement('div');
  list.className = 'fw-wallet-list';

  const errorBox = document.createElement('div');
  errorBox.className = 'fw-error';
  errorBox.style.display = 'none';

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
    const available = availableSet.has(walletType);
    const btn = createBaseButton();

    btn.innerHTML = buildWalletButtonHtml(walletType, available);

    btn.addEventListener('click', async () => {
      if (isConnecting) return;

      clearError();
      isConnecting = true;
      disableAllWalletButtons(walletButtons, btn);

      const originalHtml = btn.innerHTML;
      btn.innerHTML = buildConnectingButtonHtml(walletType);

      try {
        debugLog('manual connect start:', walletType);

        const result = await wallet.connect(walletType);
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
  footer.className = 'fw-footer';

  const hint = document.createElement('div');
  hint.className = 'fw-hint';
  hint.textContent = 'If several wallets are installed, choose the one you want to use.';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'fw-close-btn';
  closeBtn.textContent = 'Close';

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

  const available = getAvailableWallets();

  if (available.length === 1) {
    const wallet = getWalletApi();

    pendingPromise = (async () => {
      try {
        const result = await wallet.connect(available[0]);
        const connection = normalizeConnectResult(result, available[0]);
        activeConnection = connection;
        return connection;
      } finally {
        pendingPromise = null;
      }
    })();

    return pendingPromise;
  }

  pendingPromise = new Promise((resolve, reject) => {
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
}

export function isWalletModalOpen() {
  return Boolean(activeModal);
}
