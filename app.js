/* Soundbite: gravações de ensaio guardadas no Google Drive, organizadas por data.
   - Versão pessoal: só o dono usa a app, com login Google. A pasta fica privada.
   - Permissão drive.file: a app só vê e mexe no que ela própria criou (a pasta "Soundbite – Ensaios").
   - A compressão é feita no próprio aparelho (MP3 com lamejs), antes de enviar. */
(() => {
  'use strict';

  const CFG = window.SOUNDBITE_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const store = {
    get(k) { try { return localStorage.getItem('sb.' + k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem('sb.' + k) : localStorage.setItem('sb.' + k, v); } catch (e) { /* sem armazenamento */ } }
  };

  const DEMO = !!window.SOUNDBITE_FORCE_DEMO || params.has('demo') || !CFG.googleClientId;
  let folderId = store.get('folderId') || '';
  // Nome da banda: guardado na pasta principal do Drive (appProperties) e em cache no telemóvel.
  const bandName = () => store.get('bandName') || CFG.bandName || 'Soundbite';

  const API = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const FOLDER = 'application/vnd.google-apps.folder';
  const AUDIO_EXT = /\.(m4a|mp3|wav|aac|flac|ogg|oga|opus|aif|aiff|caf|webm|mp4|3gp|amr|wma)$/i;

  // Perfis de compressão. MB por hora = kbps × 0,45.
  const PROFILES = {
    leve:     { label: 'Ensaio leve', desc: 'Mono, 64 kbps. Gravações de telemóvel.', channels: 1, kbps: 64 },
    normal:   { label: 'Equilibrado', desc: 'Estéreo, 128 kbps. Bom para quase tudo.', channels: 2, kbps: 128 },
    estudio:  { label: 'Estúdio', desc: 'Estéreo, 256 kbps. Quase igual ao original.', channels: 2, kbps: 256 },
    original: { label: 'Original', desc: 'Envia o ficheiro tal como está.', channels: 0, kbps: 0 }
  };

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDur = (s) => {
    if (!isFinite(s) || s == null) return '';
    s = Math.round(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  };
  const fmtDurLong = (s) => {
    s = Math.round(s || 0);
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? `${h} h ${pad(m)} min` : `${m} min`;
  };
  const nf1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
  const fmtSize = (b) => {
    if (b == null || isNaN(b)) return '';
    b = Number(b);
    return b >= 1e9 ? nf1.format(b / 1e9) + ' GB' : b >= 1e6 ? nf1.format(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';
  };
  const parseLocalDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const dfWeek = new Intl.DateTimeFormat('pt-PT', { weekday: 'short' });
  const dfLong = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dfMonth = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const stripExt = (n) => n.replace(/\.[a-z0-9]{2,5}$/i, '');

  // Tenta encontrar uma data no nome: 2026-11-20, 20261120, 20-11-2026, 20.11.2026
  function dateFromName(name) {
    let m = name.match(/(20\d{2})[-_. ]?(\d{2})[-_. ]?(\d{2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
    m = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2})/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return null;
  }
  const isAudio = (f) => f.mimeType !== FOLDER && ((f.mimeType || '').startsWith('audio/') || AUDIO_EXT.test(f.name));

  // ---------- Estado ----------
  // needLogin: falta entrar com Google; noFolder: ainda não existe a pasta de ensaios.
  const S = { view: store.get('view') === 'songs' ? 'songs' : 'reh', openSongs: new Set(), rehearsals: [], open: new Set(), loading: true, current: null, needLogin: false, noFolder: false };

  // ---------- Google Drive ----------
  async function driveError(res) {
    let msg = `Erro ${res.status}`;
    try { const j = await res.json(); msg = j.error && j.error.message || msg; } catch (e) { /* sem corpo */ }
    const err = new Error(msg); err.status = res.status; return err;
  }

  async function driveGet(path, query) {
    const u = new URL(API + path);
    Object.entries(query || {}).forEach(([k, v]) => u.searchParams.set(k, v));
    const res = await fetch(u, { headers: { Authorization: 'Bearer ' + await token() } });
    if (!res.ok) throw await driveError(res);
    return res.json();
  }

  // Procura a pasta da app no Drive (útil se a app foi aberta noutro browser ou se os dados do browser foram apagados).
  function rootProps(f) { const n = f.appProperties && f.appProperties.bandName; if (n) store.set('bandName', n); }
  async function findRootFolder() {
    if (folderId) {
      try { const f = await driveGet('/files/' + folderId, { fields: 'id,trashed,appProperties' }); if (!f.trashed) { rootProps(f); return folderId; } } catch (e) { if (e.status === 401) throw e; }
    }
    const r = await driveGet('/files', { q: `mimeType = '${FOLDER}' and appProperties has { key='soundbite' and value='root' } and trashed = false`, fields: 'files(id,appProperties)', pageSize: '1' });
    folderId = r.files[0] ? r.files[0].id : '';
    if (r.files[0]) rootProps(r.files[0]);
    store.set('folderId', folderId || null);
    return folderId;
  }

  async function listChildren(parentIds) {
    const out = [];
    for (let i = 0; i < parentIds.length; i += 30) {
      const ids = parentIds.slice(i, i + 30);
      let pageToken = '';
      do {
        const q = { q: `(${ids.map((id) => `'${id}' in parents`).join(' or ')}) and trashed = false`,
          fields: 'nextPageToken, files(id,name,mimeType,size,createdTime,parents,appProperties,webViewLink)',
          pageSize: '1000', orderBy: 'name' };
        if (pageToken) q.pageToken = pageToken;
        const r = await driveGet('/files', q);
        out.push(...r.files);
        pageToken = r.nextPageToken;
      } while (pageToken);
    }
    return out;
  }

  function toTrack(f) {
    const ap = f.appProperties || {};
    return { id: f.id, name: stripExt(f.name), file: f.name, size: f.size ? Number(f.size) : null,
      duration: ap.duration ? Number(ap.duration) : null, profile: ap.profile || null, mime: f.mimeType,
      link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` };
  }

  async function loadFromDrive() {
    const top = await listChildren([folderId]);
    const folders = top.filter((f) => f.mimeType === FOLDER);
    const loose = top.filter(isAudio);
    const inner = folders.length ? await listChildren(folders.map((f) => f.id)) : [];
    const list = folders.map((f) => {
      const date = dateFromName(f.name) || f.createdTime.slice(0, 10);
      const title = f.name.replace(/^\s*\d{4}-\d{2}-\d{2}\s*[·\-–—:|]*\s*/, '').trim() || 'Ensaio';
      const tracks = inner.filter((x) => x.parents && x.parents.includes(f.id) && isAudio(x)).map(toTrack);
      return { id: f.id, date, title, tracks };
    }).filter((r) => r.tracks.length);
    // Ficheiros soltos na pasta principal: agrupados pela data no nome (ou pela data em que foram carregados).
    const byDate = {};
    loose.forEach((f) => {
      const d = (f.appProperties && f.appProperties.recorded) || dateFromName(f.name) || f.createdTime.slice(0, 10);
      (byDate[d] = byDate[d] || []).push(toTrack(f));
    });
    Object.entries(byDate).forEach(([date, tracks]) => list.push({ id: 'loose-' + date, date, title: 'Gravações soltas', tracks, loose: true }));
    return list;
  }

  // Login Google (só para carregar ficheiros)
  let gisPromise = null, accessToken = null, tokenExp = 0, tokenClient = null, userEmail = store.get('email') || '';
  function loadGis() {
    if (!gisPromise) gisPromise = new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => res(); s.onerror = () => { gisPromise = null; rej(new Error('Não foi possível carregar o login da Google. Verifica a ligação à internet.')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }
  const hasToken = () => accessToken && Date.now() < tokenExp - 60000;
  // A sessão (válida ~1 hora) fica guardada neste aparelho para sobreviver a um recarregar da app.
  function saveSession() { store.set('session', accessToken ? JSON.stringify({ t: accessToken, exp: tokenExp }) : null); }
  function clearSession() { accessToken = null; tokenExp = 0; saveSession(); }
  try { const ss = JSON.parse(store.get('session') || 'null'); if (ss && ss.exp > Date.now() + 60000) { accessToken = ss.t; tokenExp = ss.exp; } } catch (e) { /* ignora */ }
  // Tem de ser chamado diretamente num clique (senão o browser bloqueia a janela de login).
  function signIn() {
    return new Promise((res, rej) => {
      if (!(window.google && google.accounts && google.accounts.oauth2)) return rej(new Error('O login da Google ainda está a carregar. Tenta outra vez dentro de um segundo.'));
      if (!CFG.googleClientId) return rej(new Error('Falta o ID de cliente OAuth em config.js (ver GUIA.md).'));
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CFG.googleClientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        callback: async (r) => {
          if (r.error) return rej(new Error('Login cancelado ou recusado.'));
          accessToken = r.access_token; tokenExp = Date.now() + Number(r.expires_in || 3600) * 1000; saveSession();
          try {
            const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + accessToken } }).then((x) => x.json());
            userEmail = me.email || ''; store.set('email', userEmail);
          } catch (e) { /* opcional */ }
          res(accessToken);
        },
        error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'A janela de login foi fechada.' : 'Não foi possível entrar com Google.'))
      });
      tokenClient.requestAccessToken({ prompt: '', login_hint: userEmail || undefined });
    });
  }
  async function token() {
    if (hasToken()) return accessToken;
    const e = new Error('A sessão Google terminou. Carrega em “Entrar com Google” outra vez.'); e.status = 401; throw e;
  }

  async function drivePost(path, body) {
    const res = await fetch(API + path, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw await driveError(res);
    return res.json();
  }

  async function driveUpdate(id, body, query) {
    const q = new URLSearchParams(Object.assign({ fields: 'id,name,parents' }, query || {}));
    const res = await fetch(`${API}/files/${encodeURIComponent(id)}?${q}`, { method: 'PATCH',
      headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw await driveError(res);
    return res.json();
  }
  async function createRootFolder() {
    const f = await drivePost('/files?fields=id', { name: 'Soundbite – Ensaios', mimeType: FOLDER,
      appProperties: { soundbite: 'root' }, description: 'Gravações de ensaio (criado pela app Soundbite).' });
    return f.id;
  }

  async function ensureRehearsalFolder(date, title) {
    const name = `${date} · ${title}`;
    const existing = S.rehearsals.find((r) => !r.loose && r.date === date && r.title.toLowerCase() === title.toLowerCase());
    if (existing) return existing.id;
    const f = await drivePost('/files?fields=id', { name, mimeType: FOLDER, parents: [folderId] });
    return f.id;
  }

  function xhrPut(url, blob, onProgress) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open('PUT', url);
      x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => (x.status >= 200 && x.status < 300) ? res(JSON.parse(x.responseText || '{}')) : rej(new Error(`O envio falhou (erro ${x.status}).`));
      x.onerror = () => rej(new Error('O envio falhou. Verifica a ligação à internet.'));
      x.send(blob);
    });
  }

  async function uploadToDrive(blob, name, parentId, appProperties, onProgress) {
    const meta = { name, parents: [parentId], appProperties };
    const init = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,name,size,parents,appProperties,webViewLink`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'application/octet-stream' },
      body: JSON.stringify(meta)
    });
    if (!init.ok) throw await driveError(init);
    const loc = init.headers.get('Location');
    if (!loc) throw new Error('O Google Drive não devolveu o endereço de envio.');
    return xhrPut(loc, blob, onProgress);
  }

  // ---------- Demonstração ----------
  function demoData() {
    const base = new Date(); base.setHours(12, 0, 0, 0);
    const back = (days) => { const d = new Date(base); d.setDate(d.getDate() - days); return todayISO(d); };
    let n = 0;
    const t = (name, duration, profile, size) => ({ id: 'demo' + (n++), name, duration, profile, size, demo: true });
    return [
      { id: 'r1', date: back(4), title: 'Ensaio', tracks: [t('Aquecimento + afinação', 412, 'leve', 3.3e6), t('Tema novo – ideia do refrão', 268, 'leve', 2.1e6), t('Cais do Sodré (versão lenta)', 331, 'leve', 2.6e6), t('Jam final', 905, 'leve', 7.2e6)] },
      { id: 'r2', date: back(11), title: 'Estúdio – pré-produção', tracks: [t('Cais do Sodré – take 3', 238, 'estudio', 7.6e6), t('Maré Baixa – take 1', 254, 'estudio', 8.1e6), t('Maré Baixa – take 2 (boa)', 249, 'estudio', 8.0e6)] },
      { id: 'r3', date: back(18), title: 'Ensaio', tracks: [t('Ensaio completo', 5420, 'leve', 43.4e6), t('Ideia de baixo do Rui', 96, 'normal', 1.5e6)] },
      { id: 'r4', date: back(39), title: 'Concerto no Musicbox', tracks: [t('Concerto – set completo', 3110, 'normal', 49.8e6)] }
    ];
  }

  let demoLoopUrl = null;
  async function demoLoop() {
    if (demoLoopUrl) return demoLoopUrl;
    const sr = 22050, secs = 16;
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(1, sr * secs, sr);
    const chords = [[220, 277.2, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    chords.forEach((ch, i) => {
      for (let rep = 0; rep < 2; rep++) {
        const t0 = (i * 2 + rep) * 2;
        ch.forEach((f) => {
          const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
          const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.01, t0 + 1.9);
          o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 2);
        });
        for (let b = 0; b < 4; b++) {
          const tb = t0 + b * 0.5;
          const k = ctx.createOscillator(); k.frequency.setValueAtTime(120, tb); k.frequency.exponentialRampToValueAtTime(40, tb + 0.15);
          const kg = ctx.createGain(); kg.gain.setValueAtTime(0.5, tb); kg.gain.exponentialRampToValueAtTime(0.001, tb + 0.2);
          k.connect(kg).connect(ctx.destination); k.start(tb); k.stop(tb + 0.25);
        }
      }
    });
    const buf = await new Promise((res, rej) => { const p = ctx.startRendering(); if (p && p.then) p.then(res, rej); else ctx.oncomplete = (e) => res(e.renderedBuffer); });
    demoLoopUrl = URL.createObjectURL(wavBlob([buf.getChannelData(0)], sr));
    return demoLoopUrl;
  }

  function wavBlob(chs, sr) {
    const n = chs[0].length, nc = chs.length, bytes = n * nc * 2;
    const v = new DataView(new ArrayBuffer(44 + bytes));
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true);
    v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, bytes, true);
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([v], { type: 'audio/wav' });
  }

  // ---------- Lista ----------
  async function load() {
    S.loading = true; render();
    showError('');
    try {
      if (DEMO) S.rehearsals = S.rehearsals.length ? S.rehearsals : demoData();
      else if (!hasToken()) { S.needLogin = true; S.rehearsals = []; }
      else {
        S.needLogin = false;
        await findRootFolder();
        S.noFolder = !folderId;
        S.rehearsals = folderId ? await loadFromDrive() : [];
      }
      S.rehearsals.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
      if (!S.open.size && S.rehearsals[0]) S.open.add(S.rehearsals[0].id);
    } catch (e) {
      if (e.status === 401) { clearSession(); S.needLogin = true; S.rehearsals = []; }
      else showError(e.message);
    }
    S.loading = false; render();
  }

  function showError(msg) { const el = $('#error'); el.textContent = msg; el.hidden = !msg; }

  const shortDate = (iso) => parseLocalDate(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
  function trackRow(r, t, song) {
    const cur = S.current && S.current.track.id;
    return `<li class="track${cur === t.id ? ' playing' : ''}">
                <button class="t-play" data-play="${esc(r.id)}|${esc(t.id)}${song ? '|' + esc(song) : ''}" aria-label="${cur === t.id && !audio.paused ? 'Pausa' : 'Tocar'} ${esc(t.name)}"><svg><use href="#i-${cur === t.id && !audio.paused ? 'pause' : 'play'}"/></svg></button>
                <div class="t-main"><span class="t-name">${song ? esc(`${shortDate(r.date)} · ${r.title}`) : esc(t.name)}</span>
                  <span class="t-meta">${song ? `<span>${esc(t.name)}</span>` : ''}${t.duration ? `<span class="num">${fmtDur(t.duration)}</span>` : ''}${t.size ? `<span class="num">${fmtSize(t.size)}</span>` : ''}${t.profile && PROFILES[t.profile] ? `<span class="badge ${t.profile}">${esc(PROFILES[t.profile].label)}</span>` : ''}${t.saved ? `<span class="badge">${esc(t.saved)}</span>` : ''}</span></div>
                <button class="icon-btn t-edit" data-rename="${esc(r.id)}|${esc(t.id)}" title="Mudar o nome" aria-label="Mudar o nome de ${esc(t.name)}"><svg><use href="#i-edit"/></svg></button>
                ${t.link ? `<a class="icon-btn t-open" href="${esc(t.link)}" target="_blank" rel="noopener" title="Abrir no Google Drive" aria-label="Abrir ${esc(t.name)} no Google Drive"><svg><use href="#i-drive"/></svg></a>` : ''}
              </li>`;
  }

  // ---------- Músicas: a mesma música em ensaios diferentes ----------
  // Junta gravações com o mesmo nome, ignorando maiúsculas, acentos, "(take 2)", "v2", números no fim, etc.
  function songLabel(name) {
    return name.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
      .replace(/[\s\-–—_·,:]*\b(take|tk|versao|versão|v|ver|parte|pt)\s*\.?\s*\d*\s*$/i, '')
      .replace(/[\s\-–—_·#,:]*\d+\s*$/, '')
      .replace(/\s+/g, ' ').trim() || name.trim();
  }
  function songKey(name) {
    return songLabel(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function songGroups() {
    const map = new Map();
    S.rehearsals.forEach((r) => r.tracks.forEach((t) => {
      const k = songKey(t.name); if (!k) return;
      if (!map.has(k)) map.set(k, { key: k, items: [] });
      map.get(k).items.push({ r, t });
    }));
    const list = [...map.values()];
    list.forEach((g) => {
      g.items.sort((a, b) => b.r.date.localeCompare(a.r.date) || a.t.name.localeCompare(b.t.name, 'pt', { numeric: true }));
      g.label = songLabel(g.items[0].t.name); // nome da versão mais recente
    });
    return list.sort((a, b) => a.label.localeCompare(b.label, 'pt', { sensitivity: 'base', numeric: true }));
  }
  function renderSongs(list) {
    list.innerHTML = `<section class="month">${songGroups().map((g) => {
      const open = S.openSongs.has(g.key);
      const n = g.items.length;
      const rehs = new Set(g.items.map((x) => x.r.id)).size;
      return `<article class="reh song${open ? ' open' : ''}">
        <button class="reh-head" data-song-toggle="${esc(g.key)}" aria-expanded="${open}">
          <span class="note"><svg><use href="#i-note"/></svg></span>
          <span class="reh-text"><strong>${esc(g.label)}</strong><span class="muted">${n} ${n === 1 ? 'gravação' : 'gravações'}${rehs > 1 ? ` em ${rehs} ensaios` : ''} · última a ${esc(shortDate(g.items[0].r.date))}</span></span>
          <svg class="chev"><use href="#i-chev"/></svg>
        </button>
        ${open ? `<ol class="tracks">${g.items.map(({ r, t }) => trackRow(r, t, g.key)).join('')}</ol>` : ''}
      </article>`;
    }).join('')}</section>`;
  }

  function render() {
    $('#band-name').textContent = bandName();
    document.title = bandName() === 'Soundbite' ? 'Soundbite' : bandName() + ' · Soundbite';
    $('#demo-banner').hidden = !DEMO;
    $('#btn-upload').hidden = !DEMO && (S.needLogin || S.noFolder);
    const list = $('#list');
    $('#tabs').hidden = true;

    const total = S.rehearsals.reduce((a, r) => a + r.tracks.length, 0);
    $('#summary').textContent = S.loading ? 'A carregar…' : (!DEMO && S.needLogin) ? 'Sem sessão iniciada' : `${S.rehearsals.length} ${S.rehearsals.length === 1 ? 'ensaio' : 'ensaios'} · ${total} ${total === 1 ? 'gravação' : 'gravações'}`;

    if (S.loading && !S.rehearsals.length) { list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>'; return; }
    if (!DEMO && S.needLogin) {
      list.innerHTML = `<div class="empty"><h2>Entra com a tua conta Google</h2><p>As gravações estão numa pasta privada do teu Google Drive.</p><p><button class="btn primary" data-action="login">Entrar com Google</button></p></div>`;
      return;
    }
    if (!DEMO && S.noFolder) {
      list.innerHTML = `<div class="empty"><h2>Ainda não há pasta de ensaios</h2><p>A app cria no teu Drive uma pasta privada chamada “Soundbite – Ensaios”.</p><p><button class="btn primary" data-action="create">Criar a pasta</button></p></div>`;
      return;
    }
    if (!S.rehearsals.length) {
      list.innerHTML = `<div class="empty"><h2>Ainda não há gravações</h2><p>Carrega as primeiras com o botão <strong>Carregar</strong>.</p></div>`;
      return;
    }

    $('#tabs').hidden = false;
    document.querySelectorAll('#tabs [data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === S.view)));
    if (S.view === 'songs') { renderSongs(list); return; }

    const months = [];
    S.rehearsals.forEach((r) => {
      const key = r.date.slice(0, 7);
      let m = months[months.length - 1];
      if (!m || m.key !== key) months.push(m = { key, items: [] });
      m.items.push(r);
    });
    list.innerHTML = months.map((m) => `
      <section class="month">
        <h2>${esc(cap(dfMonth.format(parseLocalDate(m.key + '-01'))))}</h2>
        ${m.items.map((r) => {
          const d = parseLocalDate(r.date);
          const open = S.open.has(r.id);
          const dur = r.tracks.reduce((a, t) => a + (t.duration || 0), 0);
          const meta = [`${r.tracks.length} ${r.tracks.length === 1 ? 'gravação' : 'gravações'}`];
          if (dur) meta.push(fmtDurLong(dur));
          return `<article class="reh${open ? ' open' : ''}" data-reh="${esc(r.id)}">
            <button class="reh-head" data-toggle="${esc(r.id)}" aria-expanded="${open}">
              <span class="cal"><b>${d.getDate()}</b><small>${esc(dfWeek.format(d).replace('.', ''))}</small></span>
              <span class="reh-text"><strong>${esc(r.title)}</strong><span class="muted">${esc(cap(dfLong.format(d)))} · ${meta.join(' · ')}</span></span>
              <svg class="chev"><use href="#i-chev"/></svg>
            </button>
            ${open ? `<ol class="tracks">${r.tracks.map((t) => trackRow(r, t)).join('')}</ol>` : ''}
          </article>`;
        }).join('')}
      </section>`).join('');
  }

  // ---------- Leitor ----------
  const audio = new Audio();
  audio.preload = 'metadata';

  async function play(rehId, trackId, queue) {
    const r = S.rehearsals.find((x) => x.id === rehId); if (!r) return;
    const t = r.tracks.find((x) => x.id === trackId); if (!t) return;
    if (S.current && S.current.track.id === t.id) { audio.paused ? audio.play() : audio.pause(); return; }
    S.current = { reh: r, track: t, queue: queue || null };
    const sub = `${r.title} · ${parseLocalDate(r.date).toLocaleDateString('pt-PT')}`;
    audio.pause(); audio.removeAttribute('src');
    $('#player').hidden = false;
    $('#pl-title').textContent = t.name;
    $('#pl-sub').textContent = sub;
    render();
    let src;
    try { src = t.blobUrl || (t.demo ? await demoLoop() : await fetchAudio(t)); }
    catch (e) {
      if (e.status === 401) { clearSession(); S.needLogin = true; load(); }
      toast(e.message); return;
    }
    if (!S.current || S.current.track !== t) return; // entretanto escolheu outra gravação
    $('#pl-sub').textContent = sub;
    audio.src = src;
    audio.play().catch(() => toast('Toca no botão de play para ouvir.'));
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.name, artist: bandName(), album: `${r.title} · ${r.date}` });
      navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
      navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    }
    render();
  }
  // A pasta é privada, por isso a gravação é descarregada com o teu login antes de tocar.
  // As últimas 4 ficam guardadas em memória para não descarregar outra vez.
  const blobCache = [];
  async function fetchAudio(t) {
    const hit = blobCache.find((x) => x.id === t.id);
    if (hit) return hit.url;
    const res = await fetch(`${API}/files/${t.id}?alt=media`, { headers: { Authorization: 'Bearer ' + await token() } });
    if (!res.ok) throw await driveError(res);
    const total = Number(res.headers.get('Content-Length')) || t.size || 0;
    const parts = [];
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader(); let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); got += value.length;
        if (total && S.current && S.current.track === t) $('#pl-sub').textContent = `A descarregar… ${Math.min(99, Math.round((got / total) * 100))}%`;
      }
    } else parts.push(await res.arrayBuffer());
    const url = URL.createObjectURL(new Blob(parts, { type: t.mime || 'audio/mpeg' }));
    blobCache.push({ id: t.id, url });
    while (blobCache.length > 4) URL.revokeObjectURL(blobCache.shift().url);
    return url;
  }

  function step(dir) {
    if (!S.current) return;
    const { reh, track, queue } = S.current;
    if (queue) { // a ouvir a partir de "Músicas": anterior/seguinte = outras versões da mesma música
      const i = queue.findIndex((x) => x.t === track) + dir;
      if (i >= 0 && i < queue.length) play(queue[i].r.id, queue[i].t.id, queue);
      return;
    }
    const i = reh.tracks.indexOf(track) + dir;
    if (i >= 0 && i < reh.tracks.length) play(reh.id, reh.tracks[i].id);
  }
  function syncPlayer() {
    $('#pl-play use').setAttribute('href', audio.paused ? '#i-play' : '#i-pause');
    $('#pl-play').setAttribute('aria-label', audio.paused ? 'Tocar' : 'Pausa');
    render();
  }
  audio.addEventListener('play', syncPlayer);
  audio.addEventListener('pause', syncPlayer);
  audio.addEventListener('ended', () => step(1));
  let seeking = false;
  audio.addEventListener('timeupdate', () => {
    $('#pl-cur').textContent = fmtDur(audio.currentTime) || '0:00';
    $('#pl-dur').textContent = fmtDur(audio.duration) || '0:00';
    if (!seeking && audio.duration) $('#pl-seek').value = Math.round((audio.currentTime / audio.duration) * 1000);
  });
  audio.addEventListener('error', () => { if (audio.src) toast('Não foi possível tocar esta gravação. Experimenta abri-la no Google Drive.'); });
  $('#pl-seek').addEventListener('input', () => { seeking = true; });
  $('#pl-seek').addEventListener('change', (e) => { if (audio.duration) audio.currentTime = (e.target.value / 1000) * audio.duration; seeking = false; });
  $('#pl-play').addEventListener('click', () => audio.paused ? audio.play() : audio.pause());
  $('#pl-next').addEventListener('click', () => step(1));
  $('#pl-prev').addEventListener('click', () => step(-1));

  $('#list').addEventListener('click', (e) => {
    const st = e.target.closest('[data-song-toggle]');
    if (st) { const k = st.dataset.songToggle; S.openSongs.has(k) ? S.openSongs.delete(k) : S.openSongs.add(k); render(); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) { const id = tg.dataset.toggle; S.open.has(id) ? S.open.delete(id) : S.open.add(id); render(); return; }
    const ac = e.target.closest('[data-action]');
    if (ac && ac.dataset.action === 'login') { signIn().then(() => load()).catch((err) => toast(err.message)); return; }
    if (ac && ac.dataset.action === 'create') { openSetup(); return; }
    const rn = e.target.closest('[data-rename]');
    if (rn) { const [r, t] = rn.dataset.rename.split('|'); openRename(r, t); return; }
    const pl = e.target.closest('[data-play]');
    if (pl) {
      const [r, t, k] = pl.dataset.play.split('|');
      const g = k && songGroups().find((x) => x.key === k);
      play(r, t, g ? g.items : null);
    }
  });

  let toastTimer = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500); }

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    S.view = b.dataset.view; store.set('view', S.view); render(); window.scrollTo(0, 0);
  });
  $('#btn-refresh').addEventListener('click', () => load());

  // ---------- Mudar o nome de uma gravação ----------
  // Muda o nome do ficheiro no Google Drive (mantendo a extensão) e/ou passa-o para outro ensaio.
  const rnDlg = $('#rename');
  let renaming = null;
  const rehLabel = (r) => `${parseLocalDate(r.date).toLocaleDateString('pt-PT')} · ${r.title}`;
  function openRename(rehId, trackId) {
    const r = S.rehearsals.find((x) => x.id === rehId); if (!r) return;
    const t = r.tracks.find((x) => x.id === trackId); if (!t) return;
    renaming = { t, r };
    $('#rn-name').value = t.name;
    const opts = S.rehearsals.filter((x) => !x.loose || x === r);
    $('#rn-reh').innerHTML = opts.map((x) => `<option value="${esc(x.id)}"${x === r ? ' selected' : ''}>${esc(rehLabel(x))}</option>`).join('');
    $('#rn-status').textContent = '';
    $('#rn-go').disabled = false;
    rnDlg.showModal();
  }
  $('#rn-close').addEventListener('click', () => rnDlg.close());
  $('#rn-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!renaming) return;
    const { t, r } = renaming;
    const name = $('#rn-name').value.replace(/[\/\\]/g, '-').replace(/\s+/g, ' ').trim();
    if (!name) { $('#rn-status').textContent = 'Escreve um nome.'; return; }
    const dest = S.rehearsals.find((x) => x.id === $('#rn-reh').value) || r;
    const renamed = name !== t.name, moved = dest !== r;
    if (!renamed && !moved) { rnDlg.close(); return; }
    const ext = ((t.file || '').match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
    $('#rn-go').disabled = true;
    $('#rn-status').textContent = 'A guardar…';
    try {
      if (!DEMO && !t.demo) {
        const body = renamed ? { name: name + ext } : {};
        const query = moved ? { addParents: dest.id, removeParents: r.loose ? folderId : r.id } : {};
        await driveUpdate(t.id, body, query);
        // Se o ensaio antigo ficou vazio, a pasta vai para o lixo do Drive (pode ser recuperada de lá).
        if (moved && !r.loose && r.tracks.length === 1) await driveUpdate(r.id, { trashed: true }).catch(() => {});
      }
      t.name = name; t.file = name + ext;
      if (moved) {
        r.tracks.splice(r.tracks.indexOf(t), 1);
        dest.tracks.push(t);
        dest.tracks.sort((a, b) => a.name.localeCompare(b.name, 'pt', { numeric: true }));
        if (!r.tracks.length) S.rehearsals.splice(S.rehearsals.indexOf(r), 1);
        S.open.add(dest.id);
        if (S.current && S.current.track === t) S.current.reh = dest;
      }
      if (S.current && S.current.track === t) {
        $('#pl-title').textContent = name;
        if ('mediaSession' in navigator && navigator.mediaSession.metadata) navigator.mediaSession.metadata.title = name;
      }
      rnDlg.close();
      render();
      toast(moved ? `Passou para ${rehLabel(dest)}.` : 'Nome mudado.');
    } catch (err) {
      if (err.status === 401) { clearSession(); }
      $('#rn-status').textContent = err.message;
      $('#rn-go').disabled = false;
    }
  });

  // ---------- Nome da banda ----------
  const bandDlg = $('#band');
  $('#band-btn').addEventListener('click', () => {
    $('#band-input').value = bandName();
    $('#band-status').textContent = '';
    $('#band-go').disabled = false;
    bandDlg.showModal();
  });
  $('#band-close').addEventListener('click', () => bandDlg.close());
  $('#band-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#band-input').value.replace(/\s+/g, ' ').trim();
    if (!name) { $('#band-status').textContent = 'Escreve um nome.'; return; }
    if (name === bandName()) { bandDlg.close(); return; }
    $('#band-go').disabled = true;
    $('#band-status').textContent = 'A guardar…';
    try {
      if (!DEMO && folderId && hasToken()) await driveUpdate(folderId, { appProperties: { bandName: name } });
      store.set('bandName', name);
      bandDlg.close();
      render();
      toast('Nome da banda mudado.');
    } catch (err) {
      if (err.status === 401) clearSession();
      $('#band-status').textContent = err.message;
      $('#band-go').disabled = false;
    }
  });

  // ---------- Carregar (upload) ----------
  const up = { files: [], busy: false };
  const dlg = $('#upload');

  function openUpload() {
    if (!DEMO && !folderId) { openSetup(); return; }
    if (!DEMO) loadGis().catch(() => {});
    if (!$('#up-date').value) $('#up-date').value = todayISO();
    suggestTitle();
    renderAccount(); renderProfiles(); renderUpList(); syncGo();
    dlg.showModal();
  }
  $('#btn-upload').addEventListener('click', openUpload);
  $('#up-close').addEventListener('click', () => { if (!up.busy) dlg.close(); else toast('Espera que o envio termine.'); });
  dlg.addEventListener('cancel', (e) => { if (up.busy) e.preventDefault(); });

  function renderAccount() {
    const el = $('#up-account');
    if (DEMO) { el.innerHTML = '<span>Demonstração: os ficheiros são comprimidos aqui, mas não são enviados para o Drive.</span>'; return; }
    el.innerHTML = hasToken()
      ? `<span>Ligado ao Drive${userEmail ? ' como <strong>' + esc(userEmail) + '</strong>' : ''}.</span>`
      : `<span>Para enviar precisas de entrar com a tua conta Google.</span><button id="up-signin" class="btn">Entrar com Google</button>`;
    const b = $('#up-signin');
    if (b) b.addEventListener('click', () => signIn().then(() => { renderAccount(); syncGo(); }).catch((e) => toast(e.message)));
  }

  function totalDuration() { return up.files.reduce((a, f) => a + (f.duration || 0), 0); }
  function totalSize() { return up.files.reduce((a, f) => a + f.file.size, 0); }
  function estimate(key) {
    const p = PROFILES[key];
    if (key === 'original') return up.files.length ? fmtSize(totalSize()) : '';
    const d = totalDuration();
    if (!up.files.length) return `≈ ${nf1.format(p.kbps * 0.45)} MB por hora`;
    if (up.files.some((f) => !f.duration)) return 'tamanho final desconhecido';
    return '≈ ' + fmtSize(d * p.kbps * 125);
  }
  function suggestProfile() {
    if (!up.files.length) return store.get('profile') || 'leve';
    const lossless = up.files.some((f) => /\.(wav|aiff?|flac|caf)$/i.test(f.file.name));
    return lossless ? 'estudio' : (store.get('profile') || 'leve');
  }
  function renderProfiles() {
    const sel = ($('input[name="profile"]:checked') || {}).value || suggestProfile();
    $('#up-profiles').innerHTML = Object.entries(PROFILES).map(([k, p]) => `
      <label class="profile"><input type="radio" name="profile" value="${k}"${k === sel ? ' checked' : ''}>
        <strong>${esc(p.label)}</strong><span>${esc(p.desc)}</span><span class="est">${esc(estimate(k))}</span></label>`).join('');
    updateNote();
  }
  function selectedProfile() { return ($('input[name="profile"]:checked') || {}).value || 'leve'; }
  function updateNote() {
    const key = selectedProfile(), note = $('#up-note');
    let msg = '';
    if (up.files.length && key !== 'original' && up.files.every((f) => f.duration)) {
      const target = totalDuration() * PROFILES[key].kbps * 125;
      const now = totalSize();
      msg = target >= now * 0.9
        ? 'Estes ficheiros já são leves: comprimir quase não poupa espaço. Os que não ficarem mais pequenos são enviados como estão.'
        : `Poupas cerca de ${Math.round((1 - target / now) * 100)}% do espaço (de ${fmtSize(now)} para ${fmtSize(target)}).`;
    }
    if (up.files.some((f) => f.duration > 5400 || f.file.size > 400e6) && key !== 'original')
      msg += (msg ? ' ' : '') + 'Há gravações muito longas: no telemóvel a compressão pode falhar por falta de memória. Se acontecer, faz este envio no computador.';
    note.textContent = msg; note.hidden = !msg;
  }
  $('#up-profiles').addEventListener('change', () => { store.set('profile', selectedProfile()); renderProfiles(); });

  function probeDuration(file) {
    return new Promise((res) => {
      const a = document.createElement('audio'); const u = URL.createObjectURL(file); let done = false;
      const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(u); a.removeAttribute('src'); res(d); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => fin(isFinite(a.duration) ? a.duration : null);
      a.onerror = () => fin(null);
      setTimeout(() => fin(null), 8000);
      a.src = u;
    });
  }

  $('#up-files').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    const fresh = !up.files.length || up.files.every((f) => f.state === 'done');
    if (fresh) up.files = [];
    files.forEach((file) => up.files.push({ file, song: stripExt(file.name), duration: null, state: 'ready', id: Math.random().toString(36).slice(2) }));
    // Data sugerida: a data no nome do ficheiro, ou a data em que o ficheiro foi gravado/modificado.
    if (fresh) {
      const f0 = files[0];
      $('#up-date').value = dateFromName(f0.name) || todayISO(new Date(f0.lastModified || Date.now()));
      suggestTitle();
    }
    renderUpList(); syncGo();
    await Promise.all(up.files.filter((f) => f.duration == null).map(async (f) => { f.duration = await probeDuration(f.file); }));
    renderUpList(); renderProfiles();
  });

  function renderUpList() {
    $('#up-list').innerHTML = up.files.map((f) => `
      <li class="up-item" data-id="${f.id}">
        <input class="song" type="text" data-song="${f.id}" value="${esc(f.song)}" placeholder="Nome da música" aria-label="Nome da música" maxlength="120" autocomplete="off"${f.state === 'ready' || f.state === 'error' ? '' : ' disabled'}>
        <span class="name">${esc(f.file.name)}</span>
        <span class="size num">${f.result ? `${fmtSize(f.file.size)} → <strong>${fmtSize(f.result.size)}</strong>` : `${fmtSize(f.file.size)}${f.duration ? ' · ' + fmtDur(f.duration) : ''}`}</span>
        ${f.state !== 'ready' ? `<div class="bar"><i style="width:${Math.round((f.pct || 0) * 100)}%"></i></div>` : ''}
        ${f.status ? `<span class="status ${f.state === 'done' ? 'ok' : f.state === 'error' ? 'err' : ''}">${esc(f.status)}</span>` : ''}
        ${DEMO && f.state === 'done' && f.track ? `<button class="btn listen" data-listen="${f.id}">Ouvir resultado</button>` : ''}
      </li>`).join('');
  }
  $('#up-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-listen]'); if (!b) return;
    const f = up.files.find((x) => x.id === b.dataset.listen);
    if (f && f.track) { dlg.close(); play(f.reh.id, f.track.id); }
  });

  $('#up-list').addEventListener('input', (e) => {
    const i = e.target.closest('[data-song]'); if (!i) return;
    const f = up.files.find((x) => x.id === i.dataset.song); if (f) f.song = i.value;
  });
  // Se já há um ensaio nesse dia, sugere o mesmo nome, para as músicas novas irem para lá.
  let titleTouched = false;
  function suggestTitle() {
    if (titleTouched) return;
    const r = S.rehearsals.find((x) => !x.loose && x.date === $('#up-date').value);
    $('#up-title').value = r ? r.title : '';
  }
  $('#up-date').addEventListener('change', suggestTitle);
  $('#up-title').addEventListener('input', () => { titleTouched = !!$('#up-title').value; });

  function syncGo() {
    const go = $('#up-go');
    const pending = up.files.filter((f) => f.state === 'ready' || f.state === 'error');
    go.disabled = up.busy || !pending.length || (!DEMO && !hasToken());
    go.textContent = up.busy ? 'A trabalhar…' : selectedProfile() === 'original' ? 'Enviar' : (DEMO ? 'Comprimir' : 'Comprimir e enviar');
  }
  $('#up-profiles').addEventListener('change', syncGo);

  function setItem(f, patch) { Object.assign(f, patch); renderUpList(); }

  async function decode(file) {
    const data = await file.arrayBuffer();
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new Ctx(2, 44100, 44100); // descodifica já a 44,1 kHz
    return new Promise((res, rej) => {
      const p = ctx.decodeAudioData(data, res, () => rej(new Error('Este formato não pode ser lido neste aparelho.')));
      if (p && p.then) p.then(res, () => rej(new Error('Este formato não pode ser lido neste aparelho.')));
    });
  }

  function makeWorker() {
    if (window.SOUNDBITE_WORKER_SRC) return new Worker(URL.createObjectURL(new Blob([window.SOUNDBITE_WORKER_SRC], { type: 'text/javascript' })));
    return new Worker('encoder-worker.js');
  }

  async function compress(file, key, onProgress) {
    const p = PROFILES[key];
    const buf = await decode(file);
    let chans;
    if (p.channels === 1 || buf.numberOfChannels === 1) {
      const n = buf.length, mono = new Float32Array(n);
      const nc = buf.numberOfChannels;
      for (let c = 0; c < nc; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / nc; }
      chans = [mono];
    } else {
      chans = [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()];
    }
    const kbps = chans.length === 1 && p.channels === 2 ? Math.round(p.kbps / 2 / 32) * 32 || 64 : p.kbps;
    return new Promise((res, rej) => {
      const w = makeWorker();
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.pct / 100);
        else if (m.type === 'done') { w.terminate(); res({ blob: m.blob, duration: buf.duration }); }
        else { w.terminate(); rej(new Error('A compressão falhou: ' + m.message)); }
      };
      w.onerror = (e) => { w.terminate(); rej(new Error('A compressão falhou' + (e.message ? ': ' + e.message : '.'))); };
      w.postMessage({ channels: chans, sampleRate: buf.sampleRate, kbps }, chans.map((c) => c.buffer));
    });
  }

  $('#up-go').addEventListener('click', async () => {
    const date = $('#up-date').value;
    const title = ($('#up-title').value || 'Ensaio').trim();
    if (!date) { toast('Escolhe a data do ensaio.'); return; }
    const key = selectedProfile();
    up.busy = true; syncGo();
    let wakeLock = null;
    try { wakeLock = navigator.wakeLock && await navigator.wakeLock.request('screen'); } catch (e) { /* opcional */ }
    let parentId = null, reh = null;
    let ok = 0;
    for (const f of up.files.filter((x) => x.state === 'ready' || x.state === 'error')) {
      try {
        const song = (f.song || '').replace(/[\/\\]/g, '-').replace(/\s+/g, ' ').trim() || stripExt(f.file.name);
        const ext0 = (f.file.name.match(/\.[a-z0-9]{2,5}$/i) || [''])[0];
        let blob = f.file, name = song + ext0, duration = f.duration, used = 'original';
        if (key !== 'original') {
          setItem(f, { state: 'work', pct: 0, status: 'A ler o áudio…' });
          const r = await compress(f.file, key, (p) => setItem(f, { pct: p * (DEMO ? 1 : 0.5), status: `A comprimir… ${Math.round(p * 100)}%` }));
          duration = r.duration;
          if (r.blob.size < f.file.size * 0.95) { blob = r.blob; name = song + '.mp3'; used = key; }
        }
        f.result = blob;
        if (DEMO) {
          reh = reh || findOrMakeDemoReh(date, title);
          const t = { id: 'up' + f.id, name: stripExt(name), duration, size: blob.size, profile: used, blobUrl: URL.createObjectURL(blob), saved: used === 'original' && key !== 'original' ? 'já era leve' : '' };
          reh.tracks.push(t); f.track = t; f.reh = reh;
        } else {
          parentId = parentId || await ensureRehearsalFolder(date, title);
          setItem(f, { state: 'work', status: 'A enviar para o Drive…' });
          const base = key === 'original' ? 0 : 0.5;
          await uploadToDrive(blob, name, parentId, { duration: String(Math.round(duration || 0)), profile: used, originalSize: String(f.file.size) },
            (p) => setItem(f, { pct: base + p * (1 - base), status: `A enviar… ${Math.round(p * 100)}%` }));
        }
        ok++;
        const saved = blob !== f.file ? ` · ${Math.round((1 - blob.size / f.file.size) * 100)}% mais pequeno` : (key !== 'original' ? ' · enviado o original, que já era leve' : '');
        setItem(f, { state: 'done', pct: 1, status: (DEMO ? 'Comprimido' : 'Enviado') + saved });
      } catch (e) {
        setItem(f, { state: 'error', status: e.message || String(e) });
      }
    }
    up.busy = false; syncGo();
    try { wakeLock && wakeLock.release(); } catch (e) { /* ok */ }
    if (ok) {
      titleTouched = false;
      toast(DEMO ? 'Pronto. Podes ouvir o resultado na lista.' : `${ok} ${ok === 1 ? 'gravação enviada' : 'gravações enviadas'}.`);
      if (DEMO) { S.rehearsals.sort((a, b) => b.date.localeCompare(a.date)); S.open.add(reh.id); render(); }
      else { S.open.clear(); await load(); const r = S.rehearsals.find((x) => x.id === parentId); if (r) { S.open.add(r.id); render(); } }
    }
  });

  function findOrMakeDemoReh(date, title) {
    let r = S.rehearsals.find((x) => x.date === date && x.title.toLowerCase() === title.toLowerCase());
    if (!r) { r = { id: 'demo-' + date + title, date, title, tracks: [] }; S.rehearsals.push(r); }
    return r;
  }

  // ---------- Configuração inicial (criar pasta) ----------
  const setupDlg = $('#setup');
  function openSetup() { loadGis().catch((e) => { $('#setup-status').textContent = e.message; }); setupDlg.showModal(); }
  $('#setup-close').addEventListener('click', () => setupDlg.close());
  $('#setup-go').addEventListener('click', async () => {
    const st = $('#setup-status');
    try {
      if (!hasToken()) await signIn();
      st.textContent = 'A criar a pasta…';
      folderId = (await findRootFolder()) || await createRootFolder();
      store.set('folderId', folderId);
      S.noFolder = false;
      st.textContent = '';
      setupDlg.close();
      toast('Pasta criada. Já podes carregar gravações.');
      load();
    } catch (e) { st.textContent = e.message; }
  });

  // ---------- Arranque ----------
  if ('serviceWorker' in navigator && !window.SOUNDBITE_FORCE_DEMO && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
    // Quando uma versão nova da app fica ativa, recarrega uma vez para a usar.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  }
  if (!DEMO) loadGis().catch(() => {}); // prepara o botão "Entrar com Google"
  load();
})();
