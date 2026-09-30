window.STL = window.STL || {};

STL.toggle = {

  lineup: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._lineupOpen[id] = btn.classList.contains('open');
  },

  cap: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._capOpen = window._capOpen || {};
    window._capOpen[id] = btn.classList.contains('open');
  },

  aff: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._affOpen = window._affOpen || {};
    window._affOpen[id] = btn.classList.contains('open');
    if (btn.classList.contains('open') && window.STL && STL.api && STL.api.fetchAffiliates) {
      STL.api.fetchAffiliates(id);
    }
  }
};
