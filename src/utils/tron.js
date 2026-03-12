function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAddress(address) {
  if (!address || typeof address !== 'string') {
    return null;
  }

  const trimmed = address.trim();
  return trimmed || null;
}

function resolveTronWeb(tronWeb) {
  if (tronWeb && typeof tronWeb === 'object') {
    return tronWeb;
  }

  const win = getWindowSafe();
  return win?.originTronWeb || win?.tronWeb || null;
}

async function waitForAddress(tronWeb, timeoutMs = 5000, delayMs = 150) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const resolvedTronWeb = resolveTronWeb(tronWeb);
    const addr = resolvedTronWeb?.defaultAddress?.base58 || null;

    if (addr) {
      return addr;
    }

    await sleep(delayMs);
  }

  return null;
}

async function getBalanceFromRPC(tronWeb, address) {
  try {
    if (!tronWeb?.trx || typeof tronWeb.trx.getBalance !== 'function') {
      return null;
    }

    const rawBalance = await tronWeb.trx.getBalance(address);

    if (rawBalance === null || rawBalance === undefined) {
      return null;
    }

    const numeric = Number(rawBalance);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return numeric / 1e6;
  } catch (error) {
    console.warn('[Wallet RPC failed]', error);
    return null;
  }
}

async function getBalanceFromTrongrid(address) {
  try {
    const response = await fetch(`https://api.trongrid.io/v1/accounts/${address}`, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Trongrid error: ${response.status}`);
    }

    const json = await response.json();
    const rawBalance = json?.data?.[0]?.balance ?? null;

    if (rawBalance === null || rawBalance === undefined) {
      return null;
    }

    const numeric = Number(rawBalance);
    if (!Number.isFinite(numeric)) {
      return null;
    }

    return numeric / 1e6;
  } catch (error) {
    console.warn('[Trongrid fallback failed]', error);
    return null;
  }
}

export async function getTRXBalance(tronWeb, address) {
  const resolvedTronWeb = resolveTronWeb(tronWeb);

  let safeAddress =
    normalizeAddress(address) ||
    normalizeAddress(resolvedTronWeb?.defaultAddress?.base58);

  if (!safeAddress) {
    safeAddress = await waitForAddress(resolvedTronWeb, 5000, 150);
  }

  if (!safeAddress) {
    return null;
  }

  const rpcBalance = await getBalanceFromRPC(resolvedTronWeb, safeAddress);
  if (rpcBalance !== null) {
    return rpcBalance;
  }

  return getBalanceFromTrongrid(safeAddress);
}

export async function waitForTronWebAddress(tronWeb, options = {}) {
  const {
    timeoutMs = 10000,
    delayMs = 200
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const resolvedTronWeb = resolveTronWeb(tronWeb);
    const address = resolvedTronWeb?.defaultAddress?.base58 || null;

    if (address) {
      return {
        tronWeb: resolvedTronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  return {
    tronWeb: resolveTronWeb(tronWeb),
    address: null
  };
}

export async function waitForTronWebReady(tronWeb, options = {}) {
  const {
    timeoutMs = 10000,
    delayMs = 200,
    requireAddress = true
  } = options;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const resolvedTronWeb = resolveTronWeb(tronWeb);
    const isReady = !!resolvedTronWeb?.ready;
    const address = resolvedTronWeb?.defaultAddress?.base58 || null;

    if (resolvedTronWeb && isReady && (!requireAddress || address)) {
      return {
        tronWeb: resolvedTronWeb,
        address
      };
    }

    await sleep(delayMs);
  }

  return {
    tronWeb: resolveTronWeb(tronWeb),
    address: null
  };
}

export function getCurrentAddress(tronWeb) {
  const resolvedTronWeb = resolveTronWeb(tronWeb);
  return resolvedTronWeb?.defaultAddress?.base58 || null;
}

export function isTronWebReady(tronWeb, options = {}) {
  const {
    requireAddress = true
  } = options;

  const resolvedTronWeb = resolveTronWeb(tronWeb);

  if (!resolvedTronWeb || !resolvedTronWeb.ready) {
    return false;
  }

  if (!requireAddress) {
    return true;
  }

  return !!resolvedTronWeb?.defaultAddress?.base58;
}

export default {
  getTRXBalance,
  waitForTronWebAddress,
  waitForTronWebReady,
  getCurrentAddress,
  isTronWebReady
};
