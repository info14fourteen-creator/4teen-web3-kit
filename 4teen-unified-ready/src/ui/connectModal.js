import { detectWallets, connect } from '../core/walletManager.js';

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

  const available = Object.entries(wallets)
    .filter(([name, detected]) => detected)
    .map(([name]) => name);

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

          ${walletButton('tronlink', wallets.tronlink)}
          ${walletButton('okx', wallets.okx)}
          ${walletButton('trust', wallets.trust)}
          ${walletButton('binance', wallets.binance)}

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

    const wallets = detectWallets();

    const autoWallet = autoConnectIfPossible(wallets);

    /* AUTO CONNECT (single wallet) */

    if (autoWallet) {
      try {
        const result = await connect(autoWallet);
        resolve(result);
        return;
      } catch (error) {
        reject(error);
        return;
      }
    }

    /* CREATE MODAL */

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
        modal.remove();
      }, 150);

    }

    function startLoading(btn) {

      connecting = true;

      walletButtons.forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.5';
      });

      btn.style.opacity = '1';
      btn.innerHTML = `
        <span>⏳</span>
        <span>Connecting...</span>
      `;
    }

    /* CLOSE */

    closeBtn.onclick = () => {
      cleanup();
      reject(new Error('Wallet selection cancelled'));
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanup();
        reject(new Error('Wallet selection cancelled'));
      }
    };

    /* WALLET BUTTONS */

    walletButtons.forEach((btn) => {

      btn.onclick = async () => {

        if (connecting) return;

        const walletType = btn.dataset.wallet;

        try {

          startLoading(btn);

          const result = await connect(walletType);

          cleanup();

          resolve(result);

        } catch (error) {

          console.error('[FourteenWallet] connectModal error', error);

          cleanup();

          reject(error);
        }
      };

    });

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

  });
}
