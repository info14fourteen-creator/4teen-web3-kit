import {
  detectTronLink,
  connectTronLink,
  subscribeTronLinkEvents
} from './tronlink.js';

import {
  detectOKX,
  connectOKX,
  subscribeOKXEvents
} from './okx.js';

import {
  detectBinance,
  connectBinance,
  subscribeBinanceEvents
} from './binance.js';

import {
  detectTrust,
  connectTrust,
  subscribeTrustEvents
} from './trust.js';

const ADAPTERS = [
  {
    id: 'tronlink',
    label: 'TronLink',
    shortLabel: 'TronLink',
    icon: '🟠',
    order: 10,
    installUrl: 'https://www.tronlink.org/',
    detect: detectTronLink,
    connect: connectTronLink,
    subscribe: subscribeTronLinkEvents
  },
  {
    id: 'okx',
    label: 'OKX Wallet',
    shortLabel: 'OKX',
    icon: '⚫',
    order: 20,
    installUrl: 'https://www.okx.com/web3',
    detect: detectOKX,
    connect: connectOKX,
    subscribe: subscribeOKXEvents
  },
  {
    id: 'binance',
    label: 'Binance Web3 Wallet',
    shortLabel: 'Binance',
    icon: '🟡',
    order: 30,
    installUrl: 'https://www.binance.com/en/web3wallet',
    detect: detectBinance,
    connect: connectBinance,
    subscribe: subscribeBinanceEvents
  },
  {
    id: 'trust',
    label: 'Trust Wallet',
    shortLabel: 'Trust',
    icon: '🔵',
    order: 40,
    installUrl: 'https://trustwallet.com/',
    detect: detectTrust,
    connect: connectTrust,
    subscribe: subscribeTrustEvents
  }
];

function safeCall(fn, fallback = null) {
  try {
    return typeof fn === 'function' ? fn() : fallback;
  } catch (error) {
    console.error('[FourteenWallet][registry] adapter call failed:', error);
    return fallback;
  }
}

function normalizeDetectResult(adapterId, value) {
  if (!value) return false;

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'object') {
    if (adapterId === 'tronlink') {
      return Boolean(value.installed || value.ready);
    }

    if (adapterId === 'okx') {
      return Boolean(value.installed || value.ready || value.provider || value.tronWeb);
    }

    if (adapterId === 'binance') {
      return Boolean(value.installed || value.ready || value.provider || value.tronWeb);
    }

    if (adapterId === 'trust') {
      return Boolean(value.installed || value.ready || value.provider || value.tronWeb);
    }
  }

  return Boolean(value);
}

export function getWalletAdapters() {
  return [...ADAPTERS].sort((a, b) => a.order - b.order);
}

export function getWalletAdapterById(id) {
  return ADAPTERS.find((adapter) => adapter.id === id) || null;
}

export function getWalletAdapterIds() {
  return getWalletAdapters().map((adapter) => adapter.id);
}

export function detectWalletMap() {
  const detected = {};

  for (const adapter of getWalletAdapters()) {
    const raw = safeCall(adapter.detect, false);
    detected[adapter.id] = normalizeDetectResult(adapter.id, raw);
  }

  return detected;
}

export function getAvailableWalletOptions() {
  const detectedMap = detectWalletMap();

  return getWalletAdapters().map((adapter) => ({
    id: adapter.id,
    type: adapter.id,
    label: adapter.label,
    shortLabel: adapter.shortLabel,
    icon: adapter.icon,
    installUrl: adapter.installUrl,
    detected: Boolean(detectedMap[adapter.id])
  }));
}

export async function connectWalletAdapter(walletType) {
  const adapter = getWalletAdapterById(walletType);

  if (!adapter) {
    throw new Error(`Unsupported wallet type: ${walletType}`);
  }

  if (typeof adapter.connect !== 'function') {
    throw new Error(`Wallet adapter is missing connect(): ${walletType}`);
  }

  return await adapter.connect();
}

export function subscribeWalletAdapterEvents(walletType, handlers = {}) {
  const adapter = getWalletAdapterById(walletType);

  if (!adapter) {
    return () => {};
  }

  if (typeof adapter.subscribe !== 'function') {
    return () => {};
  }

  try {
    return adapter.subscribe(handlers) || (() => {});
  } catch (error) {
    console.error('[FourteenWallet][registry] subscribe failed:', error);
    return () => {};
  }
}
