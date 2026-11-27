// Converte áudio (PCM) em MP3 fora da janela principal, para a app não bloquear.
if (typeof lamejs === 'undefined') importScripts('vendor/lame.min.js');

onmessage = (e) => {
  try {
    const { channels, sampleRate, kbps } = e.data;
    const nch = channels.length;
    const enc = new lamejs.Mp3Encoder(nch, sampleRate, kbps);
    const total = channels[0].length;
    const BLOCK = 1152 * 32;
    const L = new Int16Array(BLOCK);
    const R = nch > 1 ? new Int16Array(BLOCK) : null;
    const parts = [];
    let lastPct = -1;

    const toInt16 = (src, dst, start, n) => {
      for (let i = 0; i < n; i++) {
        let s = src[start + i];
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        dst[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    };

    for (let i = 0; i < total; i += BLOCK) {
      const n = Math.min(BLOCK, total - i);
      toInt16(channels[0], L, i, n);
      if (R) toInt16(channels[1], R, i, n);
      const out = R ? enc.encodeBuffer(L.subarray(0, n), R.subarray(0, n)) : enc.encodeBuffer(L.subarray(0, n));
      if (out.length) parts.push(new Uint8Array(out.buffer, out.byteOffset, out.length).slice());
      const pct = Math.floor(((i + n) / total) * 100);
      if (pct !== lastPct) { lastPct = pct; postMessage({ type: 'progress', pct }); }
    }
    const end = enc.flush();
    if (end.length) parts.push(new Uint8Array(end.buffer, end.byteOffset, end.length).slice());
    postMessage({ type: 'done', blob: new Blob(parts, { type: 'audio/mpeg' }) });
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
