/* Asset loaders accept only this origin and are locked before the first image.
 * Streaming transports and nested workers are disabled. No input is logged. */
(() => {
  let locked = false;
  const startupWatchdog = setTimeout(() => { throw new Error('Local OCR initialization timed out.'); }, 60000);
  self.addEventListener('error', () => self.close());
  const nativePostMessage = self.postMessage.bind(self);
  self.postMessage = (packet, ...args) => {
    nativePostMessage(packet, ...args);
    if (packet?.action === 'setParameters' && packet.status === 'resolve') clearTimeout(startupWatchdog);
    // Tesseract's createWorker can leave initialization failures pending.
    // The main reader rejects that initialization; this closes its native worker.
    if (packet?.status === 'reject') { clearTimeout(startupWatchdog); self.close(); }
  };
  const nativeFetch = self.fetch.bind(self);
  self.fetch = (input, options) => {
    const target = new URL(typeof input === 'string' ? input : input.url || input.href, self.location.href);
    if (locked || target.origin !== self.location.origin) {
      return Promise.reject(new Error('The local OCR worker cannot use the network while reading.'));
    }
    return nativeFetch(input, options);
  };
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    const target = new URL(url, self.location.href);
    if (locked || target.origin !== self.location.origin) {
      throw new Error('The local OCR worker cannot use the network while reading.');
    }
    return nativeOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (locked) throw new Error('The local OCR worker cannot use the network while reading.');
    return nativeSend.apply(this, args);
  };
  const nativeImportScripts = self.importScripts.bind(self);
  self.importScripts = (...urls) => {
    if (locked || urls.some((url) => new URL(url, self.location.href).origin !== self.location.origin)) {
      throw new Error('The local OCR worker cannot load additional scripts while reading.');
    }
    return nativeImportScripts(...urls);
  };
  for (const name of ['WebSocket', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'Worker', 'SharedWorker']) {
    if (name in self) self[name] = class { constructor() { throw new Error('This transport is disabled in the local OCR worker.'); } };
  }
  self.addEventListener('message', (event) => {
    if (event.data?.action === 'recognize') locked = true;
  });
  importScripts(new URL('./worker.min.js', self.location.href).href);
})();
