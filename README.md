# 4TEEN Unified

Single repository for the 4TEEN frontend library stack:

- wallet connection core
- wallet adapters
- reusable widgets
- one Vite build pipeline
- one public package entry

This repo replaces the old split setup where wallet logic and widgets lived in separate repositories.

## What is included

- `src/adapters/*` — TronLink, OKX, Binance Web3, Trust Wallet adapters
- `src/core/*` — state, events, wallet manager, wallet controller, auto-connect
- `src/ui/*` — connect modal
- `src/utils/*` — shared TRON helpers
- `src/widgets/buy/*` — direct buy widget
- `src/widgets/liquidity/*` — liquidity controller widget
- `src/widgets/timeline/*` — unlock timeline widget

## Final structure

```text
src/
  adapters/
    binance.js
    okx.js
    tronlink.js
    trust.js
  core/
    autoWallet.js
    events.js
    state.js
    walletController.js
    walletManager.js
  ui/
    connectModal.css
    connectModal.js
  utils/
    address.js
    detectTronProvider.js
    tron.js
  widgets/
    buy/
      directBuy.css
      directBuy.js
      index.js
    liquidity/
      index.js
      liquidityController.css
      liquidityController.js
    timeline/
      index.js
      unlockTimeline.css
      unlockTimeline.js
  index.js
vite.config.js
package.json
```

## Public API

### Wallet API

- `connect`
- `disconnect`
- `autoConnect`
- `getAddress`
- `getShortAddress`
- `getTronWeb`
- `getProvider`
- `isConnected`
- `isReady`
- `getBalanceTRX`
- `detectWallets`
- `getWalletState`
- `on`
- `off`
- `openConnectModal`

### Widget API

- `mountDirectBuy`
- `mountUnlockTimeline`
- `mountLiquidityController`

## Browser globals kept for compatibility

- `window.FourteenWallet`
- `window.FourteenWidgets`
- `window.FourteenUnified`

This means existing pages can keep using the old global names after the unified build is attached.

## Build

```bash
npm install
npm run build
```

GitHub Actions is included. After pushing to `main`, the workflow builds the library and commits the generated `dist/` files automatically.

## Important fix already included

The merged widgets source had one broken import path after moving files into the new unified structure.
It is already fixed in this repo:

- `src/widgets/buy/directBuy.js`
  - from `../core/walletController`
  - to `../../core/walletController.js`

Without this fix, the unified repository would fail during build.
