const listeners = new Map();

export function on(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }

  listeners.get(eventName).add(callback);

  return () => off(eventName, callback);
}

export function off(eventName, callback) {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners) return;
  eventListeners.delete(callback);
}

export function emit(eventName, payload) {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners) return;

  for (const callback of eventListeners) {
    try {
      callback(payload);
    } catch (error) {
      console.error(`[FourteenWallet] Event listener error for "${eventName}"`, error);
    }
  }
}

export function clearAllListeners() {
  listeners.clear();
}
