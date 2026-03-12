import { detectWallets, connect } from '../core/walletManager.js';

const WALLET_ORDER = ['okx', 'binance', 'trust', 'tronlink'];

function getUserAgent() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isOKXInAppBrowser() {
  const ua = getUserAgent();
  return /OKX|OKApp/i.test(ua) || !!window?.okxwallet;
}

function isBinanceInAppBrowser() {
  const ua = getUserAgent();
  return /Binance/i.test(ua) || !!window?.binancew3w || !!window?.BinanceChain;
}

function isTrustInAppBrowser() {
  const ua = getUserAgent();
  return /Trust|TrustWallet/i.test(ua) || !!window?.trustwallet || !!window?.trustWallet;
}

function resolveDetectedWallets(rawDetected = {}) {
  const wallets = {
    tronlink: Boolean(rawDetected.tronlink),
    okx: Boolean(rawDetected.okx),
    trust: Boolean(rawDetected.trust),
    binance: Boolean(rawDetected.binance)
  };

  if (wallets.okx && isOKXInAppBrowser()) {
    return {
      tronlink: false,
      okx: true,
      trust: false,
      binance: false
    };
  }

  if (wallets.binance && isBinanceInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      trust: false,
      binance: true
    };
  }

  if (wallets.trust && isTrustInAppBrowser()) {
    return {
      tronlink: false,
      okx: false,
      trust: true,
      binance: false
    };
  }

  return wallets;
}

function walletButton(name, available) {
  const icons = {
    tronlink: '🟠',
    okx: '⚫',
    trust: '🔵',
    binance: '🟡'
  };

  const labels = {
    tronlink: 'TronLink',
    okx: 'OKX Wallet',
    trust: 'Trust Wallet',
    binance: 'Binance Wallet'
  };

  const installLinks = {
    tronlink: 'https://www.tronlink.org/',
    okx: 'https://www.okx.com/web3',
    trust: 'https://trustwallet.com/',
    binance: 'https://www.binance.com/en/web3wallet'
  };

  if (!available) {
    return `
      <div class="fw-wallet-btn disabled">
        <span class="fw-wallet-icon">${icons[name]}</span>
        <span class="fw-wallet-name">${labels[name]}</span>
        <a href="${installLinks[name]}" target="_blank" rel="noopener noreferrer" class="fw-wallet-install">
          Install
        </a>
      </div>
    `;
  }

  return `
    <button type="button" class="fw-wallet-btn" data-wallet="${name}">
      <span class="fw-wallet-icon">${icons[name]}</span>
      <span class="fw-wallet-name">${labels[name]}</span>
    </button>
  `;
}

function autoConnectIfPossible(wallets) {
  const available = WALLET_ORDER.filter((name) => wallets[name]);

  if (available.length === 1) {
    return available[0];
  }

  return null;
}

function createModalHTML(wallets) {
  return `
    <div class="fw-connect-overlay">
      <div class="fw-connect-box">

        <div class="fw-connect-header">
          Connect Wallet
        </div>

        <div class="fw-wallet-list">
          ${walletButton('okx', wallets.okx)}
          ${walletButton('binance', wallets.binance)}
          ${walletButton('trust', wallets.trust)}
          ${walletButton('tronlink', wallets.tronlink)}
        </div>

        <button type="button" class="fw-connect-close">
          Cancel
        </button>

      </div>
    </div>
  `;
}

export function openConnectModal() {
  return new Promise(async (resolve, reject) => {
    let settled = false;

    const rawWallets = detectWallets();
    const wallets = resolveDetectedWallets(rawWallets);
    const autoWallet = autoConnectIfPossible(wallets);

    if (autoWallet) {
      try {
        const result = await connect(autoWallet);
        settled = true;
        resolve(result);
        return;
      } catch (error) {
        settled = true;
        reject(error);
        return;
      }
    }

    const modal = document.createElement('div');
    modal.className = 'fw-connect-modal';
    modal.innerHTML = createModalHTML(wallets);

    const overlay = modal.querySelector('.fw-connect-overlay');
    const closeBtn = modal.querySelector('.fw-connect-close');
    const walletButtons = modal.querySelectorAll('.fw-wallet-btn[data-wallet]');

    let connecting = false;

    function cleanup() {
      overlay.classList.remove('visible');

      setTimeout(() => {
        if (modal.parentNode) {
          modal.remove();
        }
      }, 150);
    }

    function safeReject(error) {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function safeResolve(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    function startLoading(btn) {
      connecting = true;

      walletButtons.forEach((b) => {
        b.disabled = true;
        b.style.opacity = '0.5';
      });

      btn.style.opacity = '1';
      btn.innerHTML = `
        <span>⏳</span>
        <span>Connecting...</span>
      `;
    }

    closeBtn.onclick = () => {
      cleanup();
      safeReject(new Error('Wallet selection cancelled'));
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        safeReject(new Error('Wallet selection cancelled'));
      }
    };

    walletButtons.forEach((btn) => {
      btn.onclick = async () => {
        if (connecting) return;

        const walletType = btn.dataset.wallet;

        try {
          startLoading(btn);

          const result = await connect(walletType);

          cleanup();
          safeResolve(result);
        } catch (error) {
          console.error('[FourteenWallet] connectModal error', error);
          cleanup();
          safeReject(error);
        }
      };
    });

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });
  });
}
