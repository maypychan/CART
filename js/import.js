/*
 * import.js: imports Praat results (results.json) into session.acoustics.
 *
 * Malformed files (see checkStructure below) are refused; mismatches with the
 * session (IDs, profile, exported WAV names) only warn.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var app = null;

  var RESULTS_TYPE = 'cape-vr-acoustic-results';
  var NEWEST_RESULTS_SCHEMA = '0.2.0';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // Returns a list of problems (empty = usable). A null measure must carry a
  // reason, because the script never writes failures as 0 or blank.
  function checkStructure(r) {
    var p = [];
    if (!isObj(r)) { return ['The file is not a results file.']; }
    if (r.fileType !== RESULTS_TYPE) {
      if (r.fileType === 'cape-vr-session') { return ['This is a session file, not a Praat results file. Load“Load session…” for session files.']; }
      return ['This is not a CAPE-Vr Praat results file (fileType is "' + r.fileType + '").'];
    }
    if (typeof r.schemaVersion !== 'string') { p.push('schemaVersion is missing.'); }
    else if (S.compareVersions(r.schemaVersion, NEWEST_RESULTS_SCHEMA) > 0) {
      p.push('These results were written by a newer Praat script (format ' + r.schemaVersion + '). Please use the matching newer app.');
    }
    ['praatVersion', 'scriptVersion', 'runDate', 'speakerID', 'speakerProfile'].forEach(function (k) {
      if (typeof r[k] !== 'string') { p.push(k + ' is missing.'); }
    });
    if (!isObj(r.settings)) { p.push('settings is missing.'); }
    if (!isObj(r.analysisParameters)) { p.push('analysisParameters is missing.'); }
    if (!Array.isArray(r.files)) { p.push('files is missing.'); }
    else {
      r.files.forEach(function (f, i) {
        var where = 'files[' + i + ']';
        if (!isObj(f) || typeof f.fileName !== 'string' || typeof f.task !== 'string' || typeof f.status !== 'string') {
          p.push(where + ' is incomplete.');
          return;
        }
        if (!isObj(f.measures)) { p.push(f.fileName + ': measures is missing.'); return; }
        Object.keys(f.measures).forEach(function (k) {
          var m = f.measures[k];
          if (!isObj(m) || !('value' in m) || (m.value !== null && typeof m.value !== 'number')) {
            p.push(f.fileName + ': measure ' + k + ' is not in the expected form.');
          }
          if (isObj(m) && m.value === null && typeof m.reason !== 'string') {
            p.push(f.fileName + ': measure ' + k + ' is missing but has no reason.');
          }
        });
      });
    }
    ['unrecognizedFiles', 'missingTasks', 'warnings'].forEach(function (k) {
      if (!Array.isArray(r[k])) { p.push(k + ' is missing.'); }
    });
    return p;
  }

  // Returns warnings only; the import still happens.
  function checkMatch(session, r) {
    var w = [];
    var sid = r.settings && r.settings.sessionId;
    if (!sid) {
      w.push('These results are not linked to a session (the Praat script was run without the app’s settings file, or with an older one), so it cannot be confirmed that they belong to this session.');
    } else if (sid !== session.sessionId) {
      w.push('These results were made from a package exported by a DIFFERENT session. Check that you imported the right results.json.');
    }
    var myId = window.CapeUpload.effectiveSpeakerId(session);
    if (myId && r.speakerID !== myId) {
      w.push('Speaker ID in the results is "' + r.speakerID + '", but this session uses "' + myId + '".');
    }
    if (session.audio.speakerProfile && r.speakerProfile !== session.audio.speakerProfile) {
      w.push('Speaker profile in the results is "' + r.speakerProfile + '", but this session is set to "' + session.audio.speakerProfile + '".');
    }
    var le = session.audio.lastExport;
    if (le && Array.isArray(le.files)) {
      var exported = le.files.map(function (f) { return f.exportName; });
      var inResults = r.files.map(function (f) { return f.fileName; });
      var missing = exported.filter(function (n) { return inResults.indexOf(n) === -1; });
      var extra = inResults.filter(function (n) { return exported.indexOf(n) === -1; });
      if (missing.length) { w.push('Exported but not in the results: ' + missing.join(', ') + '.'); }
      if (extra.length) { w.push('In the results but not in the last exported package: ' + extra.join(', ') + '.'); }
    }
    if (S.compareVersions(r.praatVersion.replace(/[^0-9.]/g, ''), '7.0.02') < 0) {
      w.push('The analysis was run in an older Praat (' + r.praatVersion + ') than the tested version (7.0.02).');
    }
    return w;
  }

  function importText(text, fileName) {
    var session = app.getSession();
    var r;
    try { r = JSON.parse(text); } catch (e) {
      app.showMessage('error', 'Could not import ' + fileName, ['The file could not be read as JSON.']);
      return false;
    }
    var problems = checkStructure(r);
    if (problems.length) {
      app.showMessage('error', 'Could not import ' + fileName, problems);
      return false;
    }
    var warnings = checkMatch(session, r);
    var replacing = !!session.acoustics;
    session.acoustics = {
      importedAt: S.isoNow(),
      sourceFileName: fileName,
      results: r,
      importWarnings: warnings
    };
    app.markDirty();
    app.render();
    app.showMessage(warnings.length ? 'warning' : 'info',
      (replacing ? 'Replaced the acoustic results with ' : 'Imported ') + fileName +
        (warnings.length ? ', with warnings:' : '.'),
      warnings.length ? warnings : ['Please save the session to keep the results in the session file.']);
    return true;
  }

  // ---------------------------------------------------------------------
  // The acoustic results panel
  // ---------------------------------------------------------------------

  function render() {
    if (!app) { return; }
    var session = app.getSession();
    var status = document.getElementById('acoustics-status');
    var warnBox = document.getElementById('acoustics-warnings');
    var out = document.getElementById('acoustics-results');
    warnBox.innerHTML = '';
    out.innerHTML = '';

    var ac = session.acoustics;
    if (!ac) {
      status.textContent = 'No results imported yet. After running the Praat package, import its results.json here.';
      return;
    }
    var r = ac.results;
    status.textContent = 'Imported ' + ac.sourceFileName + ' on ' + S.formatTime(ac.importedAt) + ': ' +
      r.files.length + ' file(s), analyzed in Praat ' + r.praatVersion + '.';
    if (ac.importWarnings && ac.importWarnings.length) {
      var ul = document.createElement('ul');
      ul.className = 'import-warnings';
      ac.importWarnings.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
      warnBox.appendChild(ul);
    }

    out.appendChild(window.CapeReport.buildAcousticTables(session, { deidentify: false }));
  }

  function init(shared) {
    app = shared;
    var input = document.getElementById('results-input');
    document.getElementById('btn-import').addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) { return; }
      var reader = new FileReader();
      reader.onload = function () { importText(String(reader.result), file.name); };
      reader.onerror = function () { app.showMessage('error', 'Could not read ' + file.name, ['The browser could not read the file.']); };
      reader.readAsText(file);
    });
  }

  window.CapeImport = {
    init: init,
    render: render,
    importText: importText,
    _checkStructure: checkStructure
  };
})();
