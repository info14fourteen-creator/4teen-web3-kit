function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function getDocumentSafe() {
  return typeof document !== 'undefined' ? document : null;
}

function getNavigatorSafe() {
  return typeof navigator !== 'undefined' ? navigator : null;
}

function getUserAgent() {
  return getNavigatorSafe()?.userAgent || '';
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

function isTrustWalletBrandPresent(win = getWindowSafe()) {
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

function hasInjectedTronProvider(win = getWindowSafe()) {
  if (!win) return false;

  return Boolean(
    win.tronWeb?.defaultAddress?.base58 ||
    win.tronWeb?.defaultAddress?.address
  );
}

function isEmbeddedTrustBrowser(win = getWindowSafe()) {
  if (!win) return false;

  return Boolean(
    win.trustwallet ||
    win.trustWallet ||
    win.trustwalletTon ||
    win.TronWebProto
  );
}

function getSessionStorageSafe() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage;
    }
  } catch (_) {}

  return null;
}

const TRUST_MOBILE_PENDING_KEY = 'fourteen:trust-mobile:pending';
const TRUST_MOBILE_LAST_URL_KEY = 'fourteen:trust-mobile:last-url';

export function markTrustMobilePending(url) {
  const storage = getSessionStorageSafe();
  if (!storage) return;

  try {
    storage.setItem(TRUST_MOBILE_PENDING_KEY, '1');
    storage.setItem(TRUST_MOBILE_LAST_URL_KEY, String(url || ''));
  } catch (_) {}
}

export function clearTrustMobilePending() {
  const storage = getSessionStorageSafe();
  if (!storage) return;

  try {
    storage.removeItem(TRUST_MOBILE_PENDING_KEY);
    storage.removeItem(TRUST_MOBILE_LAST_URL_KEY);
  } catch (_) {}
}

export function hasTrustMobilePending() {
  const storage = getSessionStorageSafe();
  if (!storage) return false;

  try {
    return storage.getItem(TRUST_MOBILE_PENDING_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function getTrustMobileLastUrl() {
  const storage = getSessionStorageSafe();
  if (!storage) return '';

  try {
    return storage.getItem(TRUST_MOBILE_LAST_URL_KEY) || '';
  } catch (_) {
    return '';
  }
}

export function detectTrustMobile() {
  const win = getWindowSafe();
  if (!win) return false;

  if (!isMobileDevice()) {
    return false;
  }

  if (!isTrustWalletBrandPresent(win)) {
    return false;
  }

  return {
    installed: true,
    mobile: true,
    inWalletBrowser: isEmbeddedTrustBrowser(win),
    hasInjectedTronProvider: hasInjectedTronProvider(win),
    pending: hasTrustMobilePending()
  };
}

export function getCurrentPageUrl() {
  const win = getWindowSafe();
  if (!win?.location?.href) return '';

  return win.location.href;
}

export function buildTrustMobileUniversalLink(targetUrl = getCurrentPageUrl()) {
  const safeUrl = encodeURIComponent(targetUrl || '');
  return `https://link.trustwallet.com/open_url?url=${safeUrl}`;
}

export function buildTrustMobileSchemeLink(targetUrl = getCurrentPageUrl()) {
  const safeUrl = encodeURIComponent(targetUrl || '');
  return `trust://open_url?url=${safeUrl}`;
}

export function getTrustMobileOpenUrls(targetUrl = getCurrentPageUrl()) {
  return {
    universal: buildTrustMobileUniversalLink(targetUrl),
    scheme: buildTrustMobileSchemeLink(targetUrl)
  };
}

function navigateTo(url) {
  const win = getWindowSafe();
  if (!win || !url) return false;

  try {
    win.location.href = url;
    return true;
  } catch (_) {
    return false;
  }
}

export async function connectTrustMobile(options = {}) {
  const detected = detectTrustMobile();

  if (!detected) {
    throw new Error('Trust Wallet mobile environment not detected');
  }

  const currentUrl = options.currentUrl || getCurrentPageUrl();
  const urls = getTrustMobileOpenUrls(currentUrl);

  if (detected.hasInjectedTronProvider) {
    clearTrustMobilePending();

    return {
      walletType: 'trust_mobile',
      mode: 'ready-injected-provider',
      pending: false,
      mobile: true,
      inWalletBrowser: detected.inWalletBrowser,
      hasInjectedTronProvider: true,
      currentUrl
    };
  }

  if (detected.inWalletBrowser) {
    clearTrustMobilePending();

    return {
      walletType: 'trust_mobile',
      mode: 'embedded-no-tron-provider',
      pending: false,
      mobile: true,
      inWalletBrowser: true,
      hasInjectedTronProvider: false,
      currentUrl,
      message: 'Trust Wallet browser is open, but a TRON provider is not exposed in this environment.'
    };
  }

  markTrustMobilePending(currentUrl);

  const result = {
    walletType: 'trust_mobile',
    mode: 'redirect',
    pending: true,
    mobile: true,
    inWalletBrowser: false,
    hasInjectedTronProvider: false,
    currentUrl,
    openUrl: urls.universal,
    fallbackUrl: urls.scheme
  };

  if (options.autoOpen !== false) {
    const doc = getDocumentSafe();

    if (doc?.visibilityState === 'visible') {
      const openedUniversal = navigateTo(urls.universal);

      if (!openedUniversal) {
        navigateTo(urls.scheme);
      } else {
        setTimeout(() => {
          navigateTo(urls.scheme);
        }, 900);
      }
    }
  }

  return result;
}

export function subscribeTrustMobileEvents({
  onReturn,
  onVisibilityReturn
} = {}) {
  const cleanups = [];
  const doc = getDocumentSafe();
  const win = getWindowSafe();

  const emitReturn = async (reason) => {
    if (!hasTrustMobilePending()) {
      return;
    }

    const payload = {
      reason,
      pending: true,
      lastUrl: getTrustMobileLastUrl()
    };

    if (typeof onReturn === 'function') {
      await onReturn(payload);
    }

    if (typeof onVisibilityReturn === 'function') {
      await onVisibilityReturn(payload);
    }
  };

  if (doc) {
    const handleVisibilityChange = async () => {
      if (doc.visibilityState !== 'visible') return;
      await emitReturn('visibilitychange');
    };

    doc.addEventListener('visibilitychange', handleVisibilityChange);
    cleanups.push(() => {
      doc.removeEventListener('visibilitychange', handleVisibilityChange);
    });
  }

  if (win) {
    const handleFocus = async () => {
      await emitReturn('focus');
    };

    const handlePageshow = async () => {
      await emitReturn('pageshow');
    };

    win.addEventListener('focus', handleFocus);
    win.addEventListener('pageshow', handlePageshow);

    cleanups.push(() => {
      win.removeEventListener('focus', handleFocus);
      win.removeEventListener('pageshow', handlePageshow);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[FourteenWallet][TrustMobile] cleanup failed', error);
      }
    }
  };
}
