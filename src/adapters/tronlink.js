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

/* ------------------------------------------------ */
/*  IN-APP BROWSER DETECTION                        */
/* ------------------------------------------------ */

function isOKXBrowser() {
  const ua = getUserAgent();
  return /OKX|OKApp/i.test(ua) || !!window?.okxwallet;
}

function isTrustBrowser() {
  const ua = getUserAgent();
  return /Trust|TrustWallet/i.test(ua) || !!window?.trustwallet || !!window?.trustWallet;
}

function isBinanceBrowser() {
  const ua = getUserAgent();
  return /Binance/i.test(ua) || !!window?.binancew3w || !!window?.BinanceChain;
}

/* ------------------------------------------------ */
/*  PROVIDER                                        */
/* ------------------------------------------------ */

function getTronLinkProvider() {
  if (!isBrowser()) return null;

  /* IMPORTANT: block TronLink inside other wallets */

  if (isOKXBrowser() || isTrustBrowser() || isBinanceBrowser()) {
    return null;
  }

  if (window.tronLink) {
    return window.tronLink;
  }

  return null;
}

function getInjectedTronWeb() {
  const provider = getTronLinkProvider();
  return provider?.tronWeb || window?.tronWeb || null;
}

/* ------------------------------------------------ */
/*  DETECT                                          */
/* ------------------------------------------------ */

export function detectTronLink() {

  const provider = getTronLinkProvider();
  const tronWeb = getInjectedTronWeb();

  const address =
    tronWeb?.defaultAddress?.base58 ||
    provider?.tronWeb?.defaultAddress?.base58 ||
    null;

  const ready = !!address;

  return {
    installed: !!provider,
    ready,
    provider: provider || null,
    tronWeb: tronWeb || null,
    address
  };
}

/* ------------------------------------------------ */
/*  WAIT FOR READY                                  */
/* ------------------------------------------------ */

async function waitForReady(maxAttempts = 20) {

  for (let i = 0; i < maxAttempts; i++) {

    const tronWeb = getInjectedTronWeb();

    if (tronWeb?.defaultAddress?.base58) {
      return tronWeb;
    }

    await sleep(200);
  }

  return null;
}

/* ------------------------------------------------ */
/*  CONNECT                                         */
/* ------------------------------------------------ */

export async function connectTronLink() {

  const provider = getTronLinkProvider();

  if (!provider) {
    throw new Error('TronLink not found');
  }

  try {

    if (!provider.ready || !provider.tronWeb?.defaultAddress?.base58) {

      if (typeof provider.request === 'function') {

        try {
          await provider.request({ method: 'tron_requestAccounts' });
        } catch {
          await provider.request({ method: 'eth_requestAccounts' });
        }

      }

    }

  } catch (error) {
    throw new Error(error?.message || 'User rejected TronLink connection');
  }

  const tronWeb = await waitForReady();

  if (!tronWeb) {
    throw new Error('TronLink did not provide a ready account');
  }

  const address = tronWeb.defaultAddress.base58;

  return {
    walletType: 'tronlink',
    provider,
    tronWeb,
    address
  };
}

/* ------------------------------------------------ */
/*  EVENTS                                          */
/* ------------------------------------------------ */

export function subscribeTronLinkEvents({ onAccountsChanged, onDisconnect } = {}) {

  if (!isBrowser()) return () => {};

  const provider = getTronLinkProvider();

  if (!provider || typeof provider.on !== 'function') {
    return () => {};
  }

  const handleAccountsChanged = (accounts) => {

    const address =
      Array.isArray(accounts)
        ? accounts[0]
        : accounts;

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
