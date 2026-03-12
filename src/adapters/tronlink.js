function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function getUserAgent() {
  if (!isBrowser()) return '';
  return navigator.userAgent || '';
}

function isOKXInAppBrowser() {
  const ua = getUserAgent();
  return /OKX|OKApp/i.test(ua) || !!window?.okxwallet;
}

function normalizeAddress(value) {
  if (!value) return null;

  if (typeof value === 'string') return value;

  if (typeof value?.address === 'string') return value.address;

  if (typeof value?.base58 === 'string') return value.base58;

  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];

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

  if (isOKXInAppBrowser()) {
    return null;
  }

  if (window.tronLink && window.tronLink.ready !== undefined) {
    return window.tronLink;
  }

  return null;
}

export function getTronLinkProvider() {

  if (isOKXInAppBrowser()) {
    return null;
  }

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

  if (isOKXInAppBrowser()) return;

  if (!window.__fourteenTip6963Initialized) {

    window.__fourteenTip6963Initialized = true;

    window.__fourteenTip6963Providers =
      window.__fourteenTip6963Providers || [];

    window.addEventListener('TIP6963:announceProvider', (event) => {

      const detail = event?.detail;

      const provider = detail?.provider;

      const info = detail?.info;

      if (!provider || !info) return;

      const isTronLink =
        info?.rdns === 'org.tronlink.www' ||
        info?.name === 'TronLink';

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

  if (isOKXInAppBrowser()) return null;

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

  if (isOKXInAppBrowser()) {
    return {
      provider: null,
      tronWeb: null,
      address: null,
      ready: false
    };
  }

  for (let i = 0; i < maxAttempts; i += 1) {

    const state = getTronLinkState();

    if (state.ready && state.address && state.tronWeb) {
      return state;
    }

    await sleep(delay);
  }

  return getTronLinkState();
}

export function detectTronLink() {

  if (isOKXInAppBrowser()) {
    return {
      installed: false,
      ready: false,
      tronWeb: null,
      provider: null,
      address: null
    };
  }

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

export function subscribeTronLinkEvents({ onAccountsChanged, onDisconnect } = {}) {

  if (typeof window === 'undefined') {
    return () => {};
  }

  const provider = window.tronLink;

  if (!provider || typeof provider.on !== 'function') {
    return () => {};
  }

  const handleAccountsChanged = (accounts) => {

    const address =
      Array.isArray(accounts) ? accounts[0] : accounts;

    onAccountsChanged?.(address || null);
  };

  const handleDisconnect = () => {
    onDisconnect?.();
  };

  provider.on('accountsChanged', handleAccountsChanged);
  provider.on('disconnect', handleDisconnect);

  return () => {

    try {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    } catch (error) {
      console.warn('[FourteenWallet][TronLink] cleanup failed', error);
    }

  };
}
