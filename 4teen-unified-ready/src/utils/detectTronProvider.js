function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function hasReadyAddress(tronWeb) {
  return !!tronWeb?.defaultAddress?.base58;
}

function buildDetected(wallet, provider, tronWeb) {
  if (!provider || !tronWeb) {
    return null;
  }

  return {
    wallet,
    provider,
    tronWeb
  };
}

function detectOKX(win) {
  const provider =
    win?.okxwallet?.tronLink ||
    win?.okxwallet?.tron ||
    win?.okxwallet ||
    null;

  const tronWeb =
    provider?.tronWeb ||
    provider?.sunWeb ||
    null;

  if (!provider || !tronWeb) {
    return null;
  }

  return buildDetected('okx', provider, tronWeb);
}

function detectTrust(win) {
  const trustA = win?.trustwallet || null;
  const trustB = win?.trustWallet || null;

  if (trustA?.tronWeb) {
    return buildDetected('trust', trustA, trustA.tronWeb);
  }

  if (trustB?.tronWeb) {
    return buildDetected('trust', trustB, trustB.tronWeb);
  }

  return null;
}

function detectBinance(win) {
  const provider = win?.BinanceChain || null;
  const tronWeb =
    provider?.tronWeb ||
    provider?.sunWeb ||
    null;

  if (!provider || !tronWeb) {
    return null;
  }

  return buildDetected('binance', provider, tronWeb);
}

function detectTronLink(win) {
  const provider = win?.tronLink || null;
  const tronWeb = win?.tronWeb || null;

  if (!provider || !tronWeb) {
    return null;
  }

  return buildDetected('tronlink', provider, tronWeb);
}

function detectUnknown(win) {
  const tronWeb = win?.tronWeb || null;

  if (!tronWeb) {
    return null;
  }

  return buildDetected('unknown', tronWeb, tronWeb);
}

export function detectTronProvider(options = {}) {
  const { requireAddress = false } = options;

  const win = getWindowSafe();
  if (!win) {
    return null;
  }

  const detected =
    detectOKX(win) ||
    detectTrust(win) ||
    detectBinance(win) ||
    detectTronLink(win) ||
    detectUnknown(win);

  if (!detected) {
    return null;
  }

  if (requireAddress && !hasReadyAddress(detected.tronWeb)) {
    return null;
  }

  return detected;
}

export default detectTronProvider;
