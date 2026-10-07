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

  function apply(t) {
    document.documentElement.setAttribute('data-theme', t);
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
  }

  apply(preferred());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
