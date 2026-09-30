/*
 * rules.js: clinic-defined interpretation rules.
 *
 * A configurable report generator, NOT clinical decision support. Rules only
 * describe patterns in the scores and Praat's values; they never diagnose.
 * All rules ship empty, because there are no published cut-offs the app
 * could responsibly default to; every value must be the clinic's own. A rule
 * is active once it is filled in; clearing it removes it.
 * Reference values exist only for threshold-based measures (CPPS, HNR,
 * jitter, shimmer); F0, intensity, and formants are never interpreted.
 *
 * Rules are saved to a file the clinic controls (so one set can be shared)
 * and copied into each session, so every summary stays reproducible.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var app = null;
  var lastLoadedRules = null;   // in memory only (no browser storage): reused for a New session

  var RULES_TYPE = 'cape-vr-rules';
  // 0.3.0: per-rule "enabled" flags removed (a filled-in rule is active).
  var RULES_SCHEMA = '0.3.0';

  var VAS = [
    ['overallSeverity', 'Overall Severity'], ['roughness', 'Roughness'],
    ['breathiness', 'Breathiness'], ['strain', 'Strain']
  ];
  // 'extra' covers the blank attribute row and every added attribute.
  var FEATURE_ATTRS = [['roughness', 'Roughness'], ['breathiness', 'Breathiness'], ['strain', 'Strain'],
    ['extra', 'Additional attributes (the blank row and any added ones)']];

  // Only threshold-based measures may have a reference value. A value is only
  // meaningful for one task group and one analysis configuration, so each
  // lists the settings it depends on; these are recorded with the value and
  // checked against results.json.
  var REF_MEASURES = [
    { id: 'cpps_vowels', measure: 'cpps', group: 'vowels', label: 'CPPS, sustained vowels', unit: 'dB', settings: ['cppsMethod', 'vowelWindowSec'] },
    { id: 'cpps_speech', measure: 'cpps', group: 'speech', label: 'CPPS, connected speech', unit: 'dB', settings: ['cppsMethod', 'cppsSpeechVoicedOnly'] },
    { id: 'hnr_vowels', measure: 'hnr', group: 'vowels', label: 'HNR, sustained vowels', unit: 'dB', settings: ['hnrMethod', 'vowelWindowSec'] },
    { id: 'jitter_local', measure: 'jitterLocal', group: 'vowels', label: 'Jitter (local)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'jitter_local_abs', measure: 'jitterLocalAbsolute', group: 'vowels', label: 'Jitter (local, absolute)', unit: 's', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'jitter_rap', measure: 'jitterRap', group: 'vowels', label: 'Jitter (rap)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'jitter_ppq5', measure: 'jitterPpq5', group: 'vowels', label: 'Jitter (ppq5)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'jitter_ddp', measure: 'jitterDdp', group: 'vowels', label: 'Jitter (ddp)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_local', measure: 'shimmerLocal', group: 'vowels', label: 'Shimmer (local, %)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_local_db', measure: 'shimmerLocalDb', group: 'vowels', label: 'Shimmer (local, dB)', unit: 'dB', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_apq3', measure: 'shimmerApq3', group: 'vowels', label: 'Shimmer (apq3)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_apq5', measure: 'shimmerApq5', group: 'vowels', label: 'Shimmer (apq5)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_apq11', measure: 'shimmerApq11', group: 'vowels', label: 'Shimmer (apq11)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] },
    { id: 'shimmer_dda', measure: 'shimmerDda', group: 'vowels', label: 'Shimmer (dda)', unit: '%', settings: ['periodRangeMode', 'vowelWindowSec'] }
  ];
  function refDef(id) { return REF_MEASURES.filter(function (m) { return m.id === id; })[0]; }

  // PLACEHOLDERS ONLY, not defaults: they have no published source, so they
  // are shown in grey and copied in only if the clinic explicitly asks.
  var EXAMPLES = {
    severity: [[0, 24, 'mild'], [25, 49, 'mild-to-moderate'], [50, 74, 'moderate-to-severe'], [75, 100, 'severe']],
    descriptors: [[1, 15, 'minimally present'], [16, 100, 'present']],
    minScore: 20,
    tieMargin: 0
  };

  function emptyRanges(n) {
    var a = [];
    for (var i = 0; i < n; i++) { a.push({ min: null, max: null, label: '' }); }
    return a;
  }

  function blankRules() {
    return {
      fileType: RULES_TYPE,
      schemaVersion: RULES_SCHEMA,
      appVersion: S.APP_VERSION,
      name: '',
      savedAt: null,
      severity: { ranges: emptyRanges(4) },
      // minScore starts empty so ranking stays inactive until the clinic sets it.
      ranking: { attributes: ['roughness', 'breathiness', 'strain'], maxRanks: 3, minScore: null, tieMargin: null },
      descriptors: { attributes: ['roughness', 'breathiness', 'strain'], ranges: emptyRanges(3) },
      references: [newReference('cpps_vowels'), newReference('cpps_speech')],
      // Controls the Clinical Summary / EMR draft and the CSV's summary_ columns;
      // the CSV's per-file columns always have every value.
      summary: {
        measures: ['cpps', 'f0Mean'],
        tasks: ['vowel_a', 'extemporaneous'],
        takes: 'each',
        combineTasks: 'separate'  // a 'mean' still keeps vowels and speech apart
      }
    };
  }

  function newReference(measureId) {
    return { key: S.newId().slice(0, 8), id: measureId, value: null, condition: null, text: '', settings: null };
  }

  // "Filled in" = the clinic has entered something, so the rule is in use.
  function rangesFilled(ranges) {
    return ranges.some(function (r) { return r.min !== null || r.max !== null || (r.label && r.label.trim()); });
  }
  function referenceEmpty(ref) {
    return ref.value === null && !ref.condition && !(ref.text && ref.text.trim());
  }
  function anyFilled(rules) {
    return rangesFilled(rules.severity.ranges) || rules.ranking.minScore !== null ||
      rangesFilled(rules.descriptors.ranges) || rules.references.some(function (x) { return !referenceEmpty(x); });
  }
  function rangesText(ranges) {
    return ranges.filter(function (x) { return x.min !== null || x.max !== null || x.label; })
      .map(function (x) { return (x.min === null ? '?' : x.min) + '–' + (x.max === null ? '?' : x.max) + ' ' + (x.label || '(no label)'); }).join('; ');
  }

  // Older files had a "Use this rule" switch per rule. Rules that were
  // filled in but switched off are held back here (not silently made
  // active) until the clinician chooses to keep or delete each one.
  // Each entry: { label, detail, restore(rules) }.
  var pendingDisabled = [];
  var pendingFromFile = false;

  // Loaded files are untrusted, so anything missing or invalid is reset.
  // Rule sets from schema 0.1.0 are migrated: primaryFeature -> ranking,
  // thresholds -> references, comparisons dropped.
  function normalize(r) {
    var out = blankRules();
    if (!r || typeof r !== 'object') { return out; }
    function held(label, detail, restore) { pendingDisabled.push({ label: label, detail: detail, restore: restore }); }
    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    function str(v) { return typeof v === 'string' ? v : ''; }
    function ranges(list, n) {
      var a = Array.isArray(list) ? list.slice(0, 8).map(function (x) {
        return { min: num(x && x.min), max: num(x && x.max), label: str(x && x.label) };
      }) : [];
      while (a.length < n) { a.push({ min: null, max: null, label: '' }); }
      return a;
    }
    function attrs(list, fallback) {
      if (!Array.isArray(list)) { return fallback; }
      return ['roughness', 'breathiness', 'strain', 'extra'].filter(function (k) { return list.indexOf(k) !== -1; });
    }
    out.name = str(r.name);
    out.savedAt = typeof r.savedAt === 'string' ? r.savedAt : null;
    if (r.severity) {
      var sevRanges = ranges(r.severity.ranges, 4);
      if (r.severity.enabled === false && rangesFilled(sevRanges)) {
        held('Severity ranges', rangesText(sevRanges), function (rules) { rules.severity.ranges = sevRanges; });
      } else {
        out.severity.ranges = sevRanges;
      }
    }

    var rk = r.ranking || r.primaryFeature;
    if (rk) {
      out.ranking.attributes = attrs(rk.attributes, out.ranking.attributes);
      out.ranking.maxRanks = [1, 2, 3].indexOf(rk.maxRanks) !== -1 ? rk.maxRanks : (r.ranking ? 3 : 1);
      out.ranking.tieMargin = num(rk.tieMargin);
      var minScore = num(rk.minScore);
      if (rk.enabled === false && minScore !== null) {
        held('Perceptual feature ranking', 'minimum score ' + minScore + ', up to ' + out.ranking.maxRanks + ' rank(s)',
          function (rules) { rules.ranking.minScore = minScore; });
      } else {
        out.ranking.minScore = minScore;
      }
    }
    if (r.descriptors) {
      out.descriptors.attributes = attrs(r.descriptors.attributes, out.descriptors.attributes);
      var descRanges = ranges(r.descriptors.ranges, 3);
      if (r.descriptors.enabled === false && rangesFilled(descRanges)) {
        held('Attribute descriptors', rangesText(descRanges), function (rules) { rules.descriptors.ranges = descRanges; });
      } else {
        out.descriptors.ranges = descRanges;
      }
    }

    // Returns the reference, or null if it was held back (see above).
    function keepReference(ref, wasDisabled) {
      if (wasDisabled && !referenceEmpty(ref)) {
        var def = refDef(ref.id);
        held('Clinic reference value: ' + def.label,
          (ref.condition || 'no condition') + ' ' + (ref.value === null ? '(no value)' : ref.value + ' ' + def.unit) +
            (ref.text ? ' → “' + ref.text + '”' : ''),
          function (rules) { rules.references.push(ref); });
        return null;
      }
      return ref;
    }
    if (Array.isArray(r.references)) {
      out.references = r.references.filter(function (x) { return x && refDef(x.id); }).map(function (x) {
        return keepReference({
          key: typeof x.key === 'string' ? x.key : S.newId().slice(0, 8), id: x.id,
          value: num(x.value), condition: x.condition === 'below' || x.condition === 'above' ? x.condition : null,
          text: str(x.text), settings: x.settings && typeof x.settings === 'object' ? x.settings : null
        }, x.enabled === false);
      }).filter(Boolean);
    } else if (Array.isArray(r.thresholds)) {
      out.references = r.thresholds.filter(function (x) { return x && refDef(x.id); }).map(function (x) {
        var ref = newReference(x.id);
        ref.value = num(x.threshold);
        ref.condition = ref.value !== null ? 'below' : null;
        ref.text = str(x.belowText);
        return keepReference(ref, x.enabled === false);
      }).filter(Boolean);
    }

    if (r.summary) {
      if (Array.isArray(r.summary.measures)) { out.summary.measures = r.summary.measures.filter(function (m) { return typeof m === 'string'; }); }
      if (Array.isArray(r.summary.tasks)) { out.summary.tasks = r.summary.tasks.filter(function (t) { return typeof t === 'string'; }); }
      if (r.summary.takes === 'mean' || r.summary.takes === 'each') { out.summary.takes = r.summary.takes; }
      if (r.summary.combineTasks === 'mean' || r.summary.combineTasks === 'separate') { out.summary.combineTasks = r.summary.combineTasks; }
    }
    return out;
  }

  function ensure(session) {
    if (!session.rules) { session.rules = lastLoadedRules ? S.clone(lastLoadedRules) : blankRules(); }
    else if (!session.rules._normalized) {
      session.rules = normalize(session.rules);
      // A loaded session's rules copy: ask after the page has been drawn.
      if (pendingDisabled.length) { pendingFromFile = false; setTimeout(showPendingDialog, 0); }
    }
    Object.defineProperty(session.rules, '_normalized', { value: true, enumerable: false, configurable: true });
    return session.rules;
  }

  // Overlapping or incomplete ranges make the rule inactive rather than
  // guessing which label applies. Returns { ok, error, ranges }, with
  // empty: true when nothing has been entered (the rule is simply unused).
  function checkRanges(list, min0, max0) {
    var rows = list.filter(function (r) { return r.min !== null || r.max !== null || r.label; });
    if (!rows.length) { return { ok: false, empty: true, error: 'No ranges have been entered.' }; }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.min === null || r.max === null || !r.label.trim()) { return { ok: false, error: 'Row ' + (i + 1) + ' needs a minimum, a maximum, and a label.' }; }
      if (r.min < min0 || r.max > max0 || r.min > r.max) { return { ok: false, error: 'Row ' + (i + 1) + ': the range must be within ' + min0 + '–' + max0 + ', with minimum ≤ maximum.' }; }
    }
    var sorted = rows.slice().sort(function (a, b) { return a.min - b.min; });
    for (var j = 1; j < sorted.length; j++) {
      if (sorted[j].min <= sorted[j - 1].max) { return { ok: false, error: 'The ranges ' + sorted[j - 1].min + '–' + sorted[j - 1].max + ' and ' + sorted[j].min + '–' + sorted[j].max + ' overlap.' }; }
    }
    return { ok: true, ranges: sorted };
  }
  function checkSeverity(rules) { return checkRanges(rules.severity.ranges, 0, 100); }

  // All text comes from the clinic, so a rule missing any part stays inactive.
  function referenceProblem(ref) {
    if (ref.value === null) { return 'no reference value entered'; }
    if (!ref.condition) { return 'no condition chosen (below or above)'; }
    if (!ref.text.trim()) { return 'no generated text entered'; }
    return null;
  }

  // Stored as text so they compare directly with results.json settings.
  function currentSettings(session, ref) {
    var adv = (session.audio && session.audio.advanced) || {};
    var out = {};
    refDef(ref.id).settings.forEach(function (k) { out[k] = adv[k] === undefined ? '' : String(adv[k]); });
    return out;
  }

  // A reference value is not transferable across analysis configurations,
  // so any mismatch is reported to the clinician as a warning.
  function settingsDifferences(ref, results) {
    if (!ref.settings || !results || !results.settings) { return []; }
    var diffs = [];
    Object.keys(ref.settings).forEach(function (k) {
      var inResults = results.settings[k];
      if (inResults !== undefined && String(inResults) !== String(ref.settings[k])) {
        diffs.push(k + ': reference value set for "' + ref.settings[k] + '", results used "' + inResults + '"');
      }
    });
    return diffs;
  }

  // ---------------------------------------------------------------------
  // Old rules that were switched off: keep or delete each one
  // ---------------------------------------------------------------------

  function showPendingDialog() {
    if (!pendingDisabled.length) { return; }
    var items = pendingDisabled;
    pendingDisabled = [];
    var dlg = document.getElementById('rules-disabled-dialog');
    var body = document.getElementById('rules-disabled-body');
    body.innerHTML = '';
    body.appendChild(el('p', null, 'These rules were filled in but switched off in the older ' +
      (pendingFromFile ? 'rules file' : 'session file') + '. This version has no on/off switch: a filled-in rule is always used. ' +
      'Choose whether to keep (use) or delete each one. Until you decide, none of them is used.'));
    var choices = items.map(function () { return null; });
    var apply = document.getElementById('rules-disabled-apply');
    function refresh() { apply.disabled = choices.some(function (c) { return c === null; }); }
    items.forEach(function (it, i) {
      var row = el('fieldset', 'pending-rule');
      row.appendChild(el('legend', null, it.label));
      row.appendChild(el('p', 'muted', it.detail));
      ['keep', 'delete'].forEach(function (what) {
        var l = el('label', 'rule-toggle');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = 'pending-' + i;
        r.value = what;
        r.addEventListener('change', function () { choices[i] = what; refresh(); });
        l.appendChild(r);
        l.appendChild(document.createTextNode(what === 'keep' ? ' Keep (use it)' : ' Delete'));
        row.appendChild(l);
      });
      body.appendChild(row);
    });
    function setAll(what) {
      choices = choices.map(function () { return what; });
      Array.prototype.forEach.call(body.querySelectorAll('input[type=radio]'), function (r) { r.checked = r.value === what; });
      refresh();
    }
    document.getElementById('rules-disabled-keep-all').onclick = function () { setAll('keep'); };
    document.getElementById('rules-disabled-delete-all').onclick = function () { setAll('delete'); };
    var applied = false;
    apply.onclick = function () {
      applied = true;
      var session = app.getSession();
      var kept = 0;
      items.forEach(function (it, i) { if (choices[i] === 'keep') { it.restore(session.rules); kept++; } });
      if (pendingFromFile) { lastLoadedRules = S.clone(session.rules); }
      dlg.close();
      app.markDirty();
      renderEditor();
      app.render();
      app.showMessage('info', 'Rules from the older file', [kept + ' kept and now used; ' + (items.length - kept) + ' deleted.']);
    };
    // The choice cannot be skipped: Escape does not close the dialog.
    dlg.oncancel = function (e) { e.preventDefault(); };
    dlg.onclose = function () { if (!applied) { dlg.showModal(); } };
    refresh();
    dlg.showModal();
  }

  // ---------------------------------------------------------------------
  // Rules file: save and load
  // ---------------------------------------------------------------------

  function saveRulesFile() {
    var session = app.getSession();
    var r = ensure(session);
    r.savedAt = S.isoNow();
    r.appVersion = S.APP_VERSION;
    r.schemaVersion = RULES_SCHEMA;
    var safe = (r.name || 'clinic').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'clinic';
    var blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'rules_' + safe + '_' + r.savedAt.slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    lastLoadedRules = S.clone(r);
    app.markDirty();
    refreshStatus();
  }

  function loadRulesText(text, fileName) {
    var data;
    try { data = JSON.parse(text); } catch (e) {
      app.showMessage('error', 'Could not load ' + fileName, ['The file could not be read as JSON.']);
      return false;
    }
    if (!data || data.fileType !== RULES_TYPE) {
      app.showMessage('error', 'Could not load ' + fileName, ['This is not a CAPE-Vr rules file.']);
      return false;
    }
    var session = app.getSession();
    pendingDisabled = [];
    session.rules = normalize(data);
    Object.defineProperty(session.rules, '_normalized', { value: true, enumerable: false, configurable: true });
    lastLoadedRules = S.clone(session.rules);
    app.markDirty();
    renderEditor();
    app.render();
    app.showMessage('info', 'Loaded rules: ' + (session.rules.name || fileName),
      ['These rules are now used for this session and for new sessions in this window.']);
    if (pendingDisabled.length) { pendingFromFile = true; showPendingDialog(); }
    return true;
  }

  // ---------------------------------------------------------------------
  // Rule editor
  // ---------------------------------------------------------------------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  // Empty stores null, never 0, so "not set" keeps a rule inactive.
  function numberInput(obj, key, placeholder, onChange, attrs) {
    var i = document.createElement('input');
    i.type = 'number';
    i.step = 'any';
    i.value = obj[key] === null || obj[key] === undefined ? '' : String(obj[key]);
    if (placeholder !== undefined && placeholder !== null) { i.placeholder = String(placeholder); }
    Object.keys(attrs || {}).forEach(function (k) { i.setAttribute(k, attrs[k]); });
    i.addEventListener('input', function () {
      var t = i.value.trim();
      obj[key] = t === '' ? null : (isFinite(Number(t)) ? Number(t) : null);
      onChange();
    });
    return i;
  }
  function textInput(obj, key, placeholder, onChange) {
    var i = document.createElement('input');
    i.type = 'text';
    i.value = obj[key] || '';
    if (placeholder) { i.placeholder = placeholder; }
    i.addEventListener('input', function () { obj[key] = i.value; onChange(); });
    return i;
  }
  function attrChecks(obj, onChange) {
    var row = el('div', 'rule-inline');
    row.appendChild(el('span', 'rule-sub', 'Attributes:'));
    FEATURE_ATTRS.forEach(function (a) {
      var l = el('label', 'rule-toggle');
      var c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = obj.attributes.indexOf(a[0]) !== -1;
      c.addEventListener('change', function () {
        var list = obj.attributes.filter(function (x) { return x !== a[0]; });
        if (c.checked) { list.push(a[0]); }
        obj.attributes = FEATURE_ATTRS.map(function (x) { return x[0]; }).filter(function (x) { return list.indexOf(x) !== -1; });
        onChange();
      });
      l.appendChild(c);
      l.appendChild(document.createTextNode(' ' + a[1]));
      row.appendChild(l);
    });
    return row;
  }
  function rangeTable(holder, examples, max, onChange, labelHeader) {
    var wrap = el('div');
    var table = el('table', 'rule-table');
    table.innerHTML = '<thead><tr><th>From</th><th>To</th><th>' + labelHeader + '</th></tr></thead>';
    var tb = el('tbody');
    holder.ranges.forEach(function (r, i) {
      var ex = examples[i] || [null, null, ''];
      var tr = el('tr');
      var td1 = el('td'); td1.appendChild(numberInput(r, 'min', ex[0], onChange, { min: 0, max: max })); tr.appendChild(td1);
      var td2 = el('td'); td2.appendChild(numberInput(r, 'max', ex[1], onChange, { min: 0, max: max })); tr.appendChild(td2);
      var td3 = el('td'); td3.appendChild(textInput(r, 'label', ex[2] ? 'e.g. ' + ex[2] : '', onChange)); tr.appendChild(td3);
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    var fill = el('button', 'small', 'Fill in example values (placeholders; please review)');
    fill.type = 'button';
    fill.addEventListener('click', function () {
      if (!window.confirm('Copy the example values into this rule? They are placeholders with no published source; your clinic should review and change them.')) { return; }
      holder.ranges = examples.map(function (x) { return { min: x[0], max: x[1], label: x[2] }; });
      while (holder.ranges.length < 3) { holder.ranges.push({ min: null, max: null, label: '' }); }
      onChange();
      renderEditor();
    });
    wrap.appendChild(fill);
    return wrap;
  }

  function renderEditor() {
    if (!app) { return; }
    var session = app.getSession();
    var rules = ensure(session);
    var box = document.getElementById('rules-editor');
    box.innerHTML = '';
    function changed() { app.markDirty(); window.CapeSummary.render(); refreshStatus(); app.renderSteps(); }

    var top = el('div', 'rule-inline');
    var nameRow = el('label', 'field');
    nameRow.appendChild(document.createTextNode('Rule set name (e.g. your clinic)'));
    nameRow.appendChild(textInput(rules, 'name', 'e.g. Voice Clinic', changed));
    top.appendChild(nameRow);
    box.appendChild(top);
    box.appendChild(el('p', 'rule-note', 'Every rule starts empty. A rule is used as soon as it is filled in; to stop using it, clear its values.'));

    var sev = el('fieldset', 'rule');
    sev.appendChild(el('legend', null, 'Severity ranges (Overall Severity)'));
    sev.appendChild(el('p', 'rule-note',
      'Clinic-defined labels, applied only after rating. The CAPE-Vr removed the mild/moderate/severe labels from the form on purpose, to avoid biasing ratings, and no published cut-offs are implied. The grey values are placeholders only: enter your clinic’s own values.'));
    sev.appendChild(rangeTable(rules.severity, EXAMPLES.severity, 100, changed, 'Label used in the text'));
    sev.appendChild(el('p', 'rule-check')).id = 'check-severity';
    box.appendChild(sev);

    var rk = el('fieldset', 'rule');
    rk.appendChild(el('legend', null, 'Perceptual feature ranking (primary, secondary, tertiary)'));
    rk.appendChild(el('p', 'rule-note', 'Rule: the chosen attributes are ranked by score. The highest is named the primary feature, the next the secondary, and so on, up to the number of ranks chosen. An attribute is named only if it reaches the minimum score. Attributes within the tie margin are named together at the same rank. The rule is used once a minimum score is entered; clear the minimum score to stop using it.'));
    rk.appendChild(attrChecks(rules.ranking, changed));
    var rkRow = el('div', 'rule-inline');
    var ranksL = el('label', 'field narrow');
    ranksL.appendChild(document.createTextNode('Ranks to name'));
    var ranksSel = document.createElement('select');
    [1, 2, 3].forEach(function (n) { var o = el('option', null, String(n) + (n === 1 ? ' (primary only)' : n === 2 ? ' (primary, secondary)' : ' (primary, secondary, tertiary)')); o.value = String(n); ranksSel.appendChild(o); });
    ranksSel.value = String(rules.ranking.maxRanks);
    ranksSel.addEventListener('change', function () { rules.ranking.maxRanks = Number(ranksSel.value); changed(); });
    ranksL.appendChild(ranksSel);
    rkRow.appendChild(ranksL);
    var minL = el('label', 'field narrow');
    minL.appendChild(document.createTextNode('Minimum score to be named (0–100)'));
    minL.appendChild(numberInput(rules.ranking, 'minScore', EXAMPLES.minScore, changed, { min: 0, max: 100 }));
    rkRow.appendChild(minL);
    var tieL = el('label', 'field narrow');
    tieL.appendChild(document.createTextNode('Tie margin (points; empty = exact ties only)'));
    tieL.appendChild(numberInput(rules.ranking, 'tieMargin', EXAMPLES.tieMargin, changed, { min: 0, max: 100 }));
    rkRow.appendChild(tieL);
    rk.appendChild(rkRow);
    box.appendChild(rk);

    var ds = el('fieldset', 'rule');
    ds.appendChild(el('legend', null, 'Attribute descriptors (e.g. “Breathiness minimally present”)'));
    ds.appendChild(el('p', 'rule-note', 'Rule: when a chosen attribute’s score falls in a range, the text says “<attribute> <label>”. Like the severity ranges, these are clinic-defined labels applied after rating, with no published cut-offs. The grey values are placeholders only.'));
    ds.appendChild(attrChecks(rules.descriptors, changed));
    ds.appendChild(rangeTable(rules.descriptors, EXAMPLES.descriptors, 100, changed, 'Descriptor used in the text'));
    ds.appendChild(el('p', 'rule-check')).id = 'check-descriptors';
    box.appendChild(ds);

    var rv = el('fieldset', 'rule');
    rv.appendChild(el('legend', null, 'Clinic Reference Values (Optional)'));
    rv.appendChild(el('p', 'rule-note', 'Reference values may be defined for threshold-based acoustic measures. These values are clinic-configurable and are used only for generating descriptive narrative text. Interpretations are not diagnostic and should be reviewed by the clinician.'));
    var imp = el('div', 'rule-important');
    imp.appendChild(el('b', null, 'Important: '));
    imp.appendChild(document.createTextNode('Reference values are specific to the acoustic measure, the analysis settings used, the CPPS preset, and the speech task (sustained vowels vs connected speech). Reference values should not be transferred across different analysis configurations. The app records the settings when you enter a value, and warns if the results were made with different settings.'));
    rv.appendChild(imp);
    rv.appendChild(el('p', 'notice', window.CapeNotices.REFERENCE_SHORT));
    rv.appendChild(el('p', 'rule-note', 'F0, intensity, and formants cannot have reference values: they are shown and exported only. “Below” and “above” are strict (a value equal to the reference value meets neither). If the condition is not met, no text is generated.'));
    var tt = el('table', 'rule-table');
    tt.innerHTML = '<thead><tr><th>Measure</th><th>Reference value</th><th>Condition</th>' +
      '<th>Generated text <span class="muted">(e.g. “CPPS was below the clinic reference value.”)</span></th><th></th></tr></thead>';
    var ttb = el('tbody');
    rules.references.forEach(function (ref) {
      var def = refDef(ref.id);
      var tr = el('tr');
      tr.appendChild(el('td', null, def.label));
      var c2 = el('td');
      var ni = numberInput(ref, 'value', def.unit, function () {
        // Capture the settings now, so later results can be checked against them.
        ref.settings = ref.value === null ? null : currentSettings(app.getSession(), ref);
        changed();
      });
      ni.setAttribute('aria-label', 'Reference value (' + def.unit + ') for ' + def.label);
      c2.appendChild(ni);
      if (ref.settings) {
        c2.appendChild(el('div', 'rule-settings', 'for: ' + Object.keys(ref.settings).map(function (k) { return k + ' ' + ref.settings[k]; }).join(', ')));
      }
      tr.appendChild(c2);
      var c3 = el('td');
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Condition for ' + def.label);
      [['', 'choose…'], ['below', 'Below reference value'], ['above', 'Above reference value']].forEach(function (o) {
        var op = el('option', null, o[1]); op.value = o[0]; sel.appendChild(op);
      });
      sel.value = ref.condition || '';
      sel.addEventListener('change', function () { ref.condition = sel.value || null; changed(); });
      c3.appendChild(sel);
      tr.appendChild(c3);
      var c4 = el('td'); var ti = textInput(ref, 'text', '', changed); ti.setAttribute('aria-label', 'Generated text for ' + def.label); c4.appendChild(ti); tr.appendChild(c4);
      var c5 = el('td');
      var rm = el('button', 'small', 'Remove'); rm.type = 'button';
      rm.addEventListener('click', function () { rules.references = rules.references.filter(function (x) { return x !== ref; }); changed(); renderEditor(); });
      c5.appendChild(rm); tr.appendChild(c5);
      ttb.appendChild(tr);
    });
    tt.appendChild(ttb);
    rv.appendChild(tt);
    var addRow = el('div', 'rule-inline');
    var addSel = document.createElement('select');
    addSel.setAttribute('aria-label', 'Measure for a new reference value');
    REF_MEASURES.forEach(function (m) { var o = el('option', null, m.label); o.value = m.id; addSel.appendChild(o); });
    var add = el('button', 'small', 'Add reference value'); add.type = 'button';
    add.addEventListener('click', function () { rules.references.push(newReference(addSel.value)); changed(); renderEditor(); });
    addRow.appendChild(addSel);
    addRow.appendChild(add);
    rv.appendChild(addRow);
    box.appendChild(rv);

    // What the summary includes: collapsed by default, because it is a
    // setting rather than a rule.
    var smWrap = el('details', 'rule rule-collapsible');
    smWrap.appendChild(el('summary', null, 'Acoustic values in the Clinical Summary and EMR draft'));
    var sm = el('div');
    smWrap.appendChild(sm);
    sm.appendChild(el('p', 'rule-note', 'The CSV always contains every value. Averages are simple means of the values Praat reported, labeled with how many values were used. Vowels and connected speech are never averaged together.'));
    var mrow = el('div', 'rule-inline');
    mrow.appendChild(el('span', 'rule-sub', 'Measures:'));
    window.CapeSummary.MEASURES.forEach(function (m) {
      var l = el('label', 'rule-toggle');
      var c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = rules.summary.measures.indexOf(m.key) !== -1;
      c.addEventListener('change', function () {
        var list = rules.summary.measures.filter(function (x) { return x !== m.key; });
        if (c.checked) { list.push(m.key); }
        rules.summary.measures = window.CapeSummary.MEASURES.map(function (x) { return x.key; }).filter(function (k) { return list.indexOf(k) !== -1; });
        changed();
      });
      l.appendChild(c);
      l.appendChild(document.createTextNode(' ' + m.label));
      mrow.appendChild(l);
    });
    sm.appendChild(mrow);
    var trow = el('div', 'rule-inline');
    trow.appendChild(el('span', 'rule-sub', 'Tasks:'));
    window.CapeUpload.TASKS.forEach(function (t) {
      var l = el('label', 'rule-toggle');
      var c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = rules.summary.tasks.indexOf(t[0]) !== -1;
      c.addEventListener('change', function () {
        var list = rules.summary.tasks.filter(function (x) { return x !== t[0]; });
        if (c.checked) { list.push(t[0]); }
        rules.summary.tasks = window.CapeUpload.TASKS.map(function (x) { return x[0]; }).filter(function (k) { return list.indexOf(k) !== -1; });
        changed();
      });
      l.appendChild(c);
      l.appendChild(document.createTextNode(' ' + t[1]));
      trow.appendChild(l);
    });
    sm.appendChild(trow);
    function radioRow(label, key, options, note) {
      var row = el('div', 'rule-inline');
      row.appendChild(el('span', 'rule-sub', label));
      options.forEach(function (o) {
        var l = el('label', 'rule-toggle');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = 'sum-' + key;
        r.checked = rules.summary[key] === o[0];
        r.addEventListener('change', function () { if (r.checked) { rules.summary[key] = o[0]; changed(); } });
        l.appendChild(r);
        l.appendChild(document.createTextNode(' ' + o[1]));
        row.appendChild(l);
      });
      sm.appendChild(row);
      if (note) { sm.appendChild(el('p', 'rule-caution', note)); }
    }
    radioRow('Several takes of a task:', 'takes', [['each', 'show each take'], ['mean', 'show the mean of the takes']]);
    radioRow('Several tasks:', 'combineTasks', [['separate', 'show each task'], ['mean', 'show one mean across the chosen vowels, and one across the chosen connected-speech tasks']],
      'Caution: values from different tasks differ systematically (for example sentences vs extemporaneous speech, or /ɑ/ vs /i/). A mean across different tasks mixes them. It is labeled “mean across different tasks” wherever it appears.');
    box.appendChild(smWrap);

    refreshStatus();
  }

  function refreshStatus() {
    var session = app.getSession();
    var r = session.rules;
    function show(id, check) {
      var e = document.getElementById(id);
      if (!e) { return; }
      if (check.empty) { e.textContent = 'Empty (not used).'; e.className = 'rule-check'; return; }
      e.textContent = check.ok ? 'Active: ' + check.ranges.length + ' range(s).' : 'Inactive: ' + check.error;
      e.className = 'rule-check' + (check.ok ? '' : ' is-error');
    }
    show('check-severity', checkSeverity(r));
    show('check-descriptors', checkRanges(r.descriptors.ranges, 0, 100));
  }

  function init(shared) {
    app = shared;
    var input = document.getElementById('rules-input');
    document.getElementById('btn-rules-load').addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) { return; }
      var reader = new FileReader();
      reader.onload = function () { loadRulesText(String(reader.result), f.name); };
      reader.readAsText(f);
    });
    document.getElementById('btn-rules-save').addEventListener('click', saveRulesFile);
  }

  window.CapeRules = {
    VAS: VAS,
    refDef: refDef,
    init: init,
    ensure: ensure,
    checkSeverity: checkSeverity,
    checkRanges: checkRanges,
    referenceProblem: referenceProblem,
    referenceEmpty: referenceEmpty,
    anyFilled: anyFilled,
    settingsDifferences: settingsDifferences,
    renderEditor: renderEditor
  };
})();
