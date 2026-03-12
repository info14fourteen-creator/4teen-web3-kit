const defaultState = () => ({
  walletType: null,
  connected: false,
  connecting: false,
  address: null,
  shortAddress: null,
  tronWeb: null,
  provider: null,
  balanceTRX: null,
  chainId: 'tron-mainnet',
  isReady: false,
  lastError: null
});

let state = defaultState();

export function getState() {
  return { ...state };
}

export function setState(patch = {}) {
  state = { ...state, ...patch };
  return getState();
}

export function resetState() {
  state = defaultState();
  return getState();
}
