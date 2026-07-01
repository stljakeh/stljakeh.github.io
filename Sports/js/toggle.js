window.STL = window.STL || {};

STL.toggle = {

  lineup: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._lineupOpen[id] = btn.classList.contains('open');
  },

  leaders: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._leadersOpen = window._leadersOpen || {};
    window._leadersOpen[id] = btn.classList.contains('open');
  },

  cap: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._capOpen = window._capOpen || {};
    window._capOpen[id] = btn.classList.contains('open');
  }
};
