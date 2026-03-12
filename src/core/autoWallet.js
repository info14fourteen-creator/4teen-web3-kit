import { setState } from './state.js';
import { emit } from './events.js';
import { shortenAddress } from '../utils/address.js';
import { getTRXBalance } from '../utils/tron.js';

import { detectTronLink, connectTronLink } from '../adapters/tronlink.js';
import { detectOKX, connectOKX } from '../adapters/okx.js';
import { detectBinance, connectBinance } from '../adapters/binance.js';
import { detectTrust, connectTrust } from '../adapters/trust.js';

const CONNECTORS = [
  { wallet: 'okx', detect: detectOKX, connect: connectOKX },
  { wallet: 'binance', detect: detectBinance, connect: connectBinance },
  { wallet: 'trust', detect: detectTrust, connect: connectTrust },
  { wallet: 'tronlink', detect: detectTronLink, connect: connectTronLink }
];

function isTronLinkDetected(result) {
  if (!result) return false;

  if (typeof result === 'boolean') {
    return result;
  }

  if (typeof result === 'object') {
    return !!(result.installed || result.ready);
  }

  return false;
}

function isDetected(wallet, detected) {
  if (wallet === 'tronlink') {
    return isTronLinkDetected(detected);
  }

  return !!detected;
}

export async function autoConnect() {
  for (const item of CONNECTORS) {
    try {
      const detected = item.detect?.();

      if (!isDetected(item.wallet, detected)) {
        continue;
      }

      const result = await item.connect();

      if (!result?.address || !result?.tronWeb) {
        continue;
      }

      const balanceTRX = await getTRXBalance(result.tronWeb, result.address);

      const nextState = {
        walletType: result.walletType || item.wallet,
        connected: true,
        connecting: false,
        address: result.address,
        shortAddress: shortenAddress(result.address),
        tronWeb: result.tronWeb,
        provider: result.provider,
        balanceTRX,
        isReady: true,
        lastError: null
      };

      setState(nextState);
      emit('connected', nextState);

      return nextState;
    } catch (error) {
      console.warn(`[FourteenWallet] autoConnect skipped ${item.wallet}:`, error);
    }
  }

  return null;
}

export default autoConnect;
