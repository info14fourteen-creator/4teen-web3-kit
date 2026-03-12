function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAddress(tronWeb, timeout = 5000) {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const addr = tronWeb?.defaultAddress?.base58;

    if (addr) {
      return addr;
    }

    await sleep(150);
  }

  return null;
}

export async function getTRXBalance(tronWeb, address) {
  if (!tronWeb) {
    return null;
  }

  let addr = address || tronWeb?.defaultAddress?.base58;

  if (!addr) {
    addr = await waitForAddress(tronWeb);
  }

  if (!addr) {
    console.warn('[FourteenWallet] address not ready yet');
    return null;
  }

  try {
    const sun = await tronWeb.trx.getBalance(addr);
    const trx = tronWeb.fromSun(sun);
    return trx;
  } catch (error) {
    console.error('[FourteenWallet] getTRXBalance failed:', error);
    return null;
  }
}
