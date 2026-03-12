export function shortenAddress(address, start = 6, end = 4) {
  if (!address || typeof address !== 'string') return null;
  if (address.length <= start + end) return address;

  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

export function isTronAddress(address) {
  return typeof address === 'string' && /^T[a-zA-Z0-9]{33}$/.test(address);
}
