import { TronWeb } from 'tronweb';

const DEFAULT_FULL_HOST = 'https://api.trongrid.io';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
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

function readAddressFromTronWeb(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

export function getOKXProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  return (
    win.okxwallet?.tronLink ||
    win.okxwallet?.tron ||
    win.okxwallet?.web3?.tron ||
    win.okxwallet ||
    null
  );
}

export function detectOKX() {
  return !!getOKXProvider();
}

async function waitForOKXProvider(maxAttempts = 30, delay = 150) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const provider = getOKXProvider();
    if (provider) {
      return provider;
    }

    await sleep(delay);
  }

  return null;
}

async function requestAccounts(provider) {
  if (!provider) {
    throw new Error('OKX wallet provider not found');
  }

  if (typeof provider.request === 'function') {
    try {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      const address = normalizeAddress(result);
      if (address) return address;
    } catch (error) {
      throw new Error(error?.message || 'User rejected OKX connection');
    }
  }

  if (typeof provider.connect === 'function') {
    try {
      const result = await provider.connect();
      const address = normalizeAddress(result);
      if (address) return address;
    } catch (error) {
      throw new Error(error?.message || 'User rejected OKX connection');
    }
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
    console.warn('[FourteenWallet][OKX] provider.getAccount() failed:', error);
  }

  try {
    if (typeof provider.request === 'function') {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      const address = normalizeAddress(result);
      if (address) return address;
    }
  } catch (error) {
    console.warn('[FourteenWallet][OKX] tron_requestAccounts failed:', error);
  }

  try {
    const fallback =
      provider.address ||
      provider.selectedAddress ||
      provider.defaultAddress?.base58 ||
      provider.tronWeb?.defaultAddress?.base58 ||
      provider.sunWeb?.defaultAddress?.base58 ||
      provider.web3?.tronWeb?.defaultAddress?.base58 ||
      window?.tronWeb?.defaultAddress?.base58 ||
      null;

    return normalizeAddress(fallback);
  } catch (error) {
    console.warn('[FourteenWallet][OKX] fallback address read failed:', error);
    return null;
  }
}

export function createOKXTronWeb(provider, address, fullHost = DEFAULT_FULL_HOST) {
  if (!provider) {
    throw new Error('OKX provider is missing');
  }

  const injectedTronWeb =
    provider.tronWeb ||
    provider.sunWeb ||
    provider.web3?.tronWeb ||
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
      console.warn('[FourteenWallet][OKX] failed to patch injected tronWeb:', error);
    }

    return injectedTronWeb;
  }

  const tronWeb = new TronWeb({ fullHost });

  if (!address) {
    throw new Error('OKX wallet returned no address');
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

    throw new Error('OKX wallet does not expose signTransaction');
  };

  if (typeof provider.signMessageV2 === 'function') {
    tronWeb.trx.signMessageV2 = async (message) => provider.signMessageV2(message);
  }

  tronWeb.__walletProvider = provider;

  return tronWeb;
}

async function waitForOKXReady(address, options = {}) {
  const {
    timeoutMs = 15000,
    delayMs = 200
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const provider = getOKXProvider();

    const tronWeb =
      provider?.tronWeb ||
      provider?.sunWeb ||
      provider?.web3?.tronWeb ||
      (window?.tronWeb?.defaultAddress?.base58 === address ? window.tronWeb : null) ||
      null;

    const resolvedAddress =
      readAddressFromTronWeb(tronWeb) ||
      normalizeAddress(
        provider?.address ||
        provider?.selectedAddress ||
        provider?.defaultAddress?.base58 ||
        null
      ) ||
      null;

    if (tronWeb && resolvedAddress) {
      return { provider, tronWeb, address: resolvedAddress };
    }

    await sleep(delayMs);
  }

  return { provider: getOKXProvider(), tronWeb: null, address: null };
}

export async function connectOKX() {
  const provider = await waitForOKXProvider();

  if (!provider) {
    throw new Error('OKX wallet provider not found');
  }

  let address = await requestAccounts(provider);

  if (!address) {
    address = await readAddressFromProvider(provider);
  }

  let ready = await waitForOKXReady(address, {
    timeoutMs: 15000,
    delayMs: 200
  });

  if (!ready.address) {
    await sleep(500);
    const fallbackAddress = await readAddressFromProvider(provider);
    if (fallbackAddress) {
      address = fallbackAddress;
    }

    ready = await waitForOKXReady(address, {
      timeoutMs: 10000,
      delayMs: 250
    });
  }

  const finalAddress = ready.address || address || null;
  const tronWeb = createOKXTronWeb(ready.provider || provider, finalAddress);

  if (!tronWeb?.defaultAddress?.base58) {
    throw new Error('OKX wallet tronWeb is not ready');
  }

  return {
    walletType: 'okx',
    address: tronWeb.defaultAddress.base58,
    tronWeb,
    provider: ready.provider || provider
  };
}

function parseMessageEventAddress(event) {
  const data = event?.data;
  if (!data) return null;

  const message = data.message || data.data || data;
  const action = message?.action || message?.type || data?.action || data?.type;

  const looksRelevant =
    action === 'accountsChanged' ||
    action === 'setAccount' ||
    action === 'tabReply' ||
    action === 'tron_accountsChanged' ||
    action === 'tron#accountsChanged';

  if (!looksRelevant) {
    return null;
  }

  return (
    message?.address ||
    message?.data?.address ||
    normalizeAddress(message?.data?.accounts) ||
    normalizeAddress(message?.accounts) ||
    null
  );
}

export function subscribeOKXEvents({ onAccountsChanged, onDisconnect } = {}) {
  const provider = getOKXProvider();
  const cleanups = [];

  const emitAccountChange = async (nextAddress) => {
    if (typeof onAccountsChanged !== 'function') {
      return;
    }

    if (nextAddress) {
      await onAccountsChanged(nextAddress);
      return;
    }

    try {
      const freshAddress = await readAddressFromProvider(getOKXProvider());
      await onAccountsChanged(freshAddress || null);
    } catch (error) {
      console.warn('[FourteenWallet][OKX] accountsChanged refresh failed:', error);
      await onAccountsChanged(null);
    }
  };

  if (provider?.on) {
    const handleAccountsChanged = async (accounts) => {
      const nextAddress = normalizeAddress(accounts);
      await emitAccountChange(nextAddress);
    };

    const handleDisconnect = async () => {
      if (typeof onDisconnect === 'function') {
        await onDisconnect();
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);
    provider.on?.('disconnect', handleDisconnect);

    cleanups.push(() => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    });
  }

  const win = getWindowSafe();
  if (win) {
    const handleMessage = async (event) => {
      const nextAddress = parseMessageEventAddress(event);
      if (nextAddress === null) return;
      await emitAccountChange(nextAddress);
    };

    win.addEventListener('message', handleMessage);
    cleanups.push(() => {
      win.removeEventListener('message', handleMessage);
    });

    const handleVisibilityChange = async () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;

      try {
        const freshAddress = await readAddressFromProvider(getOKXProvider());
        if (freshAddress && typeof onAccountsChanged === 'function') {
          await onAccountsChanged(freshAddress);
        }
      } catch (error) {
        console.warn('[FourteenWallet][OKX] visibility refresh failed:', error);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      cleanups.push(() => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      });
    }
  }

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error('[FourteenWallet] Failed to cleanup OKX listeners', error);
      }
    }
  };
}
