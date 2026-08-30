// route.js — Cakra shared routing helper
// Tujuannya: URL bersih tanpa ekstensi (.html) di Vercel/static host,
// sambil tetap bisa dibuka langsung via file:// (double-click) saat development.
// Di Vercel: rewrite pada vercel.json memetakan /dashboard -> /dashboard.html.
// Di file://: skrip ini mengubah href bersih kembali ke .html agar tetap jalan.
(function () {
  'use strict';

  var KNOWN = ['', 'index', 'dashboard', 'predict', 'compare', 'docs', 'about'];

  function toFile(path) {
    if (path === '/' || path === '' || path === 'index') return 'index.html';
    if (path.charAt(0) === '/') path = path.slice(1);
    return path + '.html';
  }

  window.CakraNav = {
    go: function (path) {
      if (location.protocol === 'file:') path = toFile(path);
      location.href = path;
    }
  };

  if (location.protocol !== 'file:') return;

  function patch() {
    document.querySelectorAll('a[href]').forEach(function (a) {
      var h = a.getAttribute('href');
      if (!h || h.charAt(0) !== '/') return;
      var name = h.slice(1);
      if (KNOWN.indexOf(name) >= 0) a.setAttribute('href', toFile(h));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch);
  else patch();
})();
