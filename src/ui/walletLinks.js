function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
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
  const safeUrl = encodeURIComponent(targetUrl || '');

  if (walletType === 'trust') {
    return {
      primary: `https://link.trustwallet.com/open_url?url=${safeUrl}`,
      fallback: `trust://open_url?url=${safeUrl}`
    };
  }

  if (walletType === 'okx') {
    return {
      primary: `okx://wallet/dapp/url?dappUrl=${safeUrl}`,
      fallback: `https://www.okx.com/download`
    };
  }

  if (walletType === 'tronlink') {
    return {
      primary: `tronlink://open_url?url=${safeUrl}`,
      fallback: 'https://www.tronlink.org/'
    };
  }

  if (walletType === 'binance') {
    return {
      primary: `bnc://app.binance.com/mp/app?applink=openPage%3Furl%3D${safeUrl}`,
      fallback: 'https://www.binance.com/en/web3wallet'
    };
  }

  return {
    primary: '',
    fallback: getWalletInstallUrl(walletType)
  };
}

export function openInstallPage(walletType) {
  const url = getWalletInstallUrl(walletType);
  if (!url) return false;

  const win = getWindowSafe();
  if (!win) return false;

  try {
    win.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch (_) {
    try {
      win.location.href = url;
      return true;
    } catch {
      return false;
    }
  }
}

export function openWalletApp(walletType, options = {}) {
  const win = getWindowSafe();
  if (!win) return false;

  const {
    targetUrl = getCurrentPageUrl(),
    fallbackToInstall = true,
    fallbackDelayMs = 1400
  } = options;

  const links = getWalletDeepLinks(walletType, targetUrl);

  if (!links.primary) {
    if (fallbackToInstall) {
      return openInstallPage(walletType);
    }
    return false;
  }

  try {
    win.location.href = links.primary;
  } catch (_) {
    if (fallbackToInstall) {
      return openInstallPage(walletType);
    }
    return false;
  }

  if (fallbackToInstall && links.fallback) {
    setTimeout(() => {
      try {
        if (document.visibilityState === 'visible') {
          if (/^https?:/i.test(links.fallback)) {
            win.location.href = links.fallback;
          } else {
            win.location.href = links.fallback;
          }
        }
      } catch (_) {}
    }, fallbackDelayMs);
  }

  return true;
}
