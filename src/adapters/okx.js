function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function readAddressFromTronWeb(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

function normalizeAccountsPayload(accounts) {
  if (Array.isArray(accounts)) {
    return accounts[0] || null;
  }

  if (typeof accounts === 'string') {
    return accounts || null;
  }

  return null;
}

export function getOKXProvider() {
  const win = getWindowSafe();
  if (!win) return null;

  return (
    win.okxwallet?.tronLink ||
    win.okxwallet?.tron ||
    win.okxwallet ||
    null
  );
}

export function getOKXTronWeb() {
  const provider = getOKXProvider();

  return (
    provider?.tronWeb ||
    provider?.sunWeb ||
    null
  );
}

export function detectOKX() {
  const provider = getOKXProvider();

  return !!(
    provider &&
    (
      typeof provider.request === 'function' ||
      !!provider.tronWeb ||
      !!provider.sunWeb
    )
  );
}

async function requestAccounts(provider) {
  if (!provider) {
    throw new Error('OKX wallet provider not found');
  }

  if (typeof provider.request === 'function') {
    try {
      const result = await provider.request({ method: 'tron_requestAccounts' });
      return normalizeAccountsPayload(result);
    } catch (error) {
      throw new Error(error?.message || 'User rejected OKX connection');
    }
  }

  return null;
}

async function waitForOKXReady(options = {}) {
  const {
    timeoutMs = 15000,
    delayMs = 200,
    requireAddress = true
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const tronWeb = getOKXTronWeb();
    const address = readAddressFromTronWeb(tronWeb);

    if (tronWeb && (!requireAddress || address)) {
      return {
        tronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  return {
    tronWeb: null,
    address: null
  };
}

export async function connectOKX() {
  if (!detectOKX()) {
    throw new Error('OKX wallet not found');
  }

  const provider = getOKXProvider();
  const requestedAddress = await requestAccounts(provider);

  let ready = await waitForOKXReady({
    timeoutMs: 15000,
    delayMs: 200,
    requireAddress: true
  });

  if (!ready.tronWeb || !ready.address) {
    await sleep(500);

    ready = await waitForOKXReady({
      timeoutMs: 10000,
      delayMs: 250,
      requireAddress: true
    });
  }

  const address = ready.address || requestedAddress || null;

  if (!ready.tronWeb) {
    throw new Error('OKX tronWeb is not available');
  }

  if (!address) {
    throw new Error('OKX wallet connected, but account is not ready yet');
  }

  return {
    walletType: 'okx',
    address,
    tronWeb: ready.tronWeb,
    provider
  };
}

function parseMessageEventAddress(event) {
  const data = event?.data;
  if (!data) return null;

  const message = data.message || data.data || data;
  const action =
    message?.action ||
    message?.type ||
    data?.action ||
    data?.type;

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
    normalizeAccountsPayload(message?.data?.accounts) ||
    normalizeAccountsPayload(message?.accounts) ||
    null
  );
}

export function subscribeOKXEvents({
  onAccountsChanged,
  onDisconnect
} = {}) {
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

    const ready = await waitForOKXReady({
      timeoutMs: 2500,
      delayMs: 150,
      requireAddress: true
    });

    await onAccountsChanged(ready.address || null);
  };

  if (provider?.on) {
    const handleAccountsChanged = async (accounts) => {
      const nextAddress = normalizeAccountsPayload(accounts);
      await emitAccountChange(nextAddress);
    };

    const handleDisconnect = async () => {
      if (typeof onDisconnect === 'function') {
        await onDisconnect();
      }
    };

    provider.on('accountsChanged', handleAccountsChanged);

    if (typeof provider.on === 'function') {
      provider.on('disconnect', handleDisconnect);
    }

    cleanups.push(() => {
      provider.removeListener?.('accountsChanged', handleAccountsChanged);
      provider.removeListener?.('disconnect', handleDisconnect);
    });
  }

  const win = getWindowSafe();

  if (win) {
    const handleMessage = async (event) => {
      const nextAddress = parseMessageEventAddress(event);

      if (nextAddress === null) {
        return;
      }

      await emitAccountChange(nextAddress);
    };

    win.addEventListener('message', handleMessage);

    cleanups.push(() => {
      win.removeEventListener('message', handleMessage);
    });

    const handleVisibilityChange = async () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;

      const ready = await waitForOKXReady({
        timeoutMs: 1200,
        delayMs: 150,
        requireAddress: true
      });

      if (ready.address && typeof onAccountsChanged === 'function') {
        await onAccountsChanged(ready.address);
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
