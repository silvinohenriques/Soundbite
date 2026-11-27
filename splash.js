// Ecrã de carregamento: a pinta vermelha entra pela esquerda, salta de letra em letra e pousa no i.
// Depois o ecrã desaparece. Corre logo no início do <body>, antes da app.
(function () {
  var splash = document.getElementById('splash');
  if (!splash) return;
  var wm = splash.querySelector('.sp-wm');
  var dot = wm.querySelector('.dot');
  var letters = Array.prototype.slice.call(wm.querySelectorAll('.l'));
  var asc = { d: 1, b: 1, t: 1 };
  var X_TOP = 0.215, A_TOP = 0.09, I_DOT = 0.095; // em, a partir do topo da palavra
  var HOP_MS = 300, HOLD_MS = 450, done = false;

  function hide() {
    if (done) return;
    done = true;
    splash.classList.add('out');
    setTimeout(function () { splash.remove(); }, 500);
  }
  setTimeout(hide, 6000); // nunca fica preso

  function pos(el, final) {
    var fs = parseFloat(getComputedStyle(wm).fontSize), r = fs * 0.125;
    var cx = el.offsetLeft + el.offsetWidth / 2;
    var cy = final ? I_DOT * fs : (asc[el.textContent] ? A_TOP : X_TOP) * fs - r;
    return { x: cx - r, y: cy - r, fs: fs };
  }
  function tf(p, sx, sy) { return 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) scale(' + (sx || 1) + ',' + (sy || 1) + ')'; }

  function start() {
    wm.classList.add('ready');
    var iIdx = letters.findIndex(function (l) { return l.classList.contains('li'); });
    var path = letters.slice(0, iIdx + 1).map(function (l, k) { return pos(l, k === iIdx); });
    var end = path[path.length - 1];
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !dot.animate) {
      dot.style.transform = tf(end); dot.style.opacity = 1;
      setTimeout(hide, 700);
      return;
    }
    var fs = path[0].fs, hops = path.length, seg = 1 / hops, frames = [];
    var from = { x: path[0].x - fs * 0.6, y: -fs * 1.4 };
    frames.push({ offset: 0, transform: tf(from), opacity: 0, easing: 'ease-in' });
    frames.push({ offset: seg * 0.15, opacity: 1, transform: tf({ x: from.x + (path[0].x - from.x) * 0.3, y: from.y + fs * 0.2 }), easing: 'ease-in' });
    var prev = from;
    path.forEach(function (p, k) {
      var land = seg * (k + 1), last = k === hops - 1;
      if (k > 0) frames.push({ offset: seg * k + seg * 0.5, transform: tf({ x: (prev.x + p.x) / 2, y: Math.min(prev.y, p.y) - fs * 0.5 }), opacity: 1, easing: 'ease-in' });
      frames.push({ offset: land - (last ? seg * 0.25 : 0.0001), transform: tf(p, 1.3, 0.7), opacity: 1, easing: 'ease-out' });
      if (last) frames.push({ offset: 1, transform: tf(p), opacity: 1 });
      else frames.push({ offset: land, transform: tf(p, 1.15, 0.85), opacity: 1, easing: 'ease-out' });
      prev = p;
    });
    var anim = dot.animate(frames, { duration: hops * HOP_MS, fill: 'forwards' });
    anim.onfinish = function () { setTimeout(hide, HOLD_MS); };
  }

  // Espera pela letra certa (no máximo 1 s) para as posições baterem certo.
  var started = false;
  function go() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('800 1.6rem "Bricolage Grotesque"', 'soundbıte').then(go, go);
    setTimeout(go, 1000);
  } else {
    go();
  }
})();
