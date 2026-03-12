import { TronWeb } from 'tronweb';

const DEFAULT_FULL_HOST = 'https://api.trongrid.io';

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

function getLegacyBinanceProvider() {
  if (!isBrowser()) return null;

  if (window.BinanceChain?.tron) {
    return window.BinanceChain.tron;
  }

  if (window.BinanceChain) {
    return window.BinanceChain;
  }

  return null;
}

export function getBinanceProvider() {
  if (!isBrowser()) return null;

  if (window.binancew3w?.tron) {
    return window.binancew3w.tron;
  }

  return getLegacyBinanceProvider();
}

async function waitForBinanceProvider(maxAttempts = 20, delay = 150) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const provider = getBinanceProvider();
    if (provider) {
      return provider;
    }

    await sleep(delay);
  }

  return null;
}

async function readAddressFromProvider(provider) {
  if (!provider) return null;

  try {
    if (typeof provider.getAccount === 'function') {
      const account = await provider.getAccount();
      const address = normalizeAddress(account);
      if (address) return address;
    }
  } catch (error) {
    console.warn('[FourteenWallet][Binance] provider.getAccount() failed:', error);
  }

  try {
    if (typeof provider.request === 'function') {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      const address = normalizeAddress(result);
      if (address) return address;
    }
  } catch (error) {
    console.warn('[FourteenWallet][Binance] tron_requestAccounts failed:', error);
  }

  try {
    const fallback =
      provider.address ||
      provider.selectedAddress ||
      provider.defaultAddress?.base58 ||
      provider.tronWeb?.defaultAddress?.base58 ||
      window?.tronWeb?.defaultAddress?.base58 ||
      null;

    return normalizeAddress(fallback);
  } catch (error) {
    console.warn('[FourteenWallet][Binance] fallback address read failed:', error);
    return null;
  }
}

export function createBinanceTronWeb(provider, address, fullHost = DEFAULT_FULL_HOST) {
  if (!provider) {
    throw new Error('Binance provider is missing');
  }

  const injectedTronWeb =
    provider.tronWeb ||
    (window?.tronWeb?.defaultAddress?.base58 === address ? window.tronWeb : null);

  if (injectedTronWeb) {
    try {
      if (typeof injectedTronWeb.setAddress === 'function' && address) {
        injectedTronWeb.setAddress(address);
      } else if (address) {
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
      console.warn('[FourteenWallet][Binance] failed to patch injected tronWeb:', error);
    }

    return injectedTronWeb;
  }

  const tronWeb = new TronWeb({ fullHost });

  if (!address) {
    throw new Error('Binance wallet returned no address');
  }

  const hexAddress =
    tronWeb.address?.toHex?.(address) ||
    tronWeb.defaultAddress?.hex ||
    '';

  if (typeof tronWeb.setAddress === 'function') {
    tronWeb.setAddress(address);
  }

  tronWeb.defaultAddress = {
    base58: address,
    hex: hexAddress
  };

  tronWeb.ready = true;

  const originalSign = tronWeb.trx?.sign?.bind(tronWeb.trx);

  tronWeb.trx.sign = async (transaction, privateKey = false, useTronHeader = true, multisig = false) => {
    if (!transaction) {
      throw new Error('Transaction is required for signing');
    }

    if (typeof provider.signTransaction === 'function') {
      return await provider.signTransaction(transaction);
    }

    if (typeof originalSign === 'function' && privateKey) {
      return await originalSign(transaction, privateKey, useTronHeader, multisig);
    }

    throw new Error('Binance wallet does not expose signTransaction');
  };

  if (typeof provider.signMessageV2 === 'function') {
    tronWeb.trx.signMessageV2 = async (message) => provider.signMessageV2(message);
  }

  tronWeb.__walletProvider = provider;

  return tronWeb;
}

export function detectBinance() {
  return !!getBinanceProvider();
}

export async function connectBinance() {
  const provider = await waitForBinanceProvider();

  if (!provider) {
    throw new Error('Binance Wallet TRON provider not found');
  }

  const address = await readAddressFromProvider(provider);

  if (!address) {
    throw new Error('Binance Wallet did not provide a TRON address');
  }

  const tronWeb = createBinanceTronWeb(provider, address);

  if (!tronWeb?.defaultAddress?.base58) {
    throw new Error('Binance Wallet tronWeb is not ready');
  }

  return {
    walletType: 'binance',
    address: tronWeb.defaultAddress.base58,
    tronWeb,
    provider
  };
}

export function subscribeBinanceEvents({ onAccountsChanged } = {}) {
  const provider = getBinanceProvider();

  if (!provider || typeof provider.on !== 'function') {
    return () => {};
  }

  const handler = async (payload) => {
    const directAddress = normalizeAddress(payload);

    if (directAddress) {
      onAccountsChanged?.(directAddress);
      return;
    }

    try {
      const freshAddress = await readAddressFromProvider(provider);
      onAccountsChanged?.(freshAddress || null);
    } catch (error) {
      console.warn('[FourteenWallet][Binance] accountsChanged refresh failed:', error);
      onAccountsChanged?.(null);
    }
  };

  provider.on('accountsChanged', handler);

  return () => {
    if (typeof provider.removeListener === 'function') {
      provider.removeListener('accountsChanged', handler);
    }
  };
}
