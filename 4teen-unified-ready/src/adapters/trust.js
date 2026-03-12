import { TronWeb } from 'tronweb';

const DEFAULT_FULL_HOST = 'https://api.trongrid.io';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrowser() {
  return typeof window !== 'undefined';
}

function getWindow() {
  return isBrowser() ? window : null;
}

function normalizeAddress(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  if (typeof value?.base58 === 'string') {
    return value.base58;
  }

  if (typeof value?.address === 'string') {
    return value.address;
  }

  if (typeof value?.defaultAddress?.base58 === 'string') {
    return value.defaultAddress.base58;
  }

  return null;
}

function getUserAgent() {
  if (!isBrowser()) return '';
  return navigator?.userAgent || '';
}

export function isTrustMobileBrowser() {
  const ua = getUserAgent();
  return /Trust/i.test(ua) && /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
}

function isLikelyTrustObject(obj) {
  if (!obj || typeof obj !== 'object') return false;

  if (obj.isTrustWallet === true) return true;
  if (obj.ethereum?.isTrustWallet === true) return true;
  if (obj.tron?.isTrustWallet === true) return true;

  return false;
}

function getTrustRoots() {
  const win = getWindow();
  if (!win) return [];

  return [
    win.trustwallet,
    win.trustWallet,
    win.trustwallet?.tron,
    win.trustWallet?.tron
  ].filter(Boolean);
}

export function getTrustProvider() {
  const roots = getTrustRoots();

  for (const candidate of roots) {
    if (!candidate) continue;

    if (candidate.tron && isLikelyTrustObject(candidate)) {
      return candidate.tron;
    }

    if (isLikelyTrustObject(candidate)) {
      return candidate;
    }
  }

  // ultra-conservative fallback:
  // accept tron-shaped provider only if it clearly lives inside a Trust root
  for (const candidate of roots) {
    if (!candidate) continue;

    if (
      typeof candidate.request === 'function' ||
      typeof candidate.getAccount === 'function' ||
      typeof candidate.signTransaction === 'function'
    ) {
      return candidate;
    }
  }

  return null;
}

async function waitForTrustProvider(maxAttempts = 25, delay = 150) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const provider = getTrustProvider();
    if (provider) return provider;
    await sleep(delay);
  }
  return null;
}

async function tryRequestAccounts(provider) {
  if (!provider || typeof provider.request !== 'function') {
    return null;
  }

  const methods = [
    'tron_requestAccounts',
    'requestAccounts'
  ];

  for (const method of methods) {
    try {
      const result = await provider.request({ method });
      const address = normalizeAddress(result);
      if (address) return address;
    } catch (error) {
      // quiet on purpose
    }
  }

  return null;
}

async function tryGetAccount(provider) {
  if (!provider || typeof provider.getAccount !== 'function') {
    return null;
  }

  try {
    const result = await provider.getAccount();
    return normalizeAddress(result);
  } catch (error) {
    return null;
  }
}

function tryReadAddressSync(provider) {
  if (!provider) return null;

  const direct =
    provider.address ||
    provider.selectedAddress ||
    provider.defaultAddress?.base58 ||
    provider.tronWeb?.defaultAddress?.base58 ||
    null;

  return normalizeAddress(direct);
}

async function resolveTrustAddress(provider) {
  let address = null;

  // 1) explicit request first
  address = await tryRequestAccounts(provider);
  if (address) return address;

  // 2) provider getter
  address = await tryGetAccount(provider);
  if (address) return address;

  // 3) sync read
  address = tryReadAddressSync(provider);
  if (address) return address;

  // 4) short polling after user confirmation
  for (let i = 0; i < 20; i += 1) {
    await sleep(200);

    address = tryReadAddressSync(provider);
    if (address) return address;

    address = await tryGetAccount(provider);
    if (address) return address;
  }

  return null;
}

function patchInjectedTronWeb(injectedTronWeb, address) {
  if (!injectedTronWeb || !address) return injectedTronWeb;

  try {
    if (typeof injectedTronWeb.setAddress === 'function') {
      injectedTronWeb.setAddress(address);
    } else {
      const hex =
        injectedTronWeb.address?.toHex?.(address) ||
        injectedTronWeb.defaultAddress?.hex ||
        '';

      injectedTronWeb.defaultAddress = {
        base58: address,
        hex
      };
    }

    injectedTronWeb.ready = true;
  } catch (error) {
    console.warn('[FourteenWallet][Trust] failed to patch injected tronWeb:', error);
  }

  return injectedTronWeb;
}

export function createTrustTronWeb(provider, address, fullHost = DEFAULT_FULL_HOST) {
  if (!provider) {
    throw new Error('Trust provider is missing');
  }

  if (!address) {
    throw new Error('Trust Wallet returned no address');
  }

  // IMPORTANT:
  // only provider-owned tronWeb is allowed here
  // NEVER fallback to global window.tronWeb
  if (provider.tronWeb) {
    return patchInjectedTronWeb(provider.tronWeb, address);
  }

  const tronWeb = new TronWeb({ fullHost });
  const hexAddress = tronWeb.address?.toHex?.(address) || '';

  if (typeof tronWeb.setAddress === 'function') {
    tronWeb.setAddress(address);
  }

  tronWeb.defaultAddress = {
    base58: address,
    hex: hexAddress
  };
  tronWeb.ready = true;

  const originalSign = tronWeb.trx?.sign?.bind(tronWeb.trx);

  tronWeb.trx.sign = async (
    transaction,
    privateKey = false,
    useTronHeader = true,
    multisig = false
  ) => {
    if (!transaction) {
      throw new Error('Transaction is required for signing');
    }

    if (typeof provider.signTransaction === 'function') {
      return provider.signTransaction(transaction);
    }

    if (typeof provider.request === 'function') {
      try {
        return await provider.request({
          method: 'tron_signTransaction',
          params: { transaction }
        });
      } catch (error) {
        // continue
      }
    }

    if (typeof originalSign === 'function' && privateKey) {
      return originalSign(transaction, privateKey, useTronHeader, multisig);
    }

    throw new Error('Trust Wallet does not expose signTransaction');
  };

  if (typeof provider.signMessageV2 === 'function') {
    tronWeb.trx.signMessageV2 = async (message) => provider.signMessageV2(message);
  } else if (typeof provider.request === 'function') {
    tronWeb.trx.signMessageV2 = async (message) => {
      return provider.request({
        method: 'tron_signMessageV2',
        params: { message }
      });
    };
  }

  tronWeb.__walletProvider = provider;
  return tronWeb;
}

export function detectTrust() {
  const provider = getTrustProvider();
  if (!provider) return false;

  // On mobile Trust browser, do not pretend TRON wallet is ready
  // unless a real TRON provider shape exists.
  if (isTrustMobileBrowser()) {
    const hasTronShape =
      !!provider.tronWeb ||
      typeof provider.request === 'function' ||
      typeof provider.getAccount === 'function' ||
      typeof provider.signTransaction === 'function';

    return hasTronShape;
  }

  return true;
}

export async function connectTrust() {
  const provider = await waitForTrustProvider();

  if (!provider) {
    throw new Error('Trust Wallet provider not found');
  }

  const address = await resolveTrustAddress(provider);

  if (!address) {
    if (isTrustMobileBrowser()) {
      throw new Error(
        'Trust Wallet mobile browser did not expose a ready TRON account. Open the site in read-only mode or use a wallet/browser that exposes TRON injection.'
      );
    }

    throw new Error('Trust Wallet did not provide a ready TRON address');
  }

  const tronWeb = createTrustTronWeb(provider, address);

  if (!tronWeb?.defaultAddress?.base58) {
    throw new Error('Trust Wallet tronWeb is not ready');
  }

  return {
    walletType: 'trust',
    address: tronWeb.defaultAddress.base58,
    tronWeb,
    provider
  };
}

export function subscribeTrustEvents({ onAccountsChanged, onDisconnect } = {}) {
  const provider = getTrustProvider();

  if (!provider || typeof provider.on !== 'function') {
    return () => {};
  }

  const handleAccountsChanged = async (payload) => {
    const direct = normalizeAddress(payload);
    if (direct) {
      onAccountsChanged?.(direct);
      return;
    }

    try {
      const fresh = await resolveTrustAddress(provider);
      onAccountsChanged?.(fresh || null);
    } catch (error) {
      console.warn('[FourteenWallet][Trust] accountsChanged refresh failed:', error);
      onAccountsChanged?.(null);
    }
  };

  const handleDisconnect = () => {
    onDisconnect?.();
  };

  provider.on('accountsChanged', handleAccountsChanged);

  if (typeof onDisconnect === 'function') {
    provider.on('disconnect', handleDisconnect);
  }

  return () => {
    if (typeof provider.removeListener === 'function') {
      provider.removeListener('accountsChanged', handleAccountsChanged);
      provider.removeListener('disconnect', handleDisconnect);
    }
  };
}
