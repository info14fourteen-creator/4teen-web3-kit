function isMobile() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|Android/i.test(navigator.userAgent)
}

const LINKS = {

  tronlink: {
    install: "https://www.tronlink.org/",
    mobile: "tronlink://"
  },

  okx: {
    install: "https://www.okx.com/web3",
    mobile: "okx://wallet/dapp"
  },

  binance: {
    install: "https://www.binance.com/en/web3wallet",
    mobile: "bnc://app.binance.com"
  },

  trust: {
    install: "https://trustwallet.com/",
    mobile: (url) =>
      `https://link.trustwallet.com/open_url?url=${encodeURIComponent(url)}`
  }

}

export function openWalletApp(type) {

  const link = LINKS[type]
  if (!link) return

  if (!isMobile()) {
    window.open(link.install, "_blank")
    return
  }

  if (type === "trust") {
    const url = window.location.href
    window.location.href = link.mobile(url)
    return
  }

  window.location.href = link.mobile
}

export function openInstallPage(type) {

  const link = LINKS[type]
  if (!link) return

  window.open(link.install, "_blank")
}
