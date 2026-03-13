import './unlockTimeline.css';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function mountUnlockTimeline({
  rootId,
  contractAddress,
  apiKey,
  decimals = 6,
  unlockDays = 14,
  apiUrl = 'https://rot.endjgfsv.link/swap/router',
  toToken = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
  typeList = 'SUNSWAP_V3',
  connectText = 'CONNECT WALLET',
  swapUrl = 'https://4teen.me/sw'
}) {
  const root = document.getElementById(rootId);
  if (!root) {
    throw new Error(`Unlock timeline root not found: ${rootId}`);
  }

  if (!window.FourteenWallet) {
    throw new Error('FourteenWallet is not loaded');
  }

  const wallet = window.FourteenWallet;

  if (root.dataset.timelineMounted === 'true') {
    return;
  }
  root.dataset.timelineMounted = 'true';

  root.innerHTML = `
    <div class="fourteen-timeline-widget">
      <div class="fourteen-timeline-topbar">
        <div class="fourteen-timeline-wallet"></div>
        <div class="fourteen-timeline-badge">14 DAY LOCK</div>
      </div>

      <div class="fourteen-timeline-summary">
        <div class="fourteen-timeline-summary-card">
          <div class="fourteen-timeline-summary-label">Available Now</div>
          <div class="fourteen-timeline-summary-row">
            <div class="fourteen-timeline-summary-value" data-role="available">— 4TEEN</div>
            <a
              class="fourteen-timeline-swap-link"
              data-role="swap-link"
              href="${swapUrl}"
              target="_self"
              rel="noopener noreferrer"
              style="display:none;"
            >
              Swap
            </a>
          </div>
        </div>

        <div class="fourteen-timeline-summary-card">
          <div class="fourteen-timeline-summary-label">Current Rate</div>
          <div class="fourteen-timeline-summary-value" data-role="rate">— TRX</div>
        </div>
      </div>

      <div class="fourteen-timeline-details">
        <div class="fourteen-timeline-placeholder">
          Connect wallet to load balances, current rate, and your unlock timeline.
        </div>
      </div>

      <button class="fourteen-timeline-button" type="button" aria-pressed="false">
        ${connectText}
      </button>

      <div class="fourteen-timeline-status" role="status" aria-live="polite"></div>

      <div class="fourteen-timeline-history">
        <div class="fourteen-timeline-history-head">
          <div class="fourteen-timeline-history-title">Unlock Timeline</div>
          <div class="fourteen-timeline-history-subtitle">Each purchase unlocks after ${unlockDays} days</div>
        </div>

        <div class="fourteen-timeline-desktop-table-wrap">
          <table class="fourteen-timeline-table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Unlock (GMT)</th>
                <th>Countdown</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div class="fourteen-timeline-mobile-list"></div>
      </div>
    </div>
  `;

  const walletInfoEl = root.querySelector('.fourteen-timeline-wallet');
  const availableEl = root.querySelector('[data-role="available"]');
  const rateSummaryEl = root.querySelector('[data-role="rate"]');
  const swapLinkEl = root.querySelector('[data-role="swap-link"]');
  const detailsEl = root.querySelector('.fourteen-timeline-details');
  const buttonEl = root.querySelector('.fourteen-timeline-button');
  const statusEl = root.querySelector('.fourteen-timeline-status');
  const tbodyEl = root.querySelector('.fourteen-timeline-table tbody');
  const mobileListEl = root.querySelector('.fourteen-timeline-mobile-list');

  let walletConnected = false;
  let globalBalances = { total: 0, locked: 0, available: 0 };
  let globalConversionRates = { qsiToTrx: '—', qsiToUsd: '—' };
  let countdownInterval = null;
  let isConnecting = false;

  function setStatus(text = '', isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', isError);
  }

  function formatRemaining(ms) {
    if (ms <= 0) return '00:00:00';

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    return (days > 0 ? `${days}d ` : '') + `${hh}:${mm}:${ss}`;
  }

  function formatUnlockDate(unlockMs) {
    return new Date(unlockMs).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function updateSwapLink() {
    if (!swapLinkEl) return;

    if (globalBalances.available > 0) {
      swapLinkEl.style.display = 'inline-flex';
    } else {
      swapLinkEl.style.display = 'none';
    }
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function renderEmptyHistory(message) {
    tbodyEl.innerHTML = `
      <tr>
        <td colspan="4" class="muted">${message}</td>
      </tr>
    `;

    mobileListEl.innerHTML = `
      <div class="fourteen-timeline-empty">${message}</div>
    `;
  }

  function setDisconnectedUI() {
    walletConnected = false;
    walletInfoEl.textContent = '';
    availableEl.textContent = '— 4TEEN';
    rateSummaryEl.textContent = '— TRX';
    globalBalances = { total: 0, locked: 0, available: 0 };
    updateSwapLink();

    detailsEl.innerHTML = `
      <div class="fourteen-timeline-placeholder">
        Connect wallet to load balances, current rate, and your unlock timeline.
      </div>
    `;

    renderEmptyHistory('Connect wallet to view unlock events.');
    setStatus('');
    stopCountdown();

    buttonEl.disabled = false;
    buttonEl.classList.remove('connected');
    buttonEl.textContent = connectText;
    buttonEl.setAttribute('aria-pressed', 'false');
  }

  function renderDetails() {
    detailsEl.innerHTML = `
      <div class="fourteen-timeline-details-grid">
        <div class="fourteen-timeline-info-card">
          <div class="fourteen-timeline-info-label">Total Balance</div>
          <div class="fourteen-timeline-info-value">${globalBalances.total.toFixed(6)} 4TEEN</div>
        </div>

        <div class="fourteen-timeline-info-card">
          <div class="fourteen-timeline-info-label">Locked Balance</div>
          <div class="fourteen-timeline-info-value locked">${globalBalances.locked.toFixed(6)} 4TEEN</div>
        </div>

        <div class="fourteen-timeline-info-card">
          <div class="fourteen-timeline-info-label">Available Balance</div>
          <div class="fourteen-timeline-info-value available">${globalBalances.available.toFixed(6)} 4TEEN</div>
        </div>

        <div class="fourteen-timeline-info-card">
          <div class="fourteen-timeline-info-label">Conversion</div>
          <div class="fourteen-timeline-info-value">1 4TEEN → ${globalConversionRates.qsiToTrx} TRX</div>
          <div class="fourteen-timeline-info-subvalue">≈ ${globalConversionRates.qsiToUsd} USD · Pool fee 0.05%</div>
        </div>
      </div>
    `;

    availableEl.textContent = `${globalBalances.available.toFixed(6)} 4TEEN`;
    rateSummaryEl.textContent =
      globalConversionRates.qsiToTrx && globalConversionRates.qsiToTrx !== '—'
        ? `${globalConversionRates.qsiToTrx} TRX`
        : '— TRX';

    updateSwapLink();
  }

  async function getBalances() {
    const tronWeb = wallet.getTronWeb();

    if (!tronWeb?.defaultAddress?.base58) {
      throw new Error('Wallet address not available');
    }

    const userAddress = tronWeb.defaultAddress.base58;
    const contract = await tronWeb.contract().at(contractAddress);

    const totalRaw = await contract.balanceOf(userAddress).call();
    const lockedRaw = await contract.lockedBalanceOf(userAddress).call();

    const formattedTotal = parseFloat(totalRaw.toString()) / Math.pow(10, decimals);
    const formattedLocked = parseFloat(lockedRaw.toString()) / Math.pow(10, decimals);
    const availableBalance = Math.max(0, formattedTotal - formattedLocked);

    globalBalances.total = formattedTotal;
    globalBalances.locked = formattedLocked;
    globalBalances.available = availableBalance;

    availableEl.textContent = `${availableBalance.toFixed(6)} 4TEEN`;
    updateSwapLink();
  }

  async function fetchSwapRate(amount = 1) {
    const amountIn = Math.round(amount * Math.pow(10, decimals));
    const url = `${apiUrl}?fromToken=${contractAddress}&toToken=${toToken}&amountIn=${amountIn}&typeList=${typeList}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Rate API failed with status ${resp.status}`);
    }

    const data = await resp.json();

    if (data && data.code === 0 && Array.isArray(data.data) && data.data.length > 0) {
      return data.data[0];
    }

    return null;
  }

  function renderHistory(events) {
    const now = Date.now();

    tbodyEl.innerHTML = events
      .map((event) => {
        const unlocked = event.unlockMs <= now;

        return `
          <tr data-unlock="${event.unlockMs}">
            <td>
              <a href="${event.trxLink}" target="_blank" rel="noopener noreferrer">
                ${event.amount.toFixed(6)} 4TEEN
              </a>
            </td>
            <td>${event.formattedUnlockDate}</td>
            <td class="fourteen-timeline-countdown">${unlocked ? '00:00:00' : formatRemaining(event.unlockMs - now)}</td>
            <td class="fourteen-timeline-status-cell ${unlocked ? 'unlocked' : 'locked'}">
              ${unlocked ? 'Unlocked' : 'Locked'}
            </td>
          </tr>
        `;
      })
      .join('');

    mobileListEl.innerHTML = events
      .map((event) => {
        const unlocked = event.unlockMs <= now;

        return `
          <div class="fourteen-timeline-event-card" data-unlock="${event.unlockMs}">
            <div class="fourteen-timeline-event-top">
              <a class="fourteen-timeline-event-amount" href="${event.trxLink}" target="_blank" rel="noopener noreferrer">
                ${event.amount.toFixed(6)} 4TEEN
              </a>
              <div class="fourteen-timeline-status-pill ${unlocked ? 'unlocked' : 'locked'}">
                ${unlocked ? 'Unlocked' : 'Locked'}
              </div>
            </div>

            <div class="fourteen-timeline-event-grid">
              <div class="fourteen-timeline-event-item">
                <div class="fourteen-timeline-event-label">Unlock</div>
                <div class="fourteen-timeline-event-value">${event.formattedUnlockDate}</div>
              </div>

              <div class="fourteen-timeline-event-item">
                <div class="fourteen-timeline-event-label">Countdown</div>
                <div class="fourteen-timeline-event-value fourteen-timeline-countdown">
                  ${unlocked ? '00:00:00' : formatRemaining(event.unlockMs - now)}
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function startCountdownUpdater() {
    stopCountdown();

    countdownInterval = setInterval(() => {
      const now = Date.now();
      const items = Array.from(root.querySelectorAll('[data-unlock]'));

      items.forEach((item) => {
        const unlockMs = Number(item.getAttribute('data-unlock') || 0);
        const countdownCell = item.querySelector('.fourteen-timeline-countdown');
        const statusCell =
          item.querySelector('.fourteen-timeline-status-cell') ||
          item.querySelector('.fourteen-timeline-status-pill');

        if (!countdownCell) return;

        if (unlockMs <= now) {
          countdownCell.textContent = '00:00:00';

          if (statusCell) {
            statusCell.textContent = 'Unlocked';
            statusCell.classList.add('unlocked');
            statusCell.classList.remove('locked');
          }
        } else {
          countdownCell.textContent = formatRemaining(unlockMs - now);

          if (statusCell) {
            statusCell.textContent = 'Locked';
            statusCell.classList.add('locked');
            statusCell.classList.remove('unlocked');
          }
        }
      });
    }, 1000);
  }

  async function getFilteredContractEvents() {
    const tronWeb = wallet.getTronWeb();

    if (!tronWeb?.defaultAddress?.base58) {
      throw new Error('Wallet address not available');
    }

    const userAddress = tronWeb.defaultAddress.base58;

    const resp = await fetch(
      `https://api.trongrid.io/v1/contracts/${contractAddress}/events?event_name=BuyTokens&limit=200`,
      {
        headers: {
          'TRON-PRO-API-KEY': apiKey
        }
      }
    );

    if (resp.status === 429) {
      throw new Error('429 rate limit');
    }

    if (!resp.ok) {
      throw new Error(`Events API failed with status ${resp.status}`);
    }

    const data = await resp.json();

    if (!data || !data.data || data.data.length === 0) {
      renderEmptyHistory('No transactions found.');
      return;
    }

    const filteredEvents = data.data.filter((ev) => {
      if (!ev.result || !ev.result.buyer) return false;
      try {
        const buyerBase58 = tronWeb.address.fromHex(ev.result.buyer);
        return buyerBase58 === userAddress;
      } catch {
        return false;
      }
    });

    if (filteredEvents.length === 0) {
      renderEmptyHistory('No matching transactions found.');
      return;
    }

    filteredEvents.sort((a, b) => (Number(a.block_timestamp) || 0) - (Number(b.block_timestamp) || 0));

    const mapped = filteredEvents.map((ev) => {
      const timestamp = Number(ev.block_timestamp) || 0;
      const amount = parseFloat(ev.result.amountTokens || 0) / Math.pow(10, decimals);
      const unlockMs = timestamp + unlockDays * 24 * 60 * 60 * 1000;

      return {
        amount,
        unlockMs,
        formattedUnlockDate: formatUnlockDate(unlockMs),
        trxLink: ev.transaction_id
          ? `https://tronscan.org/#/transaction/${ev.transaction_id}`
          : '#'
      };
    });

    renderHistory(mapped);
    startCountdownUpdater();
  }

  async function connectWalletHandler() {
    if (walletConnected || isConnecting) return;

    try {
      isConnecting = true;
      buttonEl.disabled = true;
      buttonEl.textContent = 'CONNECTING...';
      setStatus('Connecting wallet...', false);

      await wallet.openConnectModal();

      const tronWeb = wallet.getTronWeb();
      if (!tronWeb?.defaultAddress?.base58) {
        throw new Error('Wallet not ready');
      }

      const userAddress = tronWeb.defaultAddress.base58;
      walletInfoEl.textContent = `Wallet: ${userAddress.slice(0, 6)}...${userAddress.slice(-6)}`;

      await getBalances();

      await wait(500);

      try {
        const initialRate = await fetchSwapRate(1);
        if (initialRate) {
          globalConversionRates.qsiToTrx = parseFloat(initialRate.amountOut).toFixed(6);
          globalConversionRates.qsiToUsd =
            initialRate.outUsd !== undefined ? parseFloat(initialRate.outUsd).toFixed(6) : '—';
        }
      } catch (error) {
        console.error('fetchSwapRate error:', error);
        globalConversionRates.qsiToTrx = '—';
        globalConversionRates.qsiToUsd = '—';
      }

      renderDetails();

      buttonEl.disabled = true;
      buttonEl.classList.add('connected');
      buttonEl.style.cursor = 'default';
      buttonEl.setAttribute('aria-pressed', 'true');
      buttonEl.textContent = `4TEEN: ${globalBalances.available.toFixed(6)}`;

      walletConnected = true;
      setStatus('', false);

      await wait(900);

      try {
        await getFilteredContractEvents();
      } catch (error) {
        console.error('getFilteredContractEvents error:', error);

        if (String(error?.message || '').includes('429')) {
          setStatus('Unlock events are temporarily rate-limited. Please try again in a few moments.', true);
        } else {
          setStatus('Could not load unlock events right now.', true);
        }

        renderEmptyHistory('Unlock events are temporarily unavailable.');
      }
    } catch (error) {
      console.error('connect error:', error);
      setStatus('Failed to connect: ' + (error?.message || error), true);
      buttonEl.disabled = false;
      buttonEl.classList.remove('connected');
      buttonEl.textContent = connectText;
      buttonEl.setAttribute('aria-pressed', 'false');
    } finally {
      isConnecting = false;
    }
  }

  buttonEl.addEventListener('click', connectWalletHandler);

  wallet.on('disconnected', () => {
    setDisconnectedUI();
  });

  wallet.on('accountChanged', () => {
    setDisconnectedUI();
  });

  setDisconnectedUI();
}
