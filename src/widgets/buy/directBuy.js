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
    ? `${safeMessage}<br><a href="https://tronscan.org/#/transaction/${txid}" target="_blank" rel="noopener noreferrer" style="color:#ff8a3d; text-decoration:underline;">${txid}</a>`
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
  return '';
}

function normalizeError(error) {
  const text = String(
    error?.message ||
    error?.error ||
    error?.data?.message ||
    'Unknown error'
  );

  if (text.includes('rejected') || text.includes('denied')) {
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
    ACTIVE_INSTANCES.get(rootId).destroy();
  }

  const wallet = window.FourteenWallet;

  root.innerHTML = `
  <div class="fourteen-buy-widget">
    <div class="fourteen-buy-header">
      <div class="fourteen-buy-label">Amount of TRX:</div>

      <div class="fourteen-buy-balance-wrap">
        <div class="fourteen-buy-balance">0.000000 TRX</div>
        <button class="fourteen-buy-refresh">↻</button>
      </div>
    </div>

    <label class="fourteen-buy-input-label">${inputLabel}</label>

    <input class="fourteen-buy-input" type="number" disabled step="0.000001"/>

    <button class="fourteen-buy-button">${buttonConnectText}</button>

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

  function setStatus(msg='',err=false){
    statusEl.textContent=msg;
    statusEl.classList.toggle('error',err);
  }

  function getMaxAllowed(){
    return Math.max(0,walletBalance-reserveTRX);
  }

  async function getBalance(){
    const tronWeb=wallet.getTronWeb();
    const addr=tronWeb.defaultAddress.base58;
    const sun=await tronWeb.trx.getBalance(addr);

    walletBalance=sun/1e6;
    balanceEl.textContent=`${walletBalance.toFixed(6)} TRX`;
  }

  async function connectWallet(){

    setStatus('Connecting wallet...');

    await wallet.connect();

    const tronWeb=wallet.getTronWeb();

    if(!tronWeb?.defaultAddress?.base58){
      throw new Error('Wallet not ready');
    }

    contract=await tronWeb.contract().at(contractAddress);

    connected=true;

    await getBalance();

    inputEl.disabled=false;
    buttonEl.textContent=buttonBuyText;
    buttonEl.classList.add('connected');

    setStatus('');
  }

  async function buy(){

    if(isSubmitting) return;

    try{

      const amount=parseFloat(inputEl.value);

      if(!amount||amount<=0){
        setStatus('Enter valid TRX amount',true);
        return;
      }

      const max=getMaxAllowed();

      if(amount>max){
        setStatus(`Max allowed ${max.toFixed(6)} TRX`,true);
        return;
      }

      const valueSun=Math.round(amount*1e6);

      isSubmitting=true;

      setStatus('Waiting wallet confirmation...');

      const result=await contract.buyTokens().send({
        callValue:valueSun
      });

      const txid=extractTxid(result);

      createBottomNotice('Transaction sent',txid,false);

      inputEl.value='';

      await sleep(2000);
      await getBalance();

      setStatus('');

    }catch(err){

      const msg=normalizeError(err);

      setStatus(msg,true);
      createBottomNotice(msg,'',true);

    }finally{
      isSubmitting=false;
    }

  }

  buttonEl.addEventListener('click',async()=>{
    if(!connected){
      await connectWallet();
    }else{
      await buy();
    }
  });

  refreshBtn.addEventListener('click',async()=>{
    if(connected) await getBalance();
  });

  function destroy(){}

  ACTIVE_INSTANCES.set(rootId,{destroy});

  return{destroy};
}
