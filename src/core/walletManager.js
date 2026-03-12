import { emit, on, off } from './events.js';
import { getState, setState, resetState } from './state.js';
import { shortenAddress } from '../utils/address.js';
import { getTRXBalance } from '../utils/tron.js';

import {
  detectTronLink,
  connectTronLink,
  subscribeTronLinkEvents
} from '../adapters/tronlink.js';

import {
  detectOKX,
  connectOKX,
  subscribeOKXEvents
} from '../adapters/okx.js';

import {
  detectBinance,
  connectBinance,
  subscribeBinanceEvents
} from '../adapters/binance.js';

import {
  detectTrust,
  connectTrust,
  subscribeTrustEvents
} from '../adapters/trust.js';

let unsubscribeAdapterEvents = null;
let lastRefreshPromise = null;
let connectRequestId = 0;

function clearAdapterSubscriptions() {
  if (!unsubscribeAdapterEvents) return;

  try {
    unsubscribeAdapterEvents();
  } catch (error) {
    console.error('[FourteenWallet] Failed to unsubscribe adapter events', error);
  }

  unsubscribeAdapterEvents = null;
}

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isOKXInAppBrowser() {
  const ua = getUserAgent();
  return /OKX|OKApp/i.test(ua) || !!window?.okxwallet;
}

function isBinanceInAppBrowser() {
  const ua = getUserAgent();
  return /Binance/i.test(ua) || !!window?.binancew3w || !!window?.BinanceChain;
}

function isTrustInAppBrowser() {
  const ua = getUserAgent();
  return /Trust|TrustWallet/i.test(ua) || !!window?.trustwallet || !!window?.trustWallet;
}

function isTronLinkDetected(detected) {
  if (!detected) return false;

  if (typeof detected === 'boolean') {
    return detected;
  }

  if (typeof detected === 'object') {
    return !!(detected.installed || detected.ready);
  }

  return false;
}

function resolveDetectedWallets(rawWallets = {}) {
  const wallets = {
    tronlink: Boolean(rawWallets.tronlink),
    okx: Boolean(rawWallets.okx),
    binance: Boolean(rawWallets.binance),
    trust: Boolean(rawWallets.trust),
    generic: Boolean(rawWallets.generic)
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

async function refreshBalance() {
  const state = getState();

  if (!state.connected || !state.tronWeb || !state.address) {
    return null;
  }

  if (lastRefreshPromise) {
    return lastRefreshPromise;
  }

  lastRefreshPromise = (async () => {
    try {
      const balanceTRX = await getTRXBalance(state.tronWeb, state.address);
      const latestState = getState();

      if (!latestState.connected || latestState.address !== state.address) {
        return null;
      }

      setState({ balanceTRX });
      emit('balanceChanged', { balanceTRX });

      return balanceTRX;
    } catch (error) {
      console.error('[FourteenWallet] Failed to refresh balance', error);
      return null;
    } finally {
      lastRefreshPromise = null;
    }
  })();

  return lastRefreshPromise;
}

async function handleAccountChanged(address) {
  const nextAddress = address || null;
  const state = getState();

  if (!nextAddress) {
    disconnect();
    return;
  }

  if (state.connected && state.address === nextAddress) {
    await refreshBalance();
    return;
  }

  setState({
    address: nextAddress,
    shortAddress: shortenAddress(nextAddress),
    balanceTRX: null,
    isReady: true,
    lastError: null
  });

  emit('accountChanged', {
    address: nextAddress,
    shortAddress: shortenAddress(nextAddress)
  });

  await refreshBalance();
}

function bindGenericProviderAccountsChanged(provider) {
  if (!provider || typeof provider.on !== 'function') {
    return () => {};
  }

  const handler = async (accounts) => {
    const address = Array.isArray(accounts) ? accounts[0] : accounts;
    await handleAccountChanged(address || null);
  };

  provider.on('accountsChanged', handler);

  return () => {
    provider.removeListener?.('accountsChanged', handler);
  };
}

function shouldBindGenericListener(walletType, provider) {
  if (!provider?.on) return false;

  if (
    walletType === 'tronlink' ||
    walletType === 'okx' ||
    walletType === 'binance' ||
    walletType === 'trust'
  ) {
    return false;
  }

  return true;
}

function bindAdapterEvents(walletType, provider) {
  clearAdapterSubscriptions();

  const cleanups = [];

  if (walletType === 'tronlink') {
    cleanups.push(
      subscribeTronLinkEvents({
        onAccountsChanged: async (address) => {
          await handleAccountChanged(address);
        },
        onDisconnect: async () => {
          disconnect();
        }
      })
    );
  }

  if (walletType === 'okx') {
    cleanups.push(
      subscribeOKXEvents({
        onAccountsChanged: async (address) => {
          await handleAccountChanged(address);
        },
        onDisconnect: async () => {
          disconnect();
        }
      })
    );
  }

  if (walletType === 'binance') {
    cleanups.push(
      subscribeBinanceEvents({
        onAccountsChanged: async (address) => {
          await handleAccountChanged(address);
        },
        onDisconnect: async () => {
          disconnect();
        }
      })
    );
  }

  if (walletType === 'trust') {
    cleanups.push(
      subscribeTrustEvents({
        onAccountsChanged: async (address) => {
          await handleAccountChanged(address);
        },
        onDisconnect: async () => {
          disconnect();
        }
      })
    );
  }

  if (shouldBindGenericListener(walletType, provider)) {
    cleanups.push(bindGenericProviderAccountsChanged(provider));
  }

  unsubscribeAdapterEvents = () => {
    for (const cleanup of cleanups) {
      if (typeof cleanup !== 'function') continue;

      try {
        cleanup();
      } catch (error) {
        console.error('[FourteenWallet] Adapter cleanup failed', error);
      }
    }
  };
}

async function applyConnection(result, requestId) {
  if (requestId !== connectRequestId) {
    return getState();
  }

  const nextState = {
    walletType: result.walletType,
    connected: true,
    connecting: false,
    address: result.address,
    shortAddress: shortenAddress(result.address),
    tronWeb: result.tronWeb,
    provider: result.provider,
    balanceTRX: null,
    isReady: true,
    lastError: null
  };

  setState(nextState);

  bindAdapterEvents(result.walletType, result.provider);
  await refreshBalance();

  if (requestId !== connectRequestId) {
    return getState();
  }

  emit('connected', getState());
  return getState();
}

export function detectWallets() {
  const wallets = {};

  try {
    if (detectOKX()) {
      wallets.okx = true;
    }
  } catch (error) {
    console.warn('[FourteenWallet] detect failed for okx:', error);
  }

  try {
    if (detectBinance()) {
      wallets.binance = true;
    }
  } catch (error) {
    console.warn('[FourteenWallet] detect failed for binance:', error);
  }

  try {
    if (detectTrust()) {
      wallets.trust = true;
    }
  } catch (error) {
    console.warn('[FourteenWallet] detect failed for trust:', error);
  }

  try {
    const tronLinkDetected = detectTronLink();
    if (isTronLinkDetected(tronLinkDetected)) {
      wallets.tronlink = true;
    }
  } catch (error) {
    console.warn('[FourteenWallet] detect failed for tronlink:', error);
  }

  if (
    typeof window !== 'undefined' &&
    window.tronWeb &&
    Object.keys(wallets).length === 0
  ) {
    wallets.generic = true;
  }

  return resolveDetectedWallets(wallets);
}

export async function autoDetectWallet() {
  const wallets = detectWallets();

  if (wallets.okx) return 'okx';
  if (wallets.binance) return 'binance';
  if (wallets.trust) return 'trust';
  if (wallets.tronlink) return 'tronlink';

  return null;
}

export async function connect(walletType) {
  const resolvedWalletType = walletType || await autoDetectWallet();

  if (!resolvedWalletType) {
    throw new Error('No supported wallet found');
  }

  const requestId = ++connectRequestId;

  clearAdapterSubscriptions();

  setState({
    connecting: true,
    lastError: null
  });

  try {
    let result = null;

    if (resolvedWalletType === 'tronlink') {
      result = await connectTronLink();
    } else if (resolvedWalletType === 'okx') {
      result = await connectOKX();
    } else if (resolvedWalletType === 'binance') {
      result = await connectBinance();
    } else if (resolvedWalletType === 'trust') {
      result = await connectTrust();
    } else {
      throw new Error('Unsupported wallet');
    }

    if (!result?.address || !result?.tronWeb) {
      throw new Error('Wallet connection returned empty result');
    }

    return await applyConnection(result, requestId);
  } catch (error) {
    const message = error?.message || 'Wallet connection failed';

    if (requestId === connectRequestId) {
      setState({
        connecting: false,
        connected: false,
        isReady: false,
        walletType: null,
        address: null,
        shortAddress: null,
        tronWeb: null,
        provider: null,
        balanceTRX: null,
        lastError: message
      });

      emit('error', { message, error });
    }

    throw error;
  }
}

export async function autoConnect() {
  const walletType = await autoDetectWallet();

  if (!walletType) {
    return null;
  }

  try {
    return await connect(walletType);
  } catch (error) {
    console.error('[FourteenWallet] autoConnect failed', error);
    return null;
  }
}

export function disconnect() {
  clearAdapterSubscriptions();
  lastRefreshPromise = null;
  resetState();
  emit('disconnected', { connected: false });
}

export function getAddress() {
  return getState().address;
}

export function getShortAddress() {
  return getState().shortAddress;
}

export function getTronWeb() {
  return getState().tronWeb;
}

export function getProvider() {
  return getState().provider;
}

export function isConnected() {
  return getState().connected;
}

export function isReady() {
  const state = getState();
  return state.connected && state.isReady;
}

export async function getBalanceTRX() {
  const state = getState();

  if (state.balanceTRX !== null) {
    return state.balanceTRX;
  }

  return refreshBalance();
}

export function getWalletState() {
  return getState();
}

export { on, off };
