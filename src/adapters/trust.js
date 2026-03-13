function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTrustTronWeb() {

  if (!window.TronWebProto) return null;

  try {

    const tronWeb = new window.TronWebProto({
      fullHost: "https://api.trongrid.io"
    });

    return tronWeb;

  } catch {
    return null;
  }
}

function readAddress(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

export function detectTrust() {

  return Boolean(
    window.trustwallet ||
    window.trustWallet ||
    window.TronWebProto
  );
}

async function waitForAddress(tronWeb, timeout = 8000) {

  const start = Date.now();

  while (Date.now() - start < timeout) {

    const addr = readAddress(tronWeb);

    if (addr) return addr;

    await sleep(250);
  }

  return null;
}

export async function connectTrust() {

  if (!detectTrust()) {
    throw new Error("Trust Wallet not detected");
  }

  let tronWeb = window.tronWeb;

  if (!tronWeb && window.TronWebProto) {
    tronWeb = createTrustTronWeb();
  }

  if (!tronWeb) {
    throw new Error("Trust Wallet tronWeb is not available");
  }

  const address = await waitForAddress(tronWeb);

  if (!address) {
    throw new Error("Trust Wallet did not provide a TRON address");
  }

  return {
    walletType: "trust",
    address,
    tronWeb,
    provider: tronWeb
  };
}

export function subscribeTrustEvents({ onAccountsChanged } = {}) {

  const handler = () => {

    const addr = window.tronWeb?.defaultAddress?.base58;

    if (addr && onAccountsChanged) {
      onAccountsChanged(addr);
    }
  };

  window.addEventListener("focus", handler);

  return () => {
    window.removeEventListener("focus", handler);
  };
}
