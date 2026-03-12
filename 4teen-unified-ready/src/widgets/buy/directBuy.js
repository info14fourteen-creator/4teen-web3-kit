import './directBuy.css';
import { connectWallet as connectViaController, getWallet as getControllerWallet } from '../../core/walletController.js';

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
  if (typeof result?.transaction === 'string') return result.transaction;
  if (typeof result?.transaction?.txID === 'string') return result.transaction.txID;
  if (typeof result?.receipt?.txID === 'string') return result.receipt.txID;
  if (typeof result?.id === 'string') return result.id;
  return '';
}

function normalizeError(error) {
  const raw =
    error?.message ||
    error?.error ||
    error?.data?.message ||
    error?.response?.data?.message ||
    'Unknown error';

  const text = String(raw);

  if (
    text.includes('User rejected') ||
    text.includes('rejected') ||
    text.includes('denied') ||
    text.includes('Confirmation declined')
  ) {
    return 'Transaction was rejected in wallet.';
  }

  if (text.includes('Balance below') || text.includes('balance')) {
    return 'Insufficient balance for this transaction.';
  }

  if (text.includes('contract validate error')) {
    return text;
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
  if (!root) {
    throw new Error(`Direct buy root not found: ${rootId}`);
  }

  if (!window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  if (ACTIVE_INSTANCES.has(rootId)) {
    try {
      ACTIVE_INSTANCES.get(rootId).destroy();
    } catch (error) {
      console.error('Failed to destroy previous direct buy instance:', error);
    }
  }

  const wallet = window.FourteenWallet;

  root.innerHTML = `
    <div class="fourteen-buy-widget">
      <div class="fourteen-buy-header">
        <div class="fourteen-buy-label">Amount of TRX:</div>
        <div class="fourteen-buy-balance-wrap">
          <div class="fourteen-buy-balance">0.000000 TRX</div>
          <button class="fourteen-buy-refresh" type="button" title="Refresh balance" aria-label="Refresh balance">↻</button>
        </div>
      </div>

      <label class="fourteen-buy-input-label">${inputLabel}</label>

      <input
        class="fourteen-buy-input"
        type="number"
        placeholder="Connect wallet first"
        disabled
        step="0.000001"
        min="0"
        inputmode="decimal"
        aria-label="TRX amount to spend"
      />

      <button class="fourteen-buy-button" type="button" aria-pressed="false">
        ${buttonConnectText}
      </button>

      <div class="fourteen-buy-status" role="status" aria-live="polite"></div>
    </div>
  `;

  const balanceEl = root.querySelector('.fourteen-buy-balance');
  const refreshBtn = root.querySelector('.fourteen-buy-refresh');
  const inputEl = root.querySelector('.fourteen-buy-input');
  const buttonEl = root.querySelector('.fourteen-buy-button');
  const statusEl = root.querySelector('.fourteen-buy-status');

  const contractABI = [
    {
      constant: false,
      inputs: [],
      name: 'buyTokens',
      outputs: [],
      payable: true,
      stateMutability: 'payable',
      type: 'function'
    }
  ];

  let walletBalance = 0;
  let isSubmitting = false;
  let isRefreshing = false;
  let isDestroyed = false;
  let refreshSeq = 0;
  let controllerConnection = null;

  function isAlive() {
    return !isDestroyed && document.body.contains(root);
  }

  function getWalletStateSafe() {
    if (typeof wallet.getWalletState === 'function') {
      return wallet.getWalletState();
    }

    if (typeof wallet.getState === 'function') {
      return wallet.getState();
    }

    return null;
  }

  function getControllerTronWeb() {
    return controllerConnection?.tronWeb || getControllerWallet()?.tronWeb || null;
  }

  function getControllerAddress() {
    return (
      controllerConnection?.address ||
      getControllerWallet()?.address ||
      getControllerTronWeb()?.defaultAddress?.base58 ||
      null
    );
  }

  function getWalletAddressSafe() {
    return (
      getControllerAddress() ||
      getWalletStateSafe()?.address ||
      wallet.getAddress?.() ||
      wallet.getTronWeb?.()?.defaultAddress?.base58 ||
      null
    );
  }

  function getActiveTronWeb() {
    return getControllerTronWeb() || wallet.getTronWeb?.() || null;
  }

  function isWalletReady() {
    const tronWeb = getActiveTronWeb();
    const address = getWalletAddressSafe();

    return !!(tronWeb && address);
  }

  function isConnectedSafe() {
    if (getControllerWallet() || controllerConnection) {
      return true;
    }

    if (typeof wallet.isConnected === 'function') {
      return !!wallet.isConnected();
    }

    return false;
  }

  function setStatus(message = '', isError = false) {
    if (!isAlive()) return;
    statusEl.textContent = message;
    statusEl.classList.toggle('error', Boolean(isError));
  }

  function setButtonState() {
    if (!isAlive()) return;

    const connected = isConnectedSafe();

    buttonEl.disabled = isSubmitting;
    buttonEl.style.opacity = isSubmitting ? '0.7' : '1';
    buttonEl.style.cursor = isSubmitting ? 'wait' : 'pointer';

    if (isSubmitting) {
      buttonEl.textContent = 'Processing...';
      buttonEl.classList.add('connected');
      return;
    }

    if (!connected) {
      buttonEl.textContent = buttonConnectText;
      buttonEl.classList.remove('connected');
      return;
    }

    buttonEl.textContent = buttonBuyText;
    buttonEl.classList.add('connected');
  }

  function applyBalance(balance) {
    if (!isAlive()) return;

    const numeric = Number(balance);
    walletBalance = Number.isFinite(numeric) ? numeric : 0;
    balanceEl.textContent = `${walletBalance.toFixed(6)} TRX`;
  }

  function getMaxAllowed() {
    return Math.max(0, walletBalance - reserveTRX);
  }

  function syncInputToBalance() {
    if (!isAlive()) return;

    if (!isConnectedSafe()) {
      inputEl.disabled = true;
      inputEl.value = '';
      inputEl.placeholder = 'Connect wallet first';
      return;
    }

    inputEl.disabled = isSubmitting;
    inputEl.placeholder = inputLabel;

    const currentValue = parseFloat(inputEl.value);
    if (!Number.isFinite(currentValue) || currentValue < 0) return;

    const maxAllowed = getMaxAllowed();
    if (currentValue > maxAllowed) {
      inputEl.value = maxAllowed > 0 ? maxAllowed.toFixed(6) : '';
    }
  }

  async function getReadyTronWeb(timeoutMs = 12000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const tronWeb = getActiveTronWeb();
      const address = getWalletAddressSafe();

      if (tronWeb && address) {
        return tronWeb;
      }

      await sleep(150);
    }

    throw new Error('Wallet is connected, but TronWeb address is not ready yet.');
  }

  async function initContract() {
    const tronWeb = await getReadyTronWeb();

    if (typeof tronWeb.contract !== 'function') {
      throw new Error('TronWeb contract API is unavailable.');
    }

    try {
      const contractFactory = tronWeb.contract();

      if (contractFactory && typeof contractFactory.at === 'function') {
        return await contractFactory.at(contractAddress);
      }
    } catch (error) {
      console.warn('contract().at failed, fallback to abi constructor:', error);
    }

    return await tronWeb.contract(contractABI, contractAddress);
  }

  async function readBalanceViaTronWeb() {
    const tronWeb = await getReadyTronWeb();
    const address = getWalletAddressSafe();

    if (!address) {
      throw new Error('Wallet address is not available.');
    }

    const balanceSun = await tronWeb.trx.getBalance(address);
    return Number(balanceSun || 0) / 1e6;
  }

  async function forceRefreshBalance(silent = false) {
    if (isRefreshing) {
      return walletBalance;
    }

    if (!isConnectedSafe()) {
      applyBalance(0);
      syncInputToBalance();
      setButtonState();

      if (!silent) {
        setStatus('');
      }

      return 0;
    }

    isRefreshing = true;
    const localSeq = ++refreshSeq;

    try {
      let numeric;

      if (controllerConnection || getControllerWallet()) {
        numeric = await readBalanceViaTronWeb();
      } else if (typeof wallet.getBalanceTRX === 'function') {
        numeric = Number(await wallet.getBalanceTRX());
      } else {
        numeric = await readBalanceViaTronWeb();
      }

      if (localSeq !== refreshSeq || !isAlive()) {
        return walletBalance;
      }

      applyBalance(Number.isFinite(numeric) ? numeric : 0);
      syncInputToBalance();

      if (!silent) {
        setStatus('');
      }

      return walletBalance;
    } catch (error) {
      console.error('Direct buy balance refresh failed:', error);

      if (localSeq === refreshSeq && isAlive()) {
        applyBalance(0);
        syncInputToBalance();

        if (!silent) {
          setStatus('Failed to load wallet balance.', true);
        }
      }

      return 0;
    } finally {
      isRefreshing = false;
      setButtonState();
    }
  }

  async function refreshUI({ silent = true } = {}) {
    if (!isAlive()) return;

    if (!isConnectedSafe()) {
      applyBalance(0);
      syncInputToBalance();
      setButtonState();

      if (!silent) {
        setStatus('');
      }

      return;
    }

    await forceRefreshBalance(silent);
    syncInputToBalance();
    setButtonState();
  }

  async function refreshBalanceSequence() {
    await forceRefreshBalance(true);
    await sleep(1200);
    await forceRefreshBalance(true);
    await sleep(2500);
    await forceRefreshBalance(true);
  }

  async function connectWallet() {
    if (isSubmitting) return;

    setStatus('Connecting wallet...');

    controllerConnection = await connectViaController();

    await getReadyTronWeb(12000);
    await refreshUI({ silent: true });
    setStatus('');
  }

  async function buy() {
    if (isSubmitting) return;

    try {
      if (!isConnectedSafe()) {
        throw new Error('Wallet is not connected.');
      }

      if (!isWalletReady()) {
        await getReadyTronWeb(12000);
      }

      const trxAmount = parseFloat(inputEl.value);

      if (!Number.isFinite(trxAmount) || trxAmount <= 0) {
        setStatus('Enter a valid TRX amount.', true);
        return;
      }

      await forceRefreshBalance(true);

      const maxAllowed = getMaxAllowed();

      if (trxAmount > maxAllowed) {
        if (maxAllowed <= 0) {
          setStatus(`Not enough free TRX. Keep at least ${reserveTRX} TRX in wallet.`, true);
          inputEl.value = '';
        } else {
          setStatus(`You can spend up to ${maxAllowed.toFixed(6)} TRX.`, true);
          inputEl.value = maxAllowed.toFixed(6);
        }
        return;
      }

      const contract = await initContract();
      const valueInSun = Math.round(trxAmount * 1e6);

      if (!Number.isFinite(valueInSun) || valueInSun <= 0) {
        throw new Error('Calculated transaction value is invalid.');
      }

      isSubmitting = true;
      syncInputToBalance();
      setButtonState();
      setStatus('Waiting for wallet confirmation...');

      const result = await contract.buyTokens().send({
        callValue: valueInSun,
        shouldPollResponse: false
      });

      const txid = extractTxid(result);

      if (txid) {
        setStatus('Transaction sent successfully.');
        createBottomNotice('Transaction sent successfully.', txid, false);
      } else {
        setStatus('Transaction sent successfully.');
        createBottomNotice('Transaction sent successfully.', '', false);
      }

      inputEl.value = '';
      setStatus('Refreshing wallet balance...');
      await refreshBalanceSequence();
      setStatus('');
    } catch (error) {
      console.error('Direct buy failed:', error);
      const message = normalizeError(error);
      setStatus(message, true);
      createBottomNotice(message, '', true);
    } finally {
      isSubmitting = false;
      syncInputToBalance();
      setButtonState();
    }
  }

  async function handleButtonClick() {
    try {
      if (!isConnectedSafe()) {
        await connectWallet();
      } else {
        await buy();
      }
    } catch (error) {
      console.error('Direct buy button flow failed:', error);
      const message = normalizeError(error);
      setStatus(message, true);
      createBottomNotice(message, '', true);
      isSubmitting = false;
      syncInputToBalance();
      setButtonState();
    }
  }

  async function handleRefreshClick() {
    if (isRefreshing || isSubmitting) return;

    refreshBtn.style.opacity = '0.6';
    refreshBtn.style.pointerEvents = 'none';
    refreshBtn.style.transform = 'rotate(180deg)';
    refreshBtn.style.transition = 'transform 0.25s ease, opacity 0.25s ease';

    try {
      await forceRefreshBalance(true);
      setStatus('');
    } catch (error) {
      console.error('Manual balance refresh failed:', error);
      setStatus('Failed to refresh wallet balance.', true);
    } finally {
      setTimeout(() => {
        if (!isAlive()) return;
        refreshBtn.style.opacity = '1';
        refreshBtn.style.pointerEvents = 'auto';
        refreshBtn.style.transform = 'rotate(0deg)';
      }, 250);
    }
  }

  function handleInput() {
    let value = parseFloat(inputEl.value);

    if (inputEl.value === '') {
      return;
    }

    if (!Number.isFinite(value) || value < 0) {
      inputEl.value = '';
      return;
    }

    const maxAllowed = getMaxAllowed();

    if (value > maxAllowed) {
      inputEl.value = maxAllowed > 0 ? maxAllowed.toFixed(6) : '';
    }
  }

  buttonEl.addEventListener('click', handleButtonClick);
  refreshBtn.addEventListener('click', handleRefreshClick);
  inputEl.addEventListener('input', handleInput);

  const walletEvents = ['connected', 'disconnected', 'accountChanged', 'balanceChanged'];

  const walletHandler = () => {
    refreshUI({ silent: true }).catch((error) => {
      console.error('Wallet event refresh failed:', error);
    });
  };

  walletEvents.forEach((eventName) => {
    if (typeof wallet.on === 'function') {
      wallet.on(eventName, walletHandler);
    }
  });

  function destroy() {
    isDestroyed = true;

    buttonEl.removeEventListener('click', handleButtonClick);
    refreshBtn.removeEventListener('click', handleRefreshClick);
    inputEl.removeEventListener('input', handleInput);

    if (typeof wallet.off === 'function') {
      walletEvents.forEach((eventName) => {
        wallet.off(eventName, walletHandler);
      });
    }
  }

  ACTIVE_INSTANCES.set(rootId, { destroy });

  refreshUI({ silent: true }).catch((error) => {
    console.error('Initial direct buy UI refresh failed:', error);
    setStatus('Failed to initialize wallet widget.', true);
  });

  return { destroy };
}
