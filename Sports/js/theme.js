/* Shared light/dark theme controller. Loaded first in <body> on every page so
   the saved (or OS-preferred) theme applies before first paint.
   - Persists in localStorage under 'stl-theme' (never renamed: user pref).
   - Any `<button data-theme-toggle>` on the page becomes a toggle.
   - Fires a document 'stl:theme' event on change (stats chart redraws on it).
   Usage: window.STL_THEME.get() -> 'light' | 'dark'
          window.STL_THEME.set('dark') */

(function() {
  var KEY = 'stl-theme';

  function preferred() {
    try {
      var s = localStorage.getItem(KEY);
      if (s === 'light' || s === 'dark') return s;
    } catch (e) {}
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }

  function label(t) {
    return t === 'dark' ? 'Dark mode: on' : 'Dark mode: off';
  }

  function syncButtons(t) {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].textContent = label(t);
      btns[i].setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    }
  }

  function syncThemeColor(t) {
    var color = t === 'dark' ? '#171114' : '#f4ecdd';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = color;
  }

  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
    syncThemeColor(t);
    syncButtons(t);
  }

  window.STL_THEME = {
    get: function() {
      return document.documentElement.getAttribute('data-theme') || 'light';
    },
    set: function(t) {
      if (t !== 'light' && t !== 'dark') return;
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t);
      try { window.dispatchEvent(new Event('stl:theme')); } catch (e) {}
    }
  };

  function wireNav() {
    var nav = document.getElementById('sitenav');
    var btn = document.querySelector('.menu-btn');
    if (!nav || !btn || nav._stlNavWired) return;
    nav._stlNavWired = true;

    function syncExpanded() {
      btn.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    }

    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncExpanded).observe(nav, { attributes: true, attributeFilter: ['class'] });
    }
    syncExpanded();

    document.addEventListener('click', function(e) {
      if (!nav.classList.contains('open')) return;
      var t = e.target;
      if (btn.contains(t)) return;
      if (nav.contains(t)) {
        if (t.closest && t.closest('a')) nav.classList.remove('open');
        return;
      }
      nav.classList.remove('open');
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
      }
    });
  }

  function wire() {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i]._stlWired) continue;
      btns[i]._stlWired = true;
      btns[i].addEventListener('click', function() {
        window.STL_THEME.set(window.STL_THEME.get() === 'dark' ? 'light' : 'dark');
      });
    }
    syncButtons(window.STL_THEME.get());
    wireNav();
  }

  apply(preferred());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
