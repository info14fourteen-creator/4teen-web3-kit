function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(getUserAgent());
}

function isAndroid() {
  return /Android/i.test(getUserAgent());
}

function isMobileDevice() {
  return isIOS() || isAndroid();
}

function isOKXInAppBrowser() {
  const win = getWindowSafe();
  const ua = getUserAgent();

  return Boolean(
    win?.okxwallet ||
    /OKX|OKApp/i.test(ua)
  );
}

function isBinanceInAppBrowser() {
  const win = getWindowSafe();
  const ua = getUserAgent();

  return Boolean(
    win?.binancew3w ||
    win?.BinanceChain ||
    /Binance/i.test(ua)
  );
}

function isTrustInAppBrowser() {
  const win = getWindowSafe();

  return Boolean(
    isMobileDevice() &&
    (
      win?.trustwallet ||
      win?.trustWallet
    )
  );
}

export function resolveDetectedWallets(input = {}) {
  const wallets = {
    tronlink: Boolean(input.tronlink),
    okx: Boolean(input.okx),
    binance: Boolean(input.binance),
    trust: Boolean(input.trust),
    generic: Boolean(input.generic)
  };

  if (wallets.okx && isOKXInAppBrowser()) {
    return {
      tronlink: false,
      okx: true,
      binance: false,
      trust: false,
      generic: false
    };
  }

  if (wallets.binance && isBinanceInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: true,
      trust: false,
      generic: false
    };
  }

  if (wallets.trust && isTrustInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: false,
      trust: true,
      generic: false
    };
  }

  return wallets;
}
