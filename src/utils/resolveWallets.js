function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(getUserAgent());
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

function detectTronLinkExtension(win) {
  if (!win?.tronLink) return false;

  return Boolean(
    win.tronLink.isTronLink === true ||
    win.tronLink.tronWeb?.isTronLink === true
  );
}

function detectTrustExtension(win) {
  if (!win) return false;

  const root =
    win.trustwallet ||
    win.trustWallet ||
    null;

  if (!root) return false;

  return Boolean(
    root.isTrustWallet === true ||
    root.isTrust === true ||
    root.tronLink
  );
}

function detectBinanceExtension(win) {
  if (!win) return false;

  return Boolean(
    win.binancew3w?.tron ||
    win.BinanceChain?.tron
  );
}

function detectOKXExtension(win) {
  if (!win) return false;

  return Boolean(
    win.okxwallet?.tron ||
    win.okxwallet
  );
}

export function resolveDetectedWallets(input = {}) {
  const win = getWindowSafe();

  const tronlink = detectTronLinkExtension(win);
  const trust = detectTrustExtension(win);
  const binance = detectBinanceExtension(win);
  const okx = detectOKXExtension(win);

  if (isOKXInAppBrowser()) {
    return {
      tronlink: false,
      okx: true,
      binance: false,
      trust: false,
      generic: false
    };
  }

  if (isBinanceInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: true,
      trust: false,
      generic: false
    };
  }

  if (isTrustInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      binance: false,
      trust: true,
      generic: false
    };
  }

  return {
    tronlink,
    okx,
    binance,
    trust,
    generic: false
  };
}
