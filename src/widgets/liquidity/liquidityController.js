import './liquidityController.css';

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

  const wallet = window.FourteenWallet;

  if (root.dataset.liquidityMounted === 'true') {
    return;
  }
  root.dataset.liquidityMounted = 'true';

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

  function setStatus(text = '', isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  function resetWalletUi() {
    connected = false;
    contract = null;
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
            <td>${trxAmount(e.result.totalAmount)} TRX</td>
            <td>${trxAmount(e.result.amountA)} TRX</td>
            <td>${trxAmount(e.result.amountB)} TRX</td>
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
              <div class="fourteen-liquidity-event-title">${trxAmount(e.result.totalAmount)} TRX</div>
              <div class="fourteen-liquidity-event-badge">Executed</div>
            </div>

            <div class="fourteen-liquidity-event-grid">
              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Date (UTC)</div>
                <div class="fourteen-liquidity-event-value">${formatUtc(e.block_timestamp)}</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">JustMoney</div>
                <div class="fourteen-liquidity-event-value">${trxAmount(e.result.amountA)} TRX</div>
              </div>

              <div class="fourteen-liquidity-event-item">
                <div class="fourteen-liquidity-event-label">Sun.io</div>
                <div class="fourteen-liquidity-event-value">${trxAmount(e.result.amountB)} TRX</div>
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

      lastReceivedEl.textContent = `${trxAmount(data[0].result.amount)} TRX`;

      trxTableEl.innerHTML = data
        .map((e) => `
          <tr>
            <td>${formatUtc(e.block_timestamp)}</td>
            <td>${trxAmount(e.result.amount)} TRX</td>
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
              <div class="fourteen-liquidity-event-title">${trxAmount(e.result.amount)} TRX</div>
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

      await wallet.connect();

      const tronWeb = wallet.getTronWeb();
      if (!tronWeb?.defaultAddress?.base58) {
        throw new Error('Wallet not ready');
      }

      contract = await tronWeb.contract().at(controllerAddress);
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
      setStatus('Failed to connect: ' + (error?.message || error), true);
    } finally {
      busy = false;
    }
  }

  async function executeLiquidity() {
    if (!contract || busy) return;

    try {
      busy = true;
      buttonEl.disabled = true;
      buttonEl.textContent = 'PROCESSING...';
      setStatus('Sending transaction...');

      const tx = await contract.executeLiquidity().send({ shouldPollResponse: true });
      const txid = typeof tx === 'string' ? tx : (tx?.txid || tx?.transaction || '');

      setStatus(
        txid
          ? `Done · ${txid}`
          : 'Execution completed.'
      );

      await loadExecuteEvents();
      await loadTrxReceived();
    } catch (error) {
      console.error('executeLiquidity error:', error);
      setStatus(error?.message || 'Transaction failed', true);
    } finally {
      busy = false;
      buttonEl.disabled = false;
      buttonEl.textContent = 'EXECUTE LIQUIDITY';
    }
  }

  buttonEl.addEventListener('click', async () => {
    if (!connected) {
      await connectWalletHandler();
      return;
    }

    await executeLiquidity();
  });

  wallet.on('disconnected', resetWalletUi);
  wallet.on('accountChanged', resetWalletUi);

  loadExecuteEvents();
  loadTrxReceived();
}
