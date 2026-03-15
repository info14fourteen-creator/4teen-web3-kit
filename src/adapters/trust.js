function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function readAddressFromTronWeb(tronWeb) {
  return (
    tronWeb?.defaultAddress?.base58 ||
    tronWeb?.defaultAddress?.address ||
    null
  );
}

function isTrustEnvironment(win = getWindowSafe()) {
  if (!win) return false;

  const ua = getUserAgent();

  return Boolean(
    win.trustwallet ||
    win.trustWallet ||
    /TrustWallet/i.test(ua)
  );
}

export function getTrustProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  const root =
    win.trustwallet ||
    win.trustWallet ||
    null;

  if (!root) {
    return null;
  }

  return root;
}

export function getTrustTronWeb() {
  const provider = getTrustProvider();

  if (!provider) {
    return null;
  }

  return (
    provider.tron ||
    provider.tronWeb ||
    provider.sunWeb ||
    provider.web3?.tronWeb ||
    null
  );
}

export function detectTrust() {
  const win = getWindowSafe();
  if (!win) return false;

  if (!isTrustEnvironment(win)) {
    return false;
  }

  const provider = getTrustProvider();

  if (!provider) {
    return false;
  }

  const tronWeb = getTrustTronWeb();
  const address = readAddressFromTronWeb(tronWeb);

  return {
    installed: true,
    ready: Boolean(address),
    address: address || null,
    provider,
    tronWeb: tronWeb || null
  };
}

async function waitForTrustReady(timeout = 10000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const tronWeb = getTrustTronWeb();
    const address = readAddressFromTronWeb(tronWeb);

    if (tronWeb && address) {
      return {
        tronWeb,
        address
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return {
    tronWeb: null,
    address: null
  };
}

export async function connectTrust() {
  const detected = detectTrust();

  if (!detected) {
    throw new Error('Trust Wallet not found');
  }

  const ready = await waitForTrustReady();

  if (!ready.tronWeb) {
    throw new Error('Trust Wallet tron provider not available');
  }

  if (!ready.address) {
    throw new Error('Trust Wallet did not provide an address');
  }

  return {
    walletType: 'trust',
    address: ready.address,
    tronWeb: ready.tronWeb,
    provider: getTrustProvider()
  };
}

export function subscribeTrustEvents({
  onAccountsChanged,
  onDisconnect
} = {}) {
  const provider = getTrustProvider();

  if (!provider?.on) {
    return () => {};
  }

  const handleAccountsChanged = async (accounts) => {
    const address = Array.isArray(accounts) ? accounts[0] : accounts;

    if (onAccountsChanged) {
      await onAccountsChanged(address || null);
    }
  };

  const handleDisconnect = async () => {
    if (onDisconnect) {
      await onDisconnect();
    }
  };

  provider.on('accountsChanged', handleAccountsChanged);
  provider.on('disconnect', handleDisconnect);

  return () => {
    provider.removeListener?.('accountsChanged', handleAccountsChanged);
    provider.removeListener?.('disconnect', handleDisconnect);
  };
}
