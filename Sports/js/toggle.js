window.STL = window.STL || {};

STL.toggle = {

  lineup: function(btn, id) {
    btn.classList.toggle('open');
    btn.nextElementSibling.classList.toggle('open');
    window._lineupOpen[id] = btn.classList.contains('open');
  },

  cap: function(btn, id) {
    btn.classList.toggle('open');
    var panel = btn.nextElementSibling;
    panel.classList.toggle('open');
    window._capOpen = window._capOpen || {};
    var isOpen = btn.classList.contains('open');
    window._capOpen[id] = isOpen;
    if (isOpen && id === 'blues' && panel && !panel.querySelector('iframe')) {
      panel.innerHTML = '<div style="position:relative;width:100%;height:100%;"><iframe height="400" width="100%" style="border-radius:15px;filter:invert(1) hue-rotate(180deg);" frameborder="0" loading="lazy" src="https://puckpedia.com/e/team/st-louis-blues/type2" title="St. Louis Blues Compact Cap Summary"></iframe></div>';
    }
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
