function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(getUserAgent());
}

function getTrustRoot(win = getWindowSafe()) {
  if (!win) return null;

  return (
    win.trustwallet ||
    win.trustWallet ||
    null
  );
}

function isTrustBrowser() {
  const root = getTrustRoot();

  if (!root) return false;

  return Boolean(
    root.isTrustWallet === true ||
    root.isTrust === true
  );
}

function getInjectedTronWeb() {
  const win = getWindowSafe();
  const root = getTrustRoot(win);

  return (
    root?.tron?.tronWeb ||
    root?.tronLink?.tronWeb ||
    root?.web3?.tron?.tronWeb ||
    root?.tronWeb ||
    win?.tronWeb ||
    null
  );
}

function readAddress(tronWeb) {
  return (
    tronWeb?.defaultAddress?.base58 ||
    tronWeb?.defaultAddress?.address ||
    null
  );
}

async function waitForTrustProvider(timeout = 12000) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const tronWeb = getInjectedTronWeb();
    const address = readAddress(tronWeb);

    if (tronWeb && address) {
      return {
        tronWeb,
        address
      };
    }

    await sleep(250);
  }

  return {
    tronWeb: getInjectedTronWeb(),
    address: readAddress(getInjectedTronWeb())
  };
}

export function detectTrustMobile() {
  if (!isMobileDevice()) return false;

  if (!isTrustBrowser()) return false;

  return {
    installed: true,
    mobile: true,
    inWalletBrowser: true
  };
}

export async function connectTrustMobile() {
  const detected = detectTrustMobile();

  if (!detected) {
    throw new Error('Trust Wallet mobile environment not detected');
  }

  const ready = await waitForTrustProvider();

  if (!ready.tronWeb) {
    throw new Error('Trust Wallet tronWeb not found');
  }

  if (!ready.address) {
    throw new Error('Trust Wallet did not provide address');
  }

  ready.tronWeb.ready = true;

  return {
    walletType: 'trust_mobile',
    address: ready.address,
    tronWeb: ready.tronWeb,
    provider: getTrustRoot()
  };
}

export function subscribeTrustMobileEvents({ onAccountsChanged } = {}) {
  const tronWeb = getInjectedTronWeb();

  if (!tronWeb) return () => {};

  const interval = setInterval(() => {
    const address = readAddress(tronWeb);

    if (address && typeof onAccountsChanged === 'function') {
      onAccountsChanged(address);
    }
  }, 2000);

  return () => clearInterval(interval);
}
