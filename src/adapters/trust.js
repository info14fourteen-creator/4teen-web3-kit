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

function isTrustEnvironment(win = getWindowSafe()) {
  if (!win) return false;

  return Boolean(
    win.trustwallet ||
    win.trustWallet ||
    /Trust|TrustWallet/i.test(getUserAgent())
  );
}

function normalizeAddress(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value?.address === 'string') {
    return value.address;
  }

  if (typeof value?.base58 === 'string') {
    return value.base58;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return null;
}

function readAddressFromTronWeb(tronWeb) {
  return (
    tronWeb?.defaultAddress?.base58 ||
    tronWeb?.defaultAddress?.address ||
    null
  );
}

export function getTrustProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  return (
    win.trustwallet?.tron ||
    win.trustwallet?.tronLink ||
    win.trustwallet?.web3?.tron ||
    win.trustwallet ||
    win.trustWallet?.tron ||
    win.trustWallet?.tronLink ||
    win.trustWallet?.web3?.tron ||
    win.trustWallet ||
    null
  );
}

export function getTrustTronWeb() {
  const win = getWindowSafe();
  const provider = getTrustProvider();

  return (
    provider?.tronWeb ||
    provider?.sunWeb ||
    provider?.web3?.tronWeb ||
    win?.tronWeb ||
    null
  );
}

export function detectTrust() {
  const win = getWindowSafe();
  if (!win) return false;

  const provider = getTrustProvider();
  const tronWeb = getTrustTronWeb();
  const address = readAddressFromTronWeb(tronWeb);

  if (!provider && !tronWeb && !isTrustEnvironment(win)) {
    return false;
  }

  return {
    installed: Boolean(provider || tronWeb || isTrustEnvironment(win)),
    ready: Boolean(address),
    address: address || null
  };
}

async function requestAccounts(provider) {
  if (!provider) {
    return null;
  }

  if (typeof provider.request === 'function') {
    try {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      return normalizeAddress(result);
    } catch (error) {
      console.warn('[FourteenWallet][Trust] tron_requestAccounts failed:', error);
    }
  }

  if (typeof provider.connect === 'function') {
    try {
      const result = await provider.connect();
      return normalizeAddress(result);
    } catch (error) {
      console.warn('[FourteenWallet][Trust] provider.connect() failed:', error);
    }
  }

  return null;
}

async function waitForTrustReady(options = {}) {
  const {
    timeoutMs = 12000,
    delayMs = 200,
    requireAddress = true
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const provider = getTrustProvider();
    const tronWeb = getTrustTronWeb();
    const address =
      readAddressFromTronWeb(tronWeb) ||
      normalizeAddress(provider?.selectedAddress) ||
      normalizeAddress(provider?.address) ||
      null;

    if (tronWeb && (!requireAddress || address)) {
      return {
        provider,
        tronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  return {
    provider: getTrustProvider(),
    tronWeb: getTrustTronWeb(),
    address: null
  };
}

export async function connectTrust() {
  const detected = detectTrust();

  if (!detected) {
    throw new Error('Trust Wallet not found');
  }

  const provider = getTrustProvider();
  const requestedAddress = await requestAccounts(provider);

  let ready = await waitForTrustReady({
    timeoutMs: 12000,
    delayMs: 200,
    requireAddress: true
  });

  if (!ready.tronWeb || !ready.address) {
    await sleep(500);

    ready = await waitForTrustReady({
      timeoutMs: 8000,
      delayMs: 250,
      requireAddress: false
    });
  }

  const tronWeb = ready.tronWeb || getTrustTronWeb();
  const address =
    ready.address ||
    requestedAddress ||
    readAddressFromTronWeb(tronWeb) ||
    normalizeAddress(provider?.selectedAddress) ||
    normalizeAddress(provider?.address) ||
    null;

  if (!tronWeb) {
    throw new Error('Trust Wallet tronWeb is not available');
  }

  if (!address) {
    throw new Error('Trust Wallet did not provide a ready TRON address');
  }

  try {
    if (typeof tronWeb.setAddress === 'function') {
      tronWeb.setAddress(address);
    } else if (!tronWeb.defaultAddress?.base58) {
      const hex =
        tronWeb.address?.toHex?.(address) ||
        tronWeb.defaultAddress?.hex ||
        '';

      tronWeb.defaultAddress = {
        base58: address,
        hex
      };
    }

    tronWeb.ready = true;
  } catch (error) {
    console.warn('[FourteenWallet][Trust] failed to patch tronWeb:', error);
  }

  return {
    walletType: 'trust',
    address,
    tronWeb,
    provider
  };
}

export function subscribeTrustEvents({
  onAccountsChanged,
  onDisconnect
} = {}) {
  const provider = getTrustProvider();
  const cleanups = [];

  const emitAccountChange = async (nextAddress) => {
    if (typeof onAccountsChanged !== 'function') {
      return;
    }

    if (nextAddress) {
      await onAccountsChanged(nextAddress);
      return;
    }

    const ready = await waitForTrustReady({
      timeoutMs: 2500,
      delayMs: 150,
      requireAddress: false
    });

    const fallback =
      ready.address ||
      readAddressFromTronWeb(ready.tronWeb) ||
      null;

    await onAccountsChanged(fallback);
  };

  if (provider?.on) {
    const handleAccountsChanged = async (accounts) => {
      const nextAddress = normalizeAddress(accounts);
      await emitAccountChange(nextAddress);
    };

    const handleDisconnect = async () => {
      if (typeof onDisconnect === 'function') {
        await onDisconnect();
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on?.('disconnect', handleDisconnect);

    cleanups.push(() => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[FourteenWallet] Failed to cleanup Trust listeners', error);
      }
    }
  };
}
