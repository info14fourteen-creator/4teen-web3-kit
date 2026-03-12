function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function readAddressFromTronWeb(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

function isOKXEnvironment(win) {
  if (!win) return false;

  return Boolean(
    win.okxwallet ||
    win.okexchain ||
    /OKX|OKApp/i.test(navigator?.userAgent || '')
  );
}

function isLikelyOKXProvider(provider) {
  if (!provider) return false;

  return Boolean(
    provider.isOkxWallet ||
    provider.isOKX ||
    provider.okxwallet ||
    provider.isOkexWallet
  );
}

export function getTronLinkProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  const provider =
    win.tronLink ||
    null;

  if (!provider) {
    return null;
  }

  if (isLikelyOKXProvider(provider)) {
    return null;
  }

  if (isOKXEnvironment(win) && !provider.ready && !provider.tronWeb) {
    return null;
  }

  return provider;
}

export function getTronLinkTronWeb() {
  const win = getWindowSafe();
  if (!win) return null;

  const provider = getTronLinkProvider();
  const tronWeb =
    provider?.tronWeb ||
    win.tronWeb ||
    null;

  if (!tronWeb) {
    return null;
  }

  const providerCandidate =
    tronWeb?.provider ||
    tronWeb?.currentProvider ||
    provider ||
    null;

  if (isLikelyOKXProvider(providerCandidate)) {
    return null;
  }

  if (isOKXEnvironment(win) && !provider?.tronWeb) {
    return null;
  }

  return tronWeb;
}

export function detectTronLink() {
  const win = getWindowSafe();
  if (!win) return false;

  if (isOKXEnvironment(win)) {
    const provider = getTronLinkProvider();
    const tronWeb = provider?.tronWeb || null;
    const address = readAddressFromTronWeb(tronWeb);

    if (!provider || !tronWeb) {
      return false;
    }

    return {
      installed: true,
      ready: Boolean(address),
      address: address || null
    };
  }

  const provider = getTronLinkProvider();
  const tronWeb = getTronLinkTronWeb();
  const address = readAddressFromTronWeb(tronWeb);

  const installed = Boolean(provider || tronWeb);

  if (!installed) {
    return false;
  }

  return {
    installed: true,
    ready: Boolean(address),
    address: address || null
  };
}

async function waitForTronLinkReady(options = {}) {
  const {
    timeoutMs = 12000,
    delayMs = 200,
    requireAddress = true
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const tronWeb = getTronLinkTronWeb();
    const address = readAddressFromTronWeb(tronWeb);

    if (tronWeb && (!requireAddress || address)) {
      return {
        tronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  return {
    tronWeb: null,
    address: null
  };
}

export async function connectTronLink() {
  if (!detectTronLink()) {
    throw new Error('TronLink wallet not found');
  }

  const provider = getTronLinkProvider();

  if (provider?.request && typeof provider.request === 'function') {
    try {
      await provider.request({ method: 'tron_requestAccounts' });
    } catch (error) {
      throw new Error(error?.message || 'User rejected TronLink connection');
    }
  }

  let ready = await waitForTronLinkReady({
    timeoutMs: 12000,
    delayMs: 200,
    requireAddress: true
  });

  if (!ready.tronWeb || !ready.address) {
    await sleep(500);

    ready = await waitForTronLinkReady({
      timeoutMs: 8000,
      delayMs: 250,
      requireAddress: true
    });
  }

  if (!ready.tronWeb) {
    throw new Error('TronLink tronWeb is not available');
  }

  if (!ready.address) {
    throw new Error('TronLink did not provide a ready account');
  }

  return {
    walletType: 'tronlink',
    address: ready.address,
    tronWeb: ready.tronWeb,
    provider
  };
}

export function subscribeTronLinkEvents({
  onAccountsChanged,
  onDisconnect
} = {}) {
  const provider = getTronLinkProvider();
  const cleanups = [];

  if (provider?.on) {
    const handleAccountsChanged = async (accounts) => {
      const nextAddress = Array.isArray(accounts) ? accounts[0] : accounts;

      if (typeof onAccountsChanged === 'function') {
        await onAccountsChanged(nextAddress || null);
      }
    };

    const handleDisconnect = async () => {
      if (typeof onDisconnect === 'function') {
        await onDisconnect();
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on('disconnect', handleDisconnect);

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
        console.error('[FourteenWallet] Failed to cleanup TronLink listeners', error);
      }
    }
  };
}
