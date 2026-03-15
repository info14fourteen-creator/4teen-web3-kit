function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
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

function isTrustLikeObject(obj) {
  if (!obj || typeof obj !== 'object') return false;

  return Boolean(
    obj.isTrustWallet === true ||
    obj.isTrust === true ||
    obj.ethereum?.isTrustWallet === true ||
    obj.ethereum?.isTrust === true ||
    obj.tron?.isTrustWallet === true ||
    obj.tron?.isTrust === true
  );
}

function isTronCapableProvider(obj) {
  if (!obj || typeof obj !== 'object') return false;

  return Boolean(
    obj.tronWeb ||
    obj.sunWeb ||
    obj.web3?.tronWeb ||
    typeof obj.request === 'function' ||
    typeof obj.connect === 'function' ||
    typeof obj.on === 'function'
  );
}

function getTrustRoots() {
  const win = getWindowSafe();
  if (!win) return [];

  return [
    win.trustwallet,
    win.trustWallet
  ].filter(Boolean).filter(isTrustLikeObject);
}

function getTrustProvider() {
  const roots = getTrustRoots();

  for (const root of roots) {
    if (!isTrustLikeObject(root)) {
      continue;
    }

    const candidates = [
      root.tron,
      root.tronLink,
      root.web3?.tron,
      root
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (isTronCapableProvider(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getInjectedTrustTronWeb() {
  const provider = getTrustProvider();

  return (
    provider?.tronWeb ||
    provider?.sunWeb ||
    provider?.web3?.tronWeb ||
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

export function detectTrust() {
  const provider = getTrustProvider();
  const tronWeb = getInjectedTrustTronWeb();
  const address =
    readAddressFromTronWeb(tronWeb) ||
    getProviderAddress(provider) ||
    null;

  if (!provider && !tronWeb) {
    return false;
  }

  return {
    installed: true,
    ready: Boolean(tronWeb && address),
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

  while (Date.now() - startedAt < timeoutMs) {
    const provider = getTrustProvider();
    const tronWeb = getInjectedTrustTronWeb();

    const address =
      readAddressFromTronWeb(tronWeb) ||
      getProviderAddress(provider) ||
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
  const tronWeb = getInjectedTrustTronWeb();
  const address =
    readAddressFromTronWeb(tronWeb) ||
    getProviderAddress(provider) ||
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

  const tronWeb =
    ready.tronWeb ||
    getInjectedTrustTronWeb() ||
    null;

  const address =
    ready.address ||
    requestedAddress ||
    readAddressFromTronWeb(tronWeb) ||
    getProviderAddress(provider) ||
    null;

  if (!tronWeb) {
    throw new Error('Trust Wallet TRON provider is not available');
  }

  if (!address) {
    throw new Error('Trust Wallet did not provide a ready TRON address');
  }

  patchTronWebAddress(tronWeb, address);

  return {
    walletType: 'trust',
    address,
    tronWeb,
    provider: provider || null
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
