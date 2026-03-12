import { Buffer } from 'buffer';

if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer;
}

import {
  connect,
  disconnect,
  getAddress,
  getShortAddress,
  getTronWeb,
  getProvider,
  isConnected,
  isReady,
  getBalanceTRX,
  detectWallets,
  getWalletState,
  on,
  off
} from './core/walletManager.js';

import { autoConnect } from './core/autoWallet.js';
import { openConnectModal } from './ui/connectModal.js';
import { mountDirectBuy } from './widgets/buy/index.js';
import { mountUnlockTimeline } from './widgets/timeline/index.js';
import { mountLiquidityController } from './widgets/liquidity/index.js';
import './ui/connectModal.css';

const FourteenUnified = {
  // wallet-kit API
  connect,
  disconnect,
  autoConnect,
  getAddress,
  getShortAddress,
  getTronWeb,
  getProvider,
  isConnected,
  isReady,
  getBalanceTRX,
  detectWallets,
  getWalletState,
  getState: getWalletState,
  on,
  off,
  openConnectModal,

  // widgets API
  mountDirectBuy,
  mountUnlockTimeline,
  mountLiquidityController
};

if (typeof window !== 'undefined') {
  window.FourteenWallet = FourteenUnified;
  window.FourteenWidgets = {
    mountDirectBuy,
    mountUnlockTimeline,
    mountLiquidityController
  };
  window.FourteenUnified = FourteenUnified;
}

export default FourteenUnified;
export {
  connect,
  disconnect,
  autoConnect,
  getAddress,
  getShortAddress,
  getTronWeb,
  getProvider,
  isConnected,
  isReady,
  getBalanceTRX,
  detectWallets,
  getWalletState,
  on,
  off,
  openConnectModal,
  mountDirectBuy,
  mountUnlockTimeline,
  mountLiquidityController
};
