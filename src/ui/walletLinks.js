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

export function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(getUserAgent());
}

export function isIOS() {
  return /iPhone|iPad|iPod/i.test(getUserAgent());
}

export function isAndroid() {
  return /Android/i.test(getUserAgent());
}

export function getCurrentPageUrl() {
  const win = getWindowSafe();
  return win?.location?.href || '';
}

function normalizeTargetUrl(targetUrl = getCurrentPageUrl()) {
  const raw = String(targetUrl || '').trim();
  if (!raw) {
    return getCurrentPageUrl();
  }

  try {
    return new URL(raw, getCurrentPageUrl()).toString();
  } catch (_) {
    return getCurrentPageUrl();
  }
}

const INSTALL_LINKS = {
  tronlink: 'https://www.tronlink.org/',
  okx: 'https://www.okx.com/web3',
  binance: 'https://www.binance.com/en/web3wallet',
  trust: 'https://trustwallet.com/'
};

export function getWalletInstallUrl(walletType) {
  return INSTALL_LINKS[walletType] || '';
}

export function getWalletDeepLinks(walletType, targetUrl = getCurrentPageUrl()) {
  const normalizedUrl = normalizeTargetUrl(targetUrl);
  const safeUrl = encodeURIComponent(normalizedUrl);

  if (walletType === 'trust') {
    return {
      primary: `https://link.trustwallet.com/open_url?url=${safeUrl}`,
      secondary: `trust://open_url?url=${safeUrl}`,
      install: getWalletInstallUrl(walletType)
    };
  }

  if (walletType === 'okx') {
    return {
      primary: `okx://wallet/dapp/url?dappUrl=${safeUrl}`,
      secondary: '',
      install: getWalletInstallUrl(walletType)
    };
  }

  if (walletType === 'tronlink') {
    return {
      primary: `tronlink://open_url?url=${safeUrl}`,
      secondary: '',
      install: getWalletInstallUrl(walletType)
    };
  }

  if (walletType === 'binance') {
    return {
      primary: `bnc://app.binance.com/mp/app?applink=openPage%3Furl%3D${safeUrl}`,
      secondary: '',
      install: getWalletInstallUrl(walletType)
    };
  }

  return {
    primary: '',
    secondary: '',
    install: getWalletInstallUrl(walletType)
  };
}

function isPageStillVisible() {
  const doc = getDocumentSafe();
  if (!doc) return true;
  return doc.visibilityState === 'visible';
}

function navigateSameTab(url) {
  const win = getWindowSafe();
  if (!win || !url) return false;

  try {
    win.location.href = url;
    return true;
  } catch (_) {
    return false;
  }
}

function openNewTab(url) {
  const win = getWindowSafe();
  if (!win || !url) return false;

  try {
    const opened = win.open(url, '_blank', 'noopener,noreferrer');
    return !!opened;
  } catch (_) {
    return false;
  }
}

export function openInstallPage(walletType) {
  const url = getWalletInstallUrl(walletType);
  if (!url) return false;

  if (isMobileDevice()) {
    return navigateSameTab(url);
  }

  if (openNewTab(url)) {
    return true;
  }

  return navigateSameTab(url);
}

export function openWalletApp(walletType, options = {}) {
  const {
    targetUrl = getCurrentPageUrl(),
    fallbackToInstall = true,
    stepDelayMs = 900,
    installDelayMs = 1800
  } = options;

  const links = getWalletDeepLinks(walletType, targetUrl);

  if (!links.primary) {
    if (fallbackToInstall) {
      return openInstallPage(walletType);
    }
    return false;
  }

  const launched = navigateSameTab(links.primary);

  if (!launched) {
    if (fallbackToInstall) {
      return openInstallPage(walletType);
    }
    return false;
  }

  if (!isMobileDevice()) {
    return true;
  }

  if (links.secondary) {
    setTimeout(() => {
      if (!isPageStillVisible()) return;
      navigateSameTab(links.secondary);
    }, stepDelayMs);
  }

  if (fallbackToInstall && links.install) {
    setTimeout(() => {
      if (!isPageStillVisible()) return;
      navigateSameTab(links.install);
    }, links.secondary ? installDelayMs : stepDelayMs);
  }

  return true;
}
