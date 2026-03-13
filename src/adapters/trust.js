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
    win.trustwalletTon ||
    win.TronWebProto ||
    win.ethereum?.isTrust ||
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

function getTrustProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  return (
    win.trustwallet?.tron ||
    win.trustwallet?.tronLink ||
    win.trustwallet?.web3?.tron ||
    win.trustwalletTon?.tron ||
    win.trustwalletTon ||
    win.trustwallet ||
    win.trustWallet?.tron ||
    win.trustWallet?.tronLink ||
    win.trustWallet?.web3?.tron ||
    win.trustWallet ||
    null
  );
}

function getInjectedTrustTronWeb() {
  const win = getWindowSafe();
  const provider = getTrustProvider();

  return (
    provider?.tronWeb ||
    provider?.sunWeb ||
    provider?.web3?.tronWeb ||
    win?.tronWeb ||
    win?.tron?.tronWeb ||
    null
  );
}

function getProviderAddress(provider) {
  return (
    normalizeAddress(provider?.selectedAddress) ||
    normalizeAddress(provider?.address) ||
    normalizeAddress(provider?.defaultAddress?.base58) ||
    normalizeAddress(provider?.defaultAddress?.address) ||
    normalizeAddress(provider?.accounts) ||
    null
  );
}

function patchTronWebAddress(tronWeb, address) {
  if (!tronWeb || !address) return tronWeb;

  try {
    if (typeof tronWeb.setAddress === 'function') {
      tronWeb.setAddress(address);
    } else {
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

  return tronWeb;
}

function createTrustTronWebFromProto(address = null) {
  const win = getWindowSafe();
  const Proto = win?.TronWebProto;

  if (!Proto) return null;

  const attempts = [
    () => new Proto({ fullHost: 'https://api.trongrid.io' }),
    () => new Proto(),
    () => Proto({ fullHost: 'https://api.trongrid.io' }),
    () => Proto()
  ];

  for (const attempt of attempts) {
    try {
      const tronWeb = attempt();
      if (!tronWeb) continue;

      if (address) {
        patchTronWebAddress(tronWeb, address);
      }

      return tronWeb;
    } catch (_) {}
  }

  return null;
}

export function detectTrust() {
  const win = getWindowSafe();
  if (!win) return false;

  const provider = getTrustProvider();
  const tronWeb = getInjectedTrustTronWeb();
  const address =
    readAddressFromTronWeb(tronWeb) ||
    getProviderAddress(provider) ||
    null;

  if (!provider && !tronWeb && !isTrustEnvironment(win)) {
    return false;
  }

  return {
    installed: Boolean(provider || tronWeb || isTrustEnvironment(win)),
    ready: Boolean(address),
    address: address || null,
    provider: provider || null,
    tronWeb: tronWeb || null
  };
}

async function requestAccounts(provider) {
  if (!provider) {
    return null;
  }

  const attempts = [
    async () => {
      if (typeof provider.request !== 'function') return null;
      return await provider.request({ method: 'tron_requestAccounts' });
    },
    async () => {
      if (typeof provider.connect !== 'function') return null;
      return await provider.connect();
    },
    async () => {
      if (typeof provider.request !== 'function') return null;
      return await provider.request({ method: 'eth_requestAccounts' });
    }
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      const address = normalizeAddress(result);
      if (address) return address;
    } catch (error) {
      console.warn('[FourteenWallet][Trust] account request attempt failed:', error);
    }
  }

  return null;
}

async function waitForTrustReady(options = {}) {
  const {
    timeoutMs = 12000,
    delayMs = 250,
    requireAddress = true
  } = options;

  const startedAt = Date.now();
  let protoTronWeb = null;

  while (Date.now() - startedAt < timeoutMs) {
    const provider = getTrustProvider();
    const injectedTronWeb = getInjectedTrustTronWeb();

    const providerAddress = getProviderAddress(provider);
    const injectedAddress = readAddressFromTronWeb(injectedTronWeb);
    const knownAddress = injectedAddress || providerAddress || null;

    if (!protoTronWeb && !injectedTronWeb) {
      protoTronWeb = createTrustTronWebFromProto(knownAddress);
    }

    if (protoTronWeb && knownAddress && !readAddressFromTronWeb(protoTronWeb)) {
      patchTronWebAddress(protoTronWeb, knownAddress);
    }

    const tronWeb = injectedTronWeb || protoTronWeb || null;
    const address =
      readAddressFromTronWeb(tronWeb) ||
      knownAddress ||
      null;

    if (tronWeb && (!requireAddress || address)) {
      if (address) {
        patchTronWebAddress(tronWeb, address);
      }

      return {
        provider,
        tronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  const provider = getTrustProvider();
  const injectedTronWeb = getInjectedTrustTronWeb();
  const providerAddress = getProviderAddress(provider);
  const tronWeb =
    injectedTronWeb ||
    createTrustTronWebFromProto(providerAddress) ||
    null;

  const address =
    readAddressFromTronWeb(tronWeb) ||
    providerAddress ||
    null;

  if (tronWeb && address) {
    patchTronWebAddress(tronWeb, address);
  }

  return {
    provider,
    tronWeb,
    address
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
    delayMs: 250,
    requireAddress: true
  });

  if (!ready.tronWeb || !ready.address) {
    await sleep(500);

    ready = await waitForTrustReady({
      timeoutMs: 10000,
      delayMs: 300,
      requireAddress: false
    });
  }

  let tronWeb =
    ready.tronWeb ||
    getInjectedTrustTronWeb() ||
    createTrustTronWebFromProto(requestedAddress) ||
    null;

  const address =
    ready.address ||
    requestedAddress ||
    readAddressFromTronWeb(tronWeb) ||
    getProviderAddress(provider) ||
    null;

  if (!tronWeb && address) {
    tronWeb = createTrustTronWebFromProto(address);
  }

  if (!tronWeb) {
    throw new Error('Trust Wallet tronWeb is not available');
  }

  if (!address) {
    throw new Error('Trust Wallet did not provide a ready TRON address');
  }

  patchTronWebAddress(tronWeb, address);

  return {
    walletType: 'trust',
    address,
    tronWeb,
    provider: provider || tronWeb
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
      getProviderAddress(ready.provider) ||
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

  const win = getWindowSafe();
  if (win) {
    const handleFocus = async () => {
      const ready = await waitForTrustReady({
        timeoutMs: 1200,
        delayMs: 150,
        requireAddress: false
      });

      const fallback =
        ready.address ||
        readAddressFromTronWeb(ready.tronWeb) ||
        getProviderAddress(ready.provider) ||
        null;

      if (fallback && typeof onAccountsChanged === 'function') {
        await onAccountsChanged(fallback);
      }
    };

    win.addEventListener('focus', handleFocus);
    cleanups.push(() => {
      win.removeEventListener('focus', handleFocus);
    });
  }

  if (typeof document !== 'undefined') {
    const handleVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return;

      const ready = await waitForTrustReady({
        timeoutMs: 1500,
        delayMs: 150,
        requireAddress: false
      });

      const fallback =
        ready.address ||
        readAddressFromTronWeb(ready.tronWeb) ||
        getProviderAddress(ready.provider) ||
        null;

      if (fallback && typeof onAccountsChanged === 'function') {
        await onAccountsChanged(fallback);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    cleanups.push(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
