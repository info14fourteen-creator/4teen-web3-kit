function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function getUserAgent() {
  if (!isBrowser()) return '';
  return navigator.userAgent || '';
}

function isOKXBrowser() {
  const ua = getUserAgent();

  return (
    /OKX|OKApp/i.test(ua) ||
    !!window?.okxwallet ||
    !!window?.okx
  );
}

function getOKXProvider() {

  if (!isBrowser()) return null;

  if (window.okxwallet?.tronLink) {
    return window.okxwallet.tronLink;
  }

  if (window.okxwallet) {
    return window.okxwallet;
  }

  if (window.okx?.tronLink) {
    return window.okx.tronLink;
  }

  return null;
}

function getInjectedTronWeb() {

  if (window.okxwallet?.tronWeb) {
    return window.okxwallet.tronWeb;
  }

  if (window.tronWeb && isOKXBrowser()) {
    return window.tronWeb;
  }

  return null;
}

export function detectOKX() {

  if (!isBrowser()) return false;

  const provider = getOKXProvider();
  const tronWeb = getInjectedTronWeb();

  if (provider) return true;

  if (tronWeb && isOKXBrowser()) {
    return true;
  }

  return false;
}

async function waitForTronWeb(maxAttempts = 20) {

  for (let i = 0; i < maxAttempts; i++) {

    const tronWeb = getInjectedTronWeb();

    if (tronWeb?.defaultAddress?.base58) {
      return tronWeb;
    }

    await sleep(200);
  }

  return null;
}

export async function connectOKX() {

  const provider = getOKXProvider();
  const tronWeb = await waitForTronWeb();

  if (!tronWeb) {
    throw new Error('OKX tronWeb not ready');
  }

  const address = tronWeb.defaultAddress.base58;

  if (!address) {
    throw new Error('OKX address not available');
  }

  return {
    walletType: 'okx',
    tronWeb,
    provider,
    address
  };
}

export function subscribeOKXEvents({ onAccountsChanged, onDisconnect } = {}) {

  if (!isBrowser()) return () => {};

  const tronWeb = getInjectedTronWeb();

  if (!tronWeb) return () => {};

  let lastAddress = tronWeb.defaultAddress?.base58 || null;

  const interval = setInterval(() => {

    const current = tronWeb?.defaultAddress?.base58;

    if (current && current !== lastAddress) {

      lastAddress = current;

      onAccountsChanged?.(current);

    }

  }, 1200);

  return () => clearInterval(interval);
}
