/*
 * form.js: the CAPE-Vr form and the app's main controller (New / Load /
 * Save, progress bar).
 *
 * Each control in index.html has a data-path naming the session field it
 * edits (e.g. "vas.roughness"); the session object is the only state.
 */
(function () {
  'use strict';

  var S = window.CapeSession;

  var session = S.createBlankSession();
  var dirty = false;
  var lastFileName = '';

  // ---------------------------------------------------------------------
  // Saved / unsaved status
  // ---------------------------------------------------------------------

  function markDirty() {
    var wasDirty = dirty;
    dirty = true;
    renderStatus();
    if (!wasDirty) { renderSteps(); }
  }

  function announceChange(path) {
    document.dispatchEvent(new CustomEvent('cape:changed', { detail: { path: path } }));
  }

  // Shown as a dot on the Save button, with the details in its tooltip.
  // The hidden #save-status line repeats it for screen readers.
  function renderStatus() {
    var btn = document.getElementById('btn-save');
    var state = '', tip;
    if (dirty) {
      state = 'is-dirty';
      tip = 'Unsaved changes';
    } else if (session.savedAt) {
      state = 'is-saved';
      tip = 'Saved ' + S.formatTime(session.savedAt) + (lastFileName ? ' (' + lastFileName + ')' : '');
    } else if (lastFileName) {
      state = 'is-saved';
      tip = 'Loaded ' + lastFileName;
    } else {
      tip = 'New session, not saved yet';
    }
    btn.classList.remove('is-dirty', 'is-saved');
    if (state) { btn.classList.add(state); }
    btn.title = tip;
    document.getElementById('save-status').textContent = tip;
  }

  // Sessions exist only in downloaded files, so closing the tab loses edits.
  window.addEventListener('beforeunload', function (e) {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ---------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------

  function showMessage(kind, title, lines) {
    var box = document.getElementById('messages');
    var div = document.createElement('div');
    div.className = 'message ' + kind;
    var h = document.createElement('strong');
    h.textContent = title;
    div.appendChild(h);
    (lines || []).forEach(function (line) {
      var p = document.createElement('p');
      p.textContent = line;
      div.appendChild(p);
    });
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'message-close';
    close.textContent = 'Dismiss';
    close.addEventListener('click', function () { div.remove(); });
    div.appendChild(close);
    box.appendChild(div);
  }

  function clearMessages() {
    document.getElementById('messages').innerHTML = '';
  }

  // ---------------------------------------------------------------------
  // Option buttons (single choice or multiple choice)
  // ---------------------------------------------------------------------

  // Single choice: clicking the chosen option again clears it (back to "not
  // answered"), except in data-required groups for settings that must have
  // a value. data-collapse-after="N" hides options after the Nth behind
  // "More…".
  function buildChoice(group) {
    var path = group.dataset.path;
    var single = group.dataset.mode === 'single';
    var required = group.hasAttribute('data-required');
    var options = S.OPTIONS[group.dataset.options];
    var collapseAfter = Number(group.dataset.collapseAfter || 0);
    group.setAttribute('role', 'group');

    options.forEach(function (opt, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option';
      if (collapseAfter && index >= collapseAfter) { btn.classList.add('extra-option'); }
      btn.dataset.value = opt[0];
      btn.textContent = opt[1];
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', function () {
        if (single) {
          var current = S.getPath(session, path);
          if (current === opt[0] && required) { return; }
          S.setPath(session, path, current === opt[0] ? null : opt[0]);
        } else {
          var chosen = (S.getPath(session, path) || []).slice();
          var i = chosen.indexOf(opt[0]);
          if (i === -1) { chosen.push(opt[0]); } else { chosen.splice(i, 1); }
          // Store in form order, not click order, so files are stable.
          chosen = options.map(function (o) { return o[0]; })
            .filter(function (id) { return chosen.indexOf(id) !== -1; });
          S.setPath(session, path, chosen);
        }
        renderChoice(group);
        markDirty();
        announceChange(path);
      });
      group.appendChild(btn);
    });

    if (collapseAfter && options.length > collapseAfter) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'more-options';
      more.textContent = 'More options…';
      more.addEventListener('click', function () {
        group.classList.toggle('show-extra');
        more.textContent = group.classList.contains('show-extra') ? 'Fewer options' : 'More options…';
      });
      group.appendChild(more);
    }
  }

  function renderChoice(group) {
    var value = S.getPath(session, group.dataset.path);
    var chosen = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
    Array.prototype.forEach.call(group.querySelectorAll('.option'), function (btn) {
      btn.setAttribute('aria-pressed', chosen.indexOf(btn.dataset.value) !== -1 ? 'true' : 'false');
    });
    // Never hide a chosen answer behind "More…".
    if (group.querySelector('.extra-option[aria-pressed="true"]')) {
      group.classList.add('show-extra');
      var more = group.querySelector('.more-options');
      if (more) { more.textContent = 'Fewer options'; }
    }
  }

  // ---------------------------------------------------------------------
  // Visual analog scales
  // ---------------------------------------------------------------------

  // Plain line, direction-only labels, no severity bands. Value is an
  // integer 0-100, or null when not rated (never 0, which is a real rating).
  // access = { get, set } for scales that are not a plain data-path (the
  // added attributes); by default the host's data-path is used.
  function buildVas(host, access, changePath) {
    var path = host.dataset.path;
    var label = host.dataset.label;
    access = access || {
      get: function () { return S.getPath(session, path); },
      set: function (v) { S.setPath(session, path, v); }
    };
    changePath = changePath || path;

    host.innerHTML =
      '<div class="vas-track" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="vas-line"><div class="vas-mark" hidden></div></div>' +
      '</div>' +
      '<span class="vas-score"><input type="number" class="vas-number" min="0" max="100" step="1" inputmode="numeric">/100</span>' +
      '<button type="button" class="vas-clear">Clear</button>';

    var track = host.querySelector('.vas-track');
    var line = host.querySelector('.vas-line');
    var mark = host.querySelector('.vas-mark');
    var number = host.querySelector('.vas-number');
    var clear = host.querySelector('.vas-clear');
    function setLabel(text) {
      track.setAttribute('aria-label', text);
      number.setAttribute('aria-label', text + ' score out of 100');
      clear.setAttribute('aria-label', 'Clear ' + text);
    }
    setLabel(label);

    function show(v) {
      if (v === null || v === undefined) {
        mark.hidden = true;
        number.value = '';
        track.removeAttribute('aria-valuenow');
        track.setAttribute('aria-valuetext', 'not rated');
      } else {
        mark.hidden = false;
        mark.style.left = v + '%';
        number.value = String(v);
        track.setAttribute('aria-valuenow', String(v));
        track.setAttribute('aria-valuetext', v + ' out of 100');
      }
    }

    function commit(v) {
      if (v !== null) { v = Math.max(0, Math.min(100, Math.round(v))); }
      if (access.get() === v) { show(v); return; }
      access.set(v);
      show(v);
      markDirty();
      announceChange(changePath);
    }

    // Pointer events cover mouse, pen, and touch.
    var dragging = false;
    function fromPointer(e) {
      var r = line.getBoundingClientRect();
      commit((e.clientX - r.left) / r.width * 100);
    }
    track.addEventListener('pointerdown', function (e) {
      dragging = true;
      track.setPointerCapture(e.pointerId);
      track.focus();
      fromPointer(e);
      e.preventDefault();
    });
    track.addEventListener('pointermove', function (e) { if (dragging) { fromPointer(e); } });
    track.addEventListener('pointerup', function () { dragging = false; });
    track.addEventListener('pointercancel', function () { dragging = false; });

    track.addEventListener('keydown', function (e) {
      var v = access.get();
      var base = (v === null || v === undefined) ? 0 : v;
      var step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
      if (step !== undefined) {
        commit(base + step);
      } else if (e.key === 'Home') {
        commit(0);
      } else if (e.key === 'End') {
        commit(100);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        commit(null);
      } else {
        return;
      }
      e.preventDefault();
    });

    // Out-of-range typed scores are refused rather than clamped: they are
    // probably typos, and silently changing a rating would be unsafe.
    number.addEventListener('change', function () {
      var text = number.value.trim();
      number.setCustomValidity('');
      if (text === '') { commit(null); return; }
      var v = Number(text);
      if (!isFinite(v) || v < 0 || v > 100) {
        number.setCustomValidity('Enter a whole number from 0 to 100.');
        number.reportValidity();
        show(access.get());
        return;
      }
      commit(v);
    });

    clear.addEventListener('click', function () { commit(null); });

    host._show = show;
    host._setLabel = setLabel;
  }

  // Attributes added with "+ Add attribute": each has a name, a scale, and
  // a remove button, and is stored in order in session.vas.additional.
  function renderAdditional() {
    var host = document.getElementById('vas-additional');
    host.innerHTML = '';
    session.vas.additional.forEach(function (a, i) {
      var row = document.createElement('div');
      row.className = 'vas-row vas-added';

      var lab = document.createElement('span');
      lab.className = 'vas-label';
      var name = document.createElement('input');
      name.type = 'text';
      name.className = 'extra-label';
      name.placeholder = '(attribute name)';
      name.value = a.label;
      name.setAttribute('aria-label', 'Name of added attribute ' + (i + 1));
      lab.appendChild(name);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'vas-remove';
      rm.textContent = '✕';
      rm.title = 'Remove this attribute';
      rm.setAttribute('aria-label', 'Remove added attribute ' + (i + 1));
      lab.appendChild(rm);
      row.appendChild(lab);

      var vas = document.createElement('div');
      vas.className = 'vas';
      vas.dataset.label = a.label || 'Added attribute ' + (i + 1);
      buildVas(vas, { get: function () { return a.score; }, set: function (v) { a.score = v; } }, 'vas.additional');
      vas._show(a.score);
      row.appendChild(vas);

      name.addEventListener('input', function () {
        a.label = name.value;
        vas._setLabel(a.label || 'Added attribute ' + (i + 1));
        markDirty();
        announceChange('vas.additional');
      });
      rm.addEventListener('click', function () {
        if ((a.label || a.score !== null) &&
          !window.confirm('Remove the attribute “' + (a.label || 'unnamed') + '”' + (a.score !== null ? ' and its rating' : '') + '?')) { return; }
        session.vas.additional.splice(i, 1);
        markDirty();
        renderAdditional();
        announceChange('vas.additional');
      });
      host.appendChild(row);
    });
  }

  function addAttribute() {
    session.vas.additional.push({ label: '', score: null });
    markDirty();
    renderAdditional();
    announceChange('vas.additional');
    var inputs = document.querySelectorAll('#vas-additional .extra-label');
    if (inputs.length) { inputs[inputs.length - 1].focus(); }
  }

  // ---------------------------------------------------------------------
  // Plain inputs: text, date, number, check box
  // ---------------------------------------------------------------------

  function bindInput(el) {
    var path = el.dataset.path;
    if (el.type === 'checkbox') {
      el.addEventListener('change', function () {
        S.setPath(session, path, el.checked);
        if (path === 'stimuli.showStimulusText') { renderStimulusText(); }
        if (path === 'vas.showNumbers') { renderNumberVisibility(); }
        markDirty();
      });
    } else if (el.type === 'number') {
      el.addEventListener('change', function () {
        var text = el.value.trim();
        var v = text === '' ? null : Number(text);
        if (v !== null && (!isFinite(v) || v < 0)) { v = null; }
        if (v !== null && el.hasAttribute('data-integer')) { v = Math.round(v); }
        S.setPath(session, path, v);
        el.value = v === null ? '' : String(v);
        markDirty();
        announceChange(path);
      });
    } else {
      el.addEventListener('input', function () {
        S.setPath(session, path, el.value);
        markDirty();
        announceChange(path);
      });
    }
  }

  function renderInput(el) {
    var v = S.getPath(session, el.dataset.path);
    if (el.type === 'checkbox') {
      el.checked = !!v;
    } else if (el.type === 'number') {
      el.value = (v === null || v === undefined) ? '' : String(v);
    } else {
      el.value = (v === null || v === undefined) ? '' : v;
    }
  }

  function renderStimulusText() {
    document.body.classList.toggle('hide-stimulus-text', !session.stimuli.showStimulusText);
  }

  // Display only: hiding the score boxes never changes stored scores.
  function renderNumberVisibility() {
    document.body.classList.toggle('hide-vas-numbers', !session.vas.showNumbers);
  }

  // ---------------------------------------------------------------------
  // Copy the whole session into the form
  // ---------------------------------------------------------------------

  function render() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-path]'), function (el) {
      if (el.classList.contains('choice')) {
        renderChoice(el);
      } else if (el.classList.contains('vas')) {
        el._show(S.getPath(session, el.dataset.path));
      } else {
        renderInput(el);
      }
    });
    renderAdditional();
    renderStimulusText();
    renderNumberVisibility();
    window.CapeNotices.render();
    window.CapeUpload.render();
    window.CapeImport.render();
    // Rebuild the rules editor only for a new/loaded session, so typing in
    // it is never interrupted by a re-render.
    if (rulesEditorStale) { window.CapeRules.renderEditor(); rulesEditorStale = false; }
    window.CapeSummary.render();
    openModulesInUse();
    renderSteps();
    renderStatus();
  }
  var rulesEditorStale = true;

  // ---------------------------------------------------------------------
  // Optional modules and the progress bar
  // ---------------------------------------------------------------------

  // Opens modules the session uses; never closes one the user opened.
  function openModulesInUse() {
    var acoustic = document.getElementById('module-acoustic');
    if (session.audio.files.length || session.acoustics) { acoustic.open = true; }
  }

  function goTo(moduleId, targetId) {
    if (moduleId) { document.getElementById(moduleId).open = true; }
    var t = document.getElementById(targetId);
    // Offset for the sticky header, which would otherwise cover the target.
    if (t) {
      var headerH = document.querySelector('.app-bar').offsetHeight;
      window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - headerH - 12, behavior: 'smooth' });
    }
  }

  // "Nothing entered" = every form field still has its blank value. The
  // two display switches are not answers, so they do not count.
  var BLANK = S.createBlankSession();
  function formHasContent() {
    if (session.vas.additional.length) { return true; }
    return Array.prototype.some.call(document.querySelectorAll('#capevr-form [data-path]'), function (el) {
      var p = el.dataset.path;
      if (p === 'stimuli.showStimulusText' || p === 'vas.showNumbers') { return false; }
      return JSON.stringify(S.getPath(session, p)) !== JSON.stringify(S.getPath(BLANK, p));
    });
  }

  // Three states per step: 'todo' (not started), 'active' (in progress),
  // 'done' (complete). The rule for each step is in the code below.
  function stepStates() {
    var s = session;
    var rules = window.CapeRules.ensure(s);
    var doc = s.documentation || {};
    var p = s.progress;

    var form = (s.savedAt && !dirty) ? 'done' : (dirty || formHasContent()) ? 'active' : 'todo';
    var acoustic = s.acoustics ? 'done' : (s.audio.files.length || s.audio.lastExport) ? 'active' : 'todo';
    var docs = (p.docCopiedAt || p.csvExportedAt) ? 'done'
      : (window.CapeRules.anyFilled(rules) || (doc.excludedSuggestions && doc.excludedSuggestions.length) ||
        doc.summaryEdited || doc.emrEdited) ? 'active' : 'todo';
    var report = p.reportPrintedAt ? 'done' : p.reportOpenedAt ? 'active' : 'todo';

    return [
      { label: 'CAPE-Vr form', state: form, target: 'capevr-form',
        status: { todo: 'not started', active: dirty ? 'unsaved changes' : 'in progress, not saved', done: 'saved' }[form] },
      { label: 'Acoustics', optional: true, state: acoustic, module: 'module-acoustic', target: 'module-acoustic',
        status: { todo: 'no recordings yet',
          active: s.audio.lastExport ? 'package made; run it in Praat, then import results.json' : s.audio.files.length + ' recording(s) added',
          done: 'results imported' }[acoustic] },
      { label: 'Documentation', optional: true, state: docs, module: 'module-docs', target: 'module-docs',
        status: { todo: 'not started', active: 'in progress', done: 'text copied or CSV exported' }[docs] },
      { label: 'Report', state: report, target: 'report-section',
        status: { todo: 'not opened yet', active: 'opened, not printed', done: 'printed / saved as PDF' }[report] }
    ];
  }

  function renderSteps() {
    document.getElementById('step-hint').textContent = window.CapeUpload.hasPlayableAudio()
      ? 'Recordings are loaded: use the player in the bottom-right corner to listen while rating.'
      : 'For real-time audio playback while rating, upload the recordings in step 2 first.';
    var nav = document.getElementById('stepbar');
    nav.innerHTML = '';
    var ol = document.createElement('ol');
    stepStates().forEach(function (st, i) {
      var li = document.createElement('li');
      li.className = 'step is-' + st.state;
      var b = document.createElement('button');
      b.type = 'button';
      var mark = document.createElement('span');
      mark.className = 'step-mark';
      mark.textContent = st.state === 'done' ? '✓' : String(i + 1);
      b.appendChild(mark);
      var lab = document.createElement('span');
      lab.className = 'step-label';
      lab.textContent = st.label;
      b.appendChild(lab);
      var text = 'Step ' + (i + 1) + ': ' + st.label + (st.optional ? ' (optional)' : '') + ', ' + st.status;
      b.title = text;
      b.setAttribute('aria-label', text);
      b.addEventListener('click', function () { goTo(st.module, st.target); });
      li.appendChild(b);
      ol.appendChild(li);
    });
    nav.appendChild(ol);
  }

  // ---------------------------------------------------------------------
  // New / Load / Save
  // ---------------------------------------------------------------------

  function confirmDiscard(action) {
    return !dirty || window.confirm('You have unsaved changes. ' + action + ' anyway and lose them?');
  }

  function newSession() {
    if (!confirmDiscard('Start a new session')) { return; }
    session = S.createBlankSession();
    dirty = false;
    lastFileName = '';
    rulesEditorStale = true;
    window.CapeUpload.forgetAllAudio();
    clearMessages();
    render();
  }

  function loadText(text, fileName) {
    var result;
    try {
      result = S.parseSessionText(text);
    } catch (err) {
      showMessage('error', 'Could not load ' + (fileName || 'the file'), [err.message]);
      return false;
    }
    session = result.session;
    dirty = false;
    lastFileName = fileName || '';
    rulesEditorStale = true;
    clearMessages();
    if (result.warnings.length) {
      showMessage('warning', 'Loaded ' + (fileName || 'the session') + ', with notes:', result.warnings);
    }
    render();
    return true;
  }

  function saveSession() {
    lastFileName = S.saveSession(session);
    dirty = false;
    render();
  }

  // ---------------------------------------------------------------------
  // Start up
  // ---------------------------------------------------------------------

  function init() {
    // Other modules get the session through this object rather than a
    // global, so form.js stays the single owner of session state.
    var shared = {
      getSession: function () { return session; },
      markDirty: markDirty,
      render: render,
      renderSteps: function () { renderSteps(); },
      showMessage: showMessage
    };
    window.CapeUpload.init(shared);
    window.CapeExport.init(shared);
    window.CapeImport.init(shared);
    window.CapeReport.init(shared);
    window.CapeRules.init(shared);
    window.CapeSummary.init(shared);

    Array.prototype.forEach.call(document.querySelectorAll('.choice[data-path]'), buildChoice);
    Array.prototype.forEach.call(document.querySelectorAll('.vas[data-path]'), function (host) { buildVas(host); });
    Array.prototype.forEach.call(document.querySelectorAll('input[data-path], textarea[data-path]'), bindInput);

    document.getElementById('btn-new').addEventListener('click', newSession);
    document.getElementById('btn-save').addEventListener('click', saveSession);
    document.getElementById('btn-add-attr').addEventListener('click', addAttribute);

    var fileInput = document.getElementById('file-load');
    document.getElementById('btn-load').addEventListener('click', function () {
      if (!confirmDiscard('Load another session')) { return; }
      fileInput.value = '';
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () { loadText(String(reader.result), file.name); };
      reader.onerror = function () {
        showMessage('error', 'Could not read ' + file.name, ['The browser could not read the file.']);
      };
      reader.readAsText(file);
    });

    render();
  }

  init();

  // For checking in the browser console (read-only use).
  window.CapeApp = {
    getSession: function () { return session; },
    loadText: loadText,
    isDirty: function () { return dirty; }
  };
})();
