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

function readAddressFromTronWeb(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

function isOKXEnvironment(win = getWindowSafe()) {
  if (!win) return false;

  return Boolean(
    win.okxwallet ||
    win.okwallet ||
    /OKX|OKApp|OKEx/i.test(getUserAgent())
  );
}

/*
Detect real TronLink only.
Trust / OKX / Binance sometimes expose fake tronLink object.
*/
function isRealTronLink(provider) {
  if (!provider) return false;

  if (provider.isTronLink) return true;

  if (provider.tronWeb?.isTronLink) return true;

  if (provider.tronWeb?.ready && provider.tronWeb?.defaultAddress) return true;

  return false;
}

export function getTronLinkProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  if (isOKXEnvironment(win)) {
    return null;
  }

  const provider = win.tronLink;

  if (!isRealTronLink(provider)) {
    return null;
  }

  return provider;
}

export function getTronLinkTronWeb() {
  const provider = getTronLinkProvider();

  if (!provider) return null;

  return provider.tronWeb || null;
}

export function detectTronLink() {
  const provider = getTronLinkProvider();

  if (!provider) {
    return false;
  }

  const tronWeb = getTronLinkTronWeb();
  const address = readAddressFromTronWeb(tronWeb);

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
  const detected = detectTronLink();

  if (!detected) {
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

  const ready = await waitForTronLinkReady({
    timeoutMs: 12000,
    delayMs: 200,
    requireAddress: true
  });

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
