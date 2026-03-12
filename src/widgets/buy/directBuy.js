import './directBuy.css';

const ACTIVE_INSTANCES = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function createBottomNotice(message, txid = '', isError = false) {
  let notice = document.getElementById('fourteenBuyGlobalNotice');

  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'fourteenBuyGlobalNotice';
    notice.style.position = 'fixed';
    notice.style.left = '20px';
    notice.style.right = '20px';
    notice.style.bottom = '20px';
    notice.style.zIndex = '99999';
    notice.style.padding = '14px 16px';
    notice.style.borderRadius = '12px';
    notice.style.color = '#fff';
    notice.style.fontSize = '14px';
    notice.style.lineHeight = '1.45';
    notice.style.boxShadow = '0 10px 30px rgba(0,0,0,0.35)';
    notice.style.wordBreak = 'break-word';
    notice.style.maxWidth = '720px';
    notice.style.margin = '0 auto';
    notice.style.display = 'none';
    document.body.appendChild(notice);
  }

  notice.style.background = isError ? '#7f1d1d' : '#111111';

  const safeMessage = escapeHtml(message);

  notice.innerHTML = txid
    ? `${safeMessage}<br><a href="https://tronscan.org/#/transaction/${txid}" target="_blank" rel="noopener noreferrer" style="color:#ff8a3d; text-decoration:underline; word-break:break-all;">${txid}</a>`
    : safeMessage;

  notice.style.display = 'block';

  clearTimeout(notice._hideTimer);
  notice._hideTimer = setTimeout(() => {
    notice.style.display = 'none';
  }, 10000);
}

function extractTxid(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (typeof result?.txid === 'string') return result.txid;
  if (typeof result?.txID === 'string') return result.txID;
  if (typeof result?.transaction?.txID === 'string') return result.transaction.txID;
  if (typeof result?.transaction === 'string') return result.transaction;
  return '';
}

function normalizeError(error) {
  const text = String(
    error?.message ||
    error?.error ||
    error?.data?.message ||
    'Unknown error'
  );

  if (
    text.includes('rejected') ||
    text.includes('denied') ||
    text.includes('User rejected')
  ) {
    return 'Transaction rejected in wallet.';
  }

  if (text.includes('balance')) {
    return 'Insufficient balance.';
  }

  return text;
}

export function mountDirectBuy({
  rootId,
  contractAddress,
  reserveTRX = 13,
  inputLabel = 'Enter TRX to spend',
  buttonConnectText = 'Connect Wallet',
  buttonBuyText = 'Buy 4TEEN Directly'
}) {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`Direct buy root not found: ${rootId}`);

  if (!window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  if (ACTIVE_INSTANCES.has(rootId)) {
    try {
      ACTIVE_INSTANCES.get(rootId).destroy();
    } catch (_) {}
  }

  const wallet = window.FourteenWallet;

  root.innerHTML = `
    <div class="fourteen-buy-widget">
      <div class="fourteen-buy-header">
        <div class="fourteen-buy-label">Amount of TRX:</div>

        <div class="fourteen-buy-balance-wrap">
          <div class="fourteen-buy-balance">0.000000 TRX</div>
          <button class="fourteen-buy-refresh" type="button" aria-label="Refresh balance">↻</button>
        </div>
      </div>

      <label class="fourteen-buy-input-label">${inputLabel}</label>

      <input
        class="fourteen-buy-input"
        type="number"
        disabled
        step="0.000001"
        min="0"
        placeholder="Connect wallet first"
      />

      <button class="fourteen-buy-button" type="button">${buttonConnectText}</button>

      <div class="fourteen-buy-status"></div>
    </div>
  `;

  const balanceEl = root.querySelector('.fourteen-buy-balance');
  const refreshBtn = root.querySelector('.fourteen-buy-refresh');
  const inputEl = root.querySelector('.fourteen-buy-input');
  const buttonEl = root.querySelector('.fourteen-buy-button');
  const statusEl = root.querySelector('.fourteen-buy-status');

  let walletBalance = 0;
  let contract = null;
  let connected = false;
  let isSubmitting = false;
  let isDestroyed = false;

  function isAlive() {
    return !isDestroyed && document.body.contains(root);
  }

  function setStatus(msg = '', err = false) {
    if (!isAlive()) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle('error', err);
  }

  function getMaxAllowed() {
    return Math.max(0, walletBalance - reserveTRX);
  }

  function updateConnectedUi() {
    if (!isAlive()) return;

    connected = !!wallet.isConnected?.();

    inputEl.disabled = !connected || isSubmitting;
    inputEl.placeholder = connected ? inputLabel : 'Connect wallet first';

    buttonEl.disabled = isSubmitting;
    buttonEl.textContent = isSubmitting
      ? 'Processing...'
      : connected
        ? buttonBuyText
        : buttonConnectText;

    buttonEl.classList.toggle('connected', connected);
  }

  async function ensureContract() {
    const tronWeb = wallet.getTronWeb?.();

    if (!tronWeb?.contract) {
      throw new Error('Wallet not ready');
    }

    if (!contract) {
      contract = await tronWeb.contract().at(contractAddress);
    }

    return contract;
  }

  async function getBalance() {
    if (!wallet.isConnected?.()) {
      walletBalance = 0;
      balanceEl.textContent = '0.000000 TRX';
      updateConnectedUi();
      return 0;
    }

    try {
      const balance = await wallet.getBalanceTRX?.();
      const numeric = Number(balance);

      walletBalance = Number.isFinite(numeric) ? numeric : 0;
      balanceEl.textContent = `${walletBalance.toFixed(6)} TRX`;

      updateConnectedUi();
      return walletBalance;
    } catch (error) {
      console.error('[DirectBuy] getBalance failed:', error);
      walletBalance = 0;
      balanceEl.textContent = '0.000000 TRX';
      updateConnectedUi();
      return 0;
    }
  }

  async function connectWallet() {
    setStatus('Connecting wallet...');

    await wallet.connect();

    await sleep(250);
    await ensureContract();
    await getBalance();

    connected = true;
    updateConnectedUi();
    setStatus('');
  }

  async function buy() {
    if (isSubmitting) return;

    try {
      const amount = parseFloat(inputEl.value);

      if (!amount || amount <= 0) {
        setStatus('Enter valid TRX amount', true);
        return;
      }

      await getBalance();

      const max = getMaxAllowed();

      if (amount > max) {
        setStatus(`Max allowed ${max.toFixed(6)} TRX`, true);
        return;
      }

      const valueSun = Math.round(amount * 1e6);

      isSubmitting = true;
      updateConnectedUi();
      setStatus('Waiting wallet confirmation...');

      const activeContract = await ensureContract();

      const result = await activeContract.buyTokens().send({
        callValue: valueSun
      });

      const txid = extractTxid(result);

      createBottomNotice('Transaction sent', txid, false);

      inputEl.value = '';

      await sleep(1500);
      await getBalance();

      setStatus('');
    } catch (err) {
      const msg = normalizeError(err);
      setStatus(msg, true);
      createBottomNotice(msg, '', true);
    } finally {
      isSubmitting = false;
      updateConnectedUi();
    }
  }

  async function handleButtonClick() {
    try {
      if (!wallet.isConnected?.()) {
        await connectWallet();
      } else {
        await buy();
      }
    } catch (error) {
      const msg = normalizeError(error);
      setStatus(msg, true);
      createBottomNotice(msg, '', true);
      isSubmitting = false;
      updateConnectedUi();
    }
  }

  async function handleRefreshClick() {
    if (isSubmitting) return;

    try {
      await getBalance();
      setStatus('');
    } catch (error) {
      setStatus(normalizeError(error), true);
    }
  }

  function handleWalletChange() {
    contract = null;
    connected = !!wallet.isConnected?.();
    updateConnectedUi();

    if (connected) {
      getBalance().catch((error) => {
        console.error('[DirectBuy] wallet change balance refresh failed:', error);
      });
    } else {
      walletBalance = 0;
      balanceEl.textContent = '0.000000 TRX';
      inputEl.value = '';
      setStatus('');
    }
  }

  buttonEl.addEventListener('click', handleButtonClick);
  refreshBtn.addEventListener('click', handleRefreshClick);

  const offConnected = wallet.on?.('connected', handleWalletChange);
  const offDisconnected = wallet.on?.('disconnected', handleWalletChange);
  const offAccountChanged = wallet.on?.('accountChanged', handleWalletChange);
  const offBalanceChanged = wallet.on?.('balanceChanged', async () => {
    await getBalance();
  });

  connected = !!wallet.isConnected?.();
  updateConnectedUi();

  if (connected) {
    ensureContract()
      .then(() => getBalance())
      .catch((error) => {
        console.error('[DirectBuy] initial restore failed:', error);
      });
  }

  function destroy() {
    isDestroyed = true;

    buttonEl.removeEventListener('click', handleButtonClick);
    refreshBtn.removeEventListener('click', handleRefreshClick);

    if (typeof offConnected === 'function') offConnected();
    if (typeof offDisconnected === 'function') offDisconnected();
    if (typeof offAccountChanged === 'function') offAccountChanged();
    if (typeof offBalanceChanged === 'function') offBalanceChanged();
  }

  ACTIVE_INSTANCES.set(rootId, { destroy });

  return { destroy };
}
