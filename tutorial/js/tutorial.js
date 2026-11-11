/*
 * tutorial.js: small helpers for the CART tutorial page. No libraries, no network.
 *   1. Builds the table of contents in the left rail from the page headings
 *      (part banners, numbered sections, and their subsections).
 *   2. Highlights the section you are reading, and fills the reading-progress bar.
 *   3. Numbers the figures ("Figure 1", "Figure 2", ...).
 *   4. Tabsets (e.g. Windows / macOS).
 *   5. Click a screenshot to see it full size.
 *   6. "Back to top" button and the menu button on narrow screens.
 */
(function () {
  'use strict';

  // ---------- 1. Table of contents ----------
  var toc = document.getElementById('toc');
  var root = document.createElement('ol');
  var currentList = root;   // where sections are added (changes at each part)
  var lastSectionItem = null;
  var links = [];           // [{link, target}]

  var heads = document.querySelectorAll('.part, h2.sec, h3.sub');
  heads.forEach(function (h) {
    if (h.classList.contains('part')) {
      var p = document.createElement('li');
      p.className = 'toc-part';
      p.textContent = h.getAttribute('data-toc') || '';
      root.appendChild(p);
      lastSectionItem = null;
      return;
    }
    var num = h.querySelector('.secnum');
    var label = h.getAttribute('data-toc') || textWithout(h, ['.secnum', '.badge']);
    var a = document.createElement('a');
    a.href = '#' + h.id;
    a.innerHTML = '<span class="num"></span><span></span>';
    a.firstChild.textContent = num ? num.textContent : '';
    a.lastChild.textContent = label;
    var li = document.createElement('li');
    li.appendChild(a);
    if (h.tagName === 'H2' || !lastSectionItem) {
      root.appendChild(li);
      lastSectionItem = li;
    } else {
      var sub = lastSectionItem.querySelector('ol');
      if (!sub) { sub = document.createElement('ol'); lastSectionItem.appendChild(sub); }
      sub.appendChild(li);
    }
    links.push({ link: a, target: h, item: li, top: h.tagName === 'H2' ? li : lastSectionItem });
  });
  toc.appendChild(root);

  function textWithout(el, selectors) {
    var copy = el.cloneNode(true);
    selectors.forEach(function (s) { copy.querySelectorAll(s).forEach(function (n) { n.remove(); }); });
    return copy.textContent.trim();
  }

  // ---------- 2. Current section and progress ----------
  var bar = document.querySelector('.progress > span');
  var backTop = document.querySelector('.back-top');
  function onScroll() {
    var y = window.scrollY + 120;
    var current = null;
    for (var i = 0; i < links.length; i++) {
      if (links[i].target.offsetTop <= y) current = links[i]; else break;
    }
    links.forEach(function (l) {
      l.link.classList.toggle('active', l === current);
    });
    root.querySelectorAll('li.open').forEach(function (li) { li.classList.remove('open'); });
    if (current) {
      current.top.classList.add('open');
      // Also mark the parent section active when a subsection is current
      var parentLink = current.top.querySelector(':scope > a');
      if (parentLink && parentLink !== current.link) parentLink.classList.add('active');
    }
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
    if (backTop) backTop.classList.toggle('show', window.scrollY > 800);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // Keep the active TOC entry in view inside the rail
  var lastActive = null;
  setInterval(function () {
    var all = toc.querySelectorAll('a.active');
    var a = all.length ? all[all.length - 1] : null;
    if (a && a !== lastActive) {
      lastActive = a;
      var rail = document.querySelector('.rail');
      var r = a.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      if (r.top < rr.top + 80 || r.bottom > rr.bottom - 80) a.scrollIntoView({ block: 'nearest' });
    }
  }, 400);

  // ---------- 3. Figure numbers ----------
  var n = 0;
  document.querySelectorAll('figure figcaption').forEach(function (cap) {
    n += 1;
    var s = document.createElement('span');
    s.className = 'fignum';
    s.textContent = 'Figure ' + n + '. ';
    cap.insertBefore(s, cap.firstChild);
  });

  // ---------- 4. Tabsets ----------
  document.querySelectorAll('.tabset').forEach(function (set, si) {
    var tabs = set.querySelectorAll('[role="tab"]');
    var panels = set.querySelectorAll('[role="tabpanel"]');
    tabs.forEach(function (tab, i) {
      tab.id = 'tab-' + si + '-' + i;
      panels[i].id = 'panel-' + si + '-' + i;
      tab.setAttribute('aria-controls', panels[i].id);
      panels[i].setAttribute('aria-labelledby', tab.id);
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { select((i + 1) % tabs.length); tabs[(i + 1) % tabs.length].focus(); }
        if (e.key === 'ArrowLeft') { select((i - 1 + tabs.length) % tabs.length); tabs[(i - 1 + tabs.length) % tabs.length].focus(); }
      });
    });
    function select(k) {
      tabs.forEach(function (t, j) {
        t.setAttribute('aria-selected', j === k ? 'true' : 'false');
        t.tabIndex = j === k ? 0 : -1;
        panels[j].hidden = j !== k;
      });
    }
    // Start on the reader's own system when we can tell (macOS or Windows)
    var start = 0;
    var mac = /Mac/i.test(navigator.platform || navigator.userAgent);
    tabs.forEach(function (t, j) { if (mac && /mac/i.test(t.textContent)) start = j; });
    select(start);
  });

  // ---------- 5. Lightbox ----------
  var lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-label', 'Screenshot, full size');
  lb.innerHTML = '<img alt=""><div class="lb-cap"></div>';
  document.body.appendChild(lb);
  document.querySelectorAll('figure .shot').forEach(function (img) {
    img.tabIndex = 0;
    img.title = 'Click to enlarge';
    function open() {
      lb.querySelector('img').src = img.src;
      lb.querySelector('img').alt = img.alt;
      var cap = img.closest('figure').querySelector('figcaption');
      lb.querySelector('.lb-cap').textContent = cap ? cap.textContent : '';
      lb.classList.add('open');
    }
    img.addEventListener('click', open);
    img.addEventListener('keydown', function (e) { if (e.key === 'Enter') open(); });
  });
  lb.addEventListener('click', function () { lb.classList.remove('open'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.classList.remove('open'); });

  // ---------- 6. Back to top, and the narrow-screen menu ----------
  if (backTop) backTop.addEventListener('click', function () { window.scrollTo({ top: 0 }); });
  var rail = document.querySelector('.rail');
  var menu = document.querySelector('.menu-btn');
  if (menu) {
    menu.addEventListener('click', function () {
      var open = rail.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.textContent = open ? 'Close' : 'Contents';
    });
    toc.addEventListener('click', function (e) {
      if (e.target.closest('a') && rail.classList.contains('open')) menu.click();
    });
  }
})();
