import './liquidityController.css';

const ACTIVE_INSTANCES = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUtc(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function shortTx(txid) {
  return txid ? `${txid.slice(0, 8)}…` : 'View';
}

function trxAmount(value) {
  return (Number(value || 0) / 1e6).toFixed(2);
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

  return text;
}

export function mountLiquidityController({
  rootId,
  controllerAddress = 'TVKBLwg222skKnZ3F3boTiH35KC7nvYEuZ',
  apiKey,
  explorerBase = 'https://tronscan.org/#/transaction/',
  eventsBase = 'https://api.trongrid.io/v1/contracts'
}) {
  const root = document.getElementById(rootId);
  if (!root) {
    throw new Error(`Liquidity controller root not found: ${rootId}`);
  }

  if (!window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  if (ACTIVE_INSTANCES.has(rootId)) {
    try {
      ACTIVE_INSTANCES.get(rootId).destroy();
    } catch (error) {
      console.error('Failed to destroy previous liquidity instance:', error);
    }
  }

  const wallet = window.FourteenWallet;

  root.innerHTML = `
    <div class="fourteen-liquidity-widget">
      <div class="fourteen-liquidity-topbar">
        <div class="fourteen-liquidity-wallet"></div>
        <div class="fourteen-liquidity-badge">AUTOMATED</div>
      </div>

      <div class="fourteen-liquidity-summary">
        <div class="fourteen-liquidity-summary-card">
          <div class="fourteen-liquidity-summary-label">Controller</div>
          <div class="fourteen-liquidity-summary-value">${controllerAddress.slice(0, 6)}...${controllerAddress.slice(-6)}</div>
        </div>

        <div class="fourteen-liquidity-summary-card">
          <div class="fourteen-liquidity-summary-label">Last Execute</div>
          <div class="fourteen-liquidity-summary-value" data-role="last-execute">—</div>
        </div>

        <div class="fourteen-liquidity-summary-card">
          <div class="fourteen-liquidity-summary-label">Latest TRX Received</div>
          <div class="fourteen-liquidity-summary-value" data-role="last-received">—</div>
        </div>
      </div>

      <div class="fourteen-liquidity-details">
        <div class="fourteen-liquidity-note">
          <strong>Manual trigger:</strong> connect a wallet and call the controller if conditions are satisfied.
          Execution history and incoming TRX are shown below for transparency.
        </div>
      </div>

      <button class="fourteen-liquidity-button" type="button" aria-pressed="false">
        CONNECT WALLET
      </button>

      <div class="fourteen-liquidity-status" role="status" aria-live="polite"></div>

      <div class="fourteen-liquidity-section">
        <div class="fourteen-liquidity-section-head">
          <div>
            <div class="fourteen-liquidity-section-title">Last Liquidity Executions</div>
            <div class="fourteen-liquidity-section-subtitle">Recent controller executions on-chain</div>
          </div>
          <a
            class="fourteen-liquidity-section-link"
            href="https://tronscan.org/#/contract/${controllerAddress}/events"
            target="_blank"
            rel="noopener noreferrer"
          >
            View all
          </a>
        </div>

        <div class="fourteen-liquidity-desktop-table-wrap">
          <table class="fourteen-liquidity-table">
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Total</th>
                <th>JustMoney</th>
                <th>Sun.io</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody data-role="exec-table"></tbody>
          </table>
        </div>

        <div class="fourteen-liquidity-mobile-list" data-role="exec-mobile"></div>
      </div>

      <div class="fourteen-liquidity-section">
        <div class="fourteen-liquidity-section-head">
          <div>
            <div class="fourteen-liquidity-section-title">Last TRX Received</div>
            <div class="fourteen-liquidity-section-subtitle">Recent deposits received by the controller</div>
          </div>
        </div>

        <div class="fourteen-liquidity-desktop-table-wrap">
          <table class="fourteen-liquidity-table">
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Amount</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody data-role="trx-table"></tbody>
          </table>
        </div>

        <div class="fourteen-liquidity-mobile-list" data-role="trx-mobile"></div>
      </div>
    </div>
  `;

  const walletInfoEl = root.querySelector('.fourteen-liquidity-wallet');
  const buttonEl = root.querySelector('.fourteen-liquidity-button');
  const statusEl = root.querySelector('.fourteen-liquidity-status');
  const lastExecuteEl = root.querySelector('[data-role="last-execute"]');
  const lastReceivedEl = root.querySelector('[data-role="last-received"]');
  const execTableEl = root.querySelector('[data-role="exec-table"]');
  const execMobileEl = root.querySelector('[data-role="exec-mobile"]');
  const trxTableEl = root.querySelector('[data-role="trx-table"]');
  const trxMobileEl = root.querySelector('[data-role="trx-mobile"]');

  let connected = false;
  let contract = null;
  let busy = false;
  let isDestroyed = false;

  function isAlive() {
    return !isDestroyed && document.body.contains(root);
  }

  function setStatus(text = '', isError = false) {
    if (!isAlive()) return;
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  function resetWalletUi() {
    connected = false;
    contract = null;
    if (!isAlive()) return;
    walletInfoEl.textContent = '';
    buttonEl.disabled = false;
    buttonEl.classList.remove('connected');
    buttonEl.textContent = 'CONNECT WALLET';
    buttonEl.setAttribute('aria-pressed', 'false');
    setStatus('');
  }

  function renderExecEmpty(message) {
    execTableEl.innerHTML = `<tr><td colspan="5" class="muted">${message}</td></tr>`;
    execMobileEl.innerHTML = `<div class="fourteen-liquidity-empty">${message}</div>`;
  }

  function renderTrxEmpty(message) {
    trxTableEl.innerHTML = `<tr><td colspan="3" class="muted">${message}</td></tr>`;
    trxMobileEl.innerHTML = `<div class="fourteen-liquidity-empty">${message}</div>`;
  }

  async function getReadyTronWeb(timeoutMs = 12000) {
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      const tronWeb = wallet.getTronWeb?.();
      const address = tronWeb?.defaultAddress?.base58 || wallet.getAddress?.() || null;

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

    const factory = tronWeb.contract();
    if (!factory || typeof factory.at !== 'function') {
      throw new Error('TronWeb contract factory is unavailable.');
    }

    return await factory.at(controllerAddress);
  }

  async function fetchEvents(eventName, limit = 20) {
    const resp = await fetch(
      `${eventsBase}/${controllerAddress}/events?event_name=${eventName}&limit=${limit}`,
      {
        headers: {
          'TRON-PRO-API-KEY': apiKey
        }
      }
    );

    if (!resp.ok) {
      throw new Error(`Events API failed with status ${resp.status}`);
    }

    const json = await resp.json();
    return json.data || [];
  }

  async function loadExecuteEvents() {
    try {
      const data = await fetchEvents('LiquidityExecuted', 20);

      if (!data.length) {
        renderExecEmpty('No execution data yet.');
        lastExecuteEl.textContent = '—';
        return;
      }

      lastExecuteEl.textContent = formatUtc(data[0].block_timestamp);

      execTableEl.innerHTML = data
        .map((e) => `
          <tr>
            <td>${formatUtc(e.block_timestamp)}</td>
            <td>${trxAmount(e.result?.totalAmount)} TRX</td>
            <td>${trxAmount(e.result?.amountA)} TRX</td>
            <td>${trxAmount(e.result?.amountB)} TRX</td>
            <td>
              <a class="fourteen-liquidity-link" href="${explorerBase}${e.transaction_id}" target="_blank" rel="noopener noreferrer">
                ${shortTx(e.transaction_id)}
              </a>
            </td>
          </tr>
        `)
        .join('');

      execMobileEl.innerHTML = data
        .map((e) => `
          <div class="fourteen-liquidity-event-card">
            <div class="fourteen-liquidity-event-top">
              <div class="fourteen-liquidity-event-title">${trxAmount(e.result?.totalAmount)} TRX</div>
              <div class="fourteen-liquidity-event-badge">Executed</div>
            </div>

            <div class="fourteen-liquidity-event-grid">
              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Date (UTC)</div>
                <div class="fourteen-liquidity-event-value">${formatUtc(e.block_timestamp)}</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">JustMoney</div>
                <div class="fourteen-liquidity-event-value">${trxAmount(e.result?.amountA)} TRX</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Sun.io</div>
                <div class="fourteen-liquidity-event-value">${trxAmount(e.result?.amountB)} TRX</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Transaction</div>
                <div class="fourteen-liquidity-event-value">
                  <a class="fourteen-liquidity-link" href="${explorerBase}${e.transaction_id}" target="_blank" rel="noopener noreferrer">
                    ${shortTx(e.transaction_id)}
                  </a>
                </div>
              </div>
            </div>
          </div>
        `)
        .join('');
    } catch (error) {
      console.error('loadExecuteEvents error:', error);
      renderExecEmpty('Could not load execution history.');
    }
  }

  async function loadTrxReceived() {
    try {
      const data = await fetchEvents('TRXReceived', 20);

      if (!data.length) {
        renderTrxEmpty('No TRX received data yet.');
        lastReceivedEl.textContent = '—';
        return;
      }

      lastReceivedEl.textContent = `${trxAmount(data[0].result?.amount)} TRX`;

      trxTableEl.innerHTML = data
        .map((e) => `
          <tr>
            <td>${formatUtc(e.block_timestamp)}</td>
            <td>${trxAmount(e.result?.amount)} TRX</td>
            <td>
              <a class="fourteen-liquidity-link" href="${explorerBase}${e.transaction_id}" target="_blank" rel="noopener noreferrer">
                ${shortTx(e.transaction_id)}
              </a>
            </td>
          </tr>
        `)
        .join('');

      trxMobileEl.innerHTML = data
        .map((e) => `
          <div class="fourteen-liquidity-event-card">
            <div class="fourteen-liquidity-event-top">
              <div class="fourteen-liquidity-event-title">${trxAmount(e.result?.amount)} TRX</div>
              <div class="fourteen-liquidity-event-badge">Received</div>
            </div>

            <div class="fourteen-liquidity-event-grid">
              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Date (UTC)</div>
                <div class="fourteen-liquidity-event-value">${formatUtc(e.block_timestamp)}</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Transaction</div>
                <div class="fourteen-liquidity-event-value">
                  <a class="fourteen-liquidity-link" href="${explorerBase}${e.transaction_id}" target="_blank" rel="noopener noreferrer">
                    ${shortTx(e.transaction_id)}
                  </a>
                </div>
              </div>
            </div>
          </div>
        `)
        .join('');
    } catch (error) {
      console.error('loadTrxReceived error:', error);
      renderTrxEmpty('Could not load TRX received history.');
    }
  }

  async function connectWalletHandler() {
    if (connected || busy) return;

    try {
      busy = true;
      buttonEl.disabled = true;
      buttonEl.textContent = 'CONNECTING...';
      setStatus('Connecting wallet...');

await wallet.openConnectModal();
      
      const tronWeb = await getReadyTronWeb(12000);
      contract = await initContract();
      connected = true;

      const userAddress = tronWeb.defaultAddress.base58;
      walletInfoEl.textContent = `Wallet: ${userAddress.slice(0, 6)}...${userAddress.slice(-6)}`;

      buttonEl.disabled = false;
      buttonEl.classList.add('connected');
      buttonEl.textContent = 'EXECUTE LIQUIDITY';
      buttonEl.setAttribute('aria-pressed', 'true');
      setStatus('');
    } catch (error) {
      console.error('liquidity connect error:', error);
      resetWalletUi();
      setStatus('Failed to connect: ' + normalizeError(error), true);
    } finally {
      busy = false;
    }
  }

  async function executeLiquidity() {
    if (busy) return;

    try {
      busy = true;
      buttonEl.disabled = true;
      buttonEl.textContent = 'PROCESSING...';
      setStatus('Sending transaction...');

      if (!connected || !contract) {
        const tronWeb = await getReadyTronWeb(12000);
        if (!tronWeb?.defaultAddress?.base58) {
          throw new Error('Wallet not ready');
        }
        contract = await initContract();
        connected = true;
      }

      const tx = await contract.executeLiquidity().send({ shouldPollResponse: true });
      const txid = extractTxid(tx);

      setStatus(txid ? `Done · ${txid}` : 'Execution completed.');

      await loadExecuteEvents();
      await loadTrxReceived();
    } catch (error) {
      console.error('executeLiquidity error:', error);
      setStatus(normalizeError(error), true);
    } finally {
      busy = false;
      if (connected) {
        buttonEl.disabled = false;
        buttonEl.textContent = 'EXECUTE LIQUIDITY';
      } else {
        buttonEl.disabled = false;
        buttonEl.textContent = 'CONNECT WALLET';
      }
    }
  }

  async function handleButtonClick() {
    if (!connected) {
      await connectWalletHandler();
      return;
    }

    await executeLiquidity();
  }

  const walletEvents = ['disconnected', 'accountChanged'];
  const walletHandler = () => {
    resetWalletUi();
  };

  buttonEl.addEventListener('click', handleButtonClick);

  if (typeof wallet.on === 'function') {
    walletEvents.forEach((eventName) => {
      wallet.on(eventName, walletHandler);
    });
  }

  function destroy() {
    isDestroyed = true;
    buttonEl.removeEventListener('click', handleButtonClick);

    if (typeof wallet.off === 'function') {
      walletEvents.forEach((eventName) => {
        wallet.off(eventName, walletHandler);
      });
    }
  }

  ACTIVE_INSTANCES.set(rootId, { destroy });

  loadExecuteEvents();
  loadTrxReceived();

  return { destroy };
}
