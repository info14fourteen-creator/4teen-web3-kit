function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrowser() {
  return typeof window !== 'undefined';
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

function getTIP6963TronLinkProvider() {
  if (!isBrowser()) return null;

  try {
    const announcedProviders = window.__fourteenTip6963Providers || [];
    const tronLinkEntry = announcedProviders.find(
      (item) =>
        item?.info?.rdns === 'org.tronlink.www' ||
        item?.info?.name === 'TronLink'
    );

    return tronLinkEntry?.provider || null;
  } catch (error) {
    console.warn('[FourteenWallet][TronLink] TIP-6963 lookup failed:', error);
    return null;
  }
}

function getWindowTronLinkProvider() {
  if (!isBrowser()) return null;

  if (window.tronLink) {
    return window.tronLink;
  }

  return null;
}

export function getTronLinkProvider() {
  return getTIP6963TronLinkProvider() || getWindowTronLinkProvider();
}

function getInjectedTronWeb() {
  const provider = getTronLinkProvider();
  return provider?.tronWeb || null;
}

function getTronLinkState() {
  const provider = getTronLinkProvider();
  const tronWeb = getInjectedTronWeb();
  const address =
    tronWeb?.defaultAddress?.base58 ||
    provider?.tronWeb?.defaultAddress?.base58 ||
    null;

  const ready =
    !!provider?.ready ||
    !!tronWeb?.ready ||
    !!address;

  return {
    provider: provider || null,
    tronWeb: tronWeb || null,
    address,
    ready
  };
}

function requestTIP6963Providers() {
  if (!isBrowser()) return;

  if (!window.__fourteenTip6963Initialized) {
    window.__fourteenTip6963Initialized = true;
    window.__fourteenTip6963Providers = window.__fourteenTip6963Providers || [];

    window.addEventListener('TIP6963:announceProvider', (event) => {
      const detail = event?.detail;
      const provider = detail?.provider;
      const info = detail?.info;

      if (!provider || !info) return;

      const isTronLink =
        info?.rdns === 'org.tronlink.www' || info?.name === 'TronLink';

      if (!isTronLink) return;

      const exists = window.__fourteenTip6963Providers.some(
        (item) =>
          item?.info?.uuid === info?.uuid ||
          item?.provider === provider
      );

      if (!exists) {
        window.__fourteenTip6963Providers.push({ info, provider });
      }
    });
  }

  window.dispatchEvent(new Event('TIP6963:requestProvider'));
}

async function waitForTronLinkProvider(maxAttempts = 20, delay = 150) {
  requestTIP6963Providers();

  for (let i = 0; i < maxAttempts; i += 1) {
    const provider = getTronLinkProvider();
    if (provider) {
      return provider;
    }

    await sleep(delay);
  }

  return null;
}

async function waitForReadyTronLink(maxAttempts = 20, delay = 200) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const state = getTronLinkState();

    if (state.ready && state.address && state.tronWeb) {
      return state;
    }

    await sleep(delay);
  }

  return getTronLinkState();
}

async function readAddressFromProvider(provider) {
  if (!provider) return null;

  try {
    if (provider.tronWeb?.defaultAddress?.base58) {
      return provider.tronWeb.defaultAddress.base58;
    }
  } catch (error) {
    console.warn('[FourteenWallet][TronLink] provider tronWeb read failed:', error);
  }

  try {
    if (typeof provider.request === 'function') {
      const result = await provider.request({ method: 'eth_requestAccounts' });
      const address = normalizeAddress(result);
      if (address) return address;
    }
  } catch (error) {
    console.warn('[FourteenWallet][TronLink] eth_requestAccounts failed:', error);
  }

  try {
    if (typeof provider.request === 'function') {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      const address = normalizeAddress(result);
      if (address) return address;
    }
  } catch (error) {
    console.warn('[FourteenWallet][TronLink] tron_requestAccounts failed:', error);
  }

  return null;
}

export function detectTronLink() {
  requestTIP6963Providers();

  const state = getTronLinkState();

  return {
    installed: !!state.provider,
    ready: !!state.ready && !!state.address,
    tronWeb: state.tronWeb || null,
    provider: state.provider || null,
    address: state.address || null
  };
}

export async function connectTronLink() {
  const provider = await waitForTronLinkProvider();

  if (!provider) {
    throw new Error('TronLink is not installed');
  }

  try {
    if (!provider.ready || !provider.tronWeb?.defaultAddress?.base58) {
      if (typeof provider.request === 'function') {
        try {
          await provider.request({ method: 'eth_requestAccounts' });
        } catch (error) {
          await provider.request({ method: 'tron_requestAccounts' });
        }
      }
    }
  } catch (error) {
    throw new Error(error?.message || 'User rejected TronLink connection');
  }

  let state = await waitForReadyTronLink();

  if (!state.address) {
    const fallbackAddress = await readAddressFromProvider(provider);
    if (fallbackAddress && provider.tronWeb) {
      state = {
        ...state,
        address: fallbackAddress,
        tronWeb: provider.tronWeb
      };
    }
  }

  if (!state.tronWeb?.defaultAddress?.base58) {
    throw new Error('TronLink did not provide a ready account');
  }

  return {
    walletType: 'tronlink',
    provider,
    tronWeb: state.tronWeb,
    address: state.tronWeb.defaultAddress.base58
  };
}

export function subscribeTronLinkEvents({ onAccountsChanged, onDisconnect } = {}) {
  if (!isBrowser()) return () => {};

  const provider = getTronLinkProvider();
  const cleanups = [];

  const handleAccountsChanged = async (payload) => {
    const directAddress = normalizeAddress(payload);

    if (directAddress) {
      onAccountsChanged?.(directAddress);
      return;
    }

    const state = await waitForReadyTronLink(3, 100);
    onAccountsChanged?.(state?.address || null);
  };

  const handleDisconnect = () => {
    onDisconnect?.();
  };

  if (provider?.on) {
    provider.on('accountsChanged', handleAccountsChanged);
    cleanups.push(() => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
    });

    provider.on('disconnect', handleDisconnect);
    cleanups.push(() => {
      provider.removeListener?.('disconnect', handleDisconnect);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[FourteenWallet][TronLink] cleanup failed:', error);
      }
    }
  };
}
