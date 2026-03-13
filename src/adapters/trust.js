function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWindowSafe() {
  return typeof window !== 'undefined' ? window : null;
}

function readAddressFromTronWeb(tronWeb) {
  return tronWeb?.defaultAddress?.base58 || null;
}

function isTrustEnvironment(win) {
  if (!win) return false;

  return Boolean(
    win.trustwallet ||
    win.trustWallet ||
    win.TronWebProto
  );
}

export function detectTrust() {
  const win = getWindowSafe();
  if (!win) return false;

  return isTrustEnvironment(win);
}

async function waitForTrustReady(timeout = 12000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {

    const tronWeb = window.tronWeb;
    const address = readAddressFromTronWeb(tronWeb);

    if (tronWeb && address) {
      return {
        tronWeb,
        address
      };
    }

    await sleep(250);
  }

  return {
    tronWeb: null,
    address: null
  };
}

export async function connectTrust() {

  if (!detectTrust()) {
    throw new Error("Trust Wallet not detected");
  }

  let tronWeb = window.tronWeb;
  let address = readAddressFromTronWeb(tronWeb);

  if (!tronWeb || !address) {

    const ready = await waitForTrustReady();

    tronWeb = ready.tronWeb;
    address = ready.address;
  }

  if (!tronWeb) {
    throw new Error("Trust Wallet tronWeb is not available");
  }

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

export function subscribeTrustEvents({
  onAccountsChanged
} = {}) {

  const handler = async () => {

    const addr = window.tronWeb?.defaultAddress?.base58;

    if (addr && typeof onAccountsChanged === "function") {
      await onAccountsChanged(addr);
    }
  };

  window.addEventListener("focus", handler);

  return () => {
    window.removeEventListener("focus", handler);
  };
}
