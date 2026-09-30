/*
 * export.js: the Praat package ZIP and the CSV export.
 *
 * The package holds the WAVs renamed to CAPE-Vr task names (originals are
 * untouched), cape_settings.tsv, cape_acoustics.praat (embedded in
 * js/praat_script.js) and README.txt.
 *
 * The ZIP is hand-written to avoid a vendored library. Entries are "stored"
 * (uncompressed): every unzip tool opens that, and WAV audio barely
 * compresses anyway.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var U = window.CapeUpload;
  var app = null;

  // ---------------------------------------------------------------------
  // cape_settings.tsv: a two-column name<TAB>value table.
  // Setting names must match what cape_acoustics.praat reads (listed in its header).
  // ---------------------------------------------------------------------

  function buildSettingsTsv(session) {
    var a = session.audio, adv = a.advanced;
    var ov = U.overrides(session);
    var rows = [
      ['schemaVersion', '0.1.0'],
      ['appVersion', S.APP_VERSION],
      ['createdAt', S.isoNow()],
      ['sessionId', session.sessionId],
      ['speakerID', U.effectiveSpeakerId(session)],
      ['speakerProfile', a.speakerProfile],
      ['pitchFloorHz', String(a.pitchFloorHz)],
      ['pitchCeilingHz', String(a.pitchCeilingHz)],
      ['pitchOverridden', ov.pitch ? 'yes' : 'no'],
      ['formantCeilingHz', String(a.formantCeilingHz)],
      ['formantOverridden', ov.formant ? 'yes' : 'no'],
      ['formantCount', String(adv.formantCount)],
      ['vowelWindowSec', String(adv.vowelWindowSec)],
      ['vowelShortFraction', String(adv.vowelShortFraction)],
      ['formantWindow', adv.formantWindow],
      ['cppsMethod', adv.cppsMethod],
      ['cppsSpeechVoicedOnly', adv.cppsSpeechVoicedOnly],
      ['intensitySpeechVoicedOnly', adv.intensitySpeechVoicedOnly],
      ['intensityAveraging', adv.intensityAveraging],
      ['hnrMethod', adv.hnrMethod],
      ['periodRangeMode', adv.periodRangeMode],
      ['jitterMeasures', adv.jitterMeasures.join(',')],
      ['shimmerMeasures', adv.shimmerMeasures.join(',')],
      ['channelHandling', adv.channelHandling]
    ];
    // Values never contain tabs or line breaks (they are ids and numbers),
    // but remove them just in case, so the table stays valid.
    return 'name\tvalue\n' + rows.map(function (r) {
      return r[0] + '\t' + String(r[1]).replace(/[\t\r\n]+/g, ' ');
    }).join('\n') + '\n';
  }

  // ---------------------------------------------------------------------
  // README.txt
  // ---------------------------------------------------------------------

  function buildReadme(session, plan, folder) {
    var lines = [
      'CAPE-Vr acoustic analysis package',
      '=================================',
      '',
      'Made by the CAPE-Vr Clinical Acoustic Reporting Tool (CART) v' + S.APP_VERSION + ' on ' + S.isoNow() + '.',
      'Speaker ID: ' + U.effectiveSpeakerId(session) + '    Speaker profile: ' + session.audio.speakerProfile,
      'Praat script version: ' + window.CAPE_PRAAT_SCRIPT.version,
      '',
      'HOW TO RUN',
      '  1. Unzip this package. Keep all files together in the folder "' + folder + '".',
      '  2. Open Praat (tested with version 7.0.02).',
      '  3. Praat menu > Open Praat script...  and choose cape_acoustics.praat in this folder.',
      '  4. In the script window: Run > Run.',
      '     Praat may ask whether you trust this script. That is Praat\'s own security',
      '     check. This script only reads the files in this folder and writes one file,',
      '     results.json, into this folder. It does not change, move, or delete any file.',
      '  5. When the Info window says "Done", results.json is in this folder.',
      '     Import results.json into the CAPE-Vr tool to make the report.',
      '',
      'Do not rename the WAV files: the script finds each task from its file name.',
      '',
      'FILES (original name -> name in this package)'
    ];
    plan.forEach(function (p) {
      lines.push('  ' + p.entry.originalName + '  ->  ' + p.exportName);
    });
    lines.push('');
    lines.push('cape_settings.tsv holds the analysis settings. They are copied into results.json,');
    lines.push('and the report\'s methods paragraph lists them.');
    lines.push('');
    lines.push('PRIVACY: this folder contains voice recordings and may contain identifying');
    lines.push('information. Store and share it according to your organization\'s policies.');
    lines.push('');
    lines.push('NOTE: ' + window.CapeNotices.ACOUSTIC_SHORT);
    return lines.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------------
  // A small ZIP writer (stored entries, no compression)
  // ---------------------------------------------------------------------

  // ZIP requires a standard CRC-32 (reflected polynomial 0xEDB88320) per entry.
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) { c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Date and time in the old MS-DOS format that ZIP uses.
  function dosDateTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  // entries: [{ name: 'folder/file.wav', data: Blob or string }]
  // Returns a Promise of a Blob (application/zip).
  function buildZip(entries) {
    var enc = new TextEncoder();
    var dt = dosDateTime(new Date());
    var parts = [], central = [], offset = 0;

    function header(size) { var b = new Uint8Array(size); return { bytes: b, view: new DataView(b.buffer) }; }

    return entries.reduce(function (chain, e) {
      return chain.then(function () {
        var blob = typeof e.data === 'string' ? new Blob([e.data]) : e.data;
        return blob.arrayBuffer().then(function (buf) {
          var data = new Uint8Array(buf);
          var name = enc.encode(e.name);
          var crc = crc32(data);
          // No ZIP64 support, so sizes and offsets must fit in 32 bits.
          if (data.length >= 0xFFFFFFFF || offset >= 0xFFFFFFFF) {
            throw new Error('The package would be larger than 4 GB, which this tool cannot write.');
          }

          // Local file header
          var h = header(30);
          h.view.setUint32(0, 0x04034b50, true);
          h.view.setUint16(4, 20, true);        // version needed
          h.view.setUint16(6, 0x0800, true);    // flag: file names are UTF-8
          h.view.setUint16(8, 0, true);         // method: stored
          h.view.setUint16(10, dt.time, true);
          h.view.setUint16(12, dt.date, true);
          h.view.setUint32(14, crc, true);
          h.view.setUint32(18, data.length, true);
          h.view.setUint32(22, data.length, true);
          h.view.setUint16(26, name.length, true);
          h.view.setUint16(28, 0, true);
          parts.push(h.bytes, name, blob);

          // Central directory entry (written at the end)
          var c = header(46);
          c.view.setUint32(0, 0x02014b50, true);
          c.view.setUint16(4, 20, true);        // made by
          c.view.setUint16(6, 20, true);        // version needed
          c.view.setUint16(8, 0x0800, true);
          c.view.setUint16(10, 0, true);
          c.view.setUint16(12, dt.time, true);
          c.view.setUint16(14, dt.date, true);
          c.view.setUint32(16, crc, true);
          c.view.setUint32(20, data.length, true);
          c.view.setUint32(24, data.length, true);
          c.view.setUint16(28, name.length, true);
          c.view.setUint32(42, offset, true);   // where the local header starts
          central.push(c.bytes, name);

          offset += 30 + name.length + data.length;
        });
      });
    }, Promise.resolve()).then(function () {
      var centralSize = central.reduce(function (n, b) { return n + b.length; }, 0);
      var end = header(22);
      end.view.setUint32(0, 0x06054b50, true);
      end.view.setUint16(8, entries.length, true);
      end.view.setUint16(10, entries.length, true);
      end.view.setUint32(12, centralSize, true);
      end.view.setUint32(16, offset, true);
      return new Blob(parts.concat(central, [end.bytes]), { type: 'application/zip' });
    });
  }

  // ---------------------------------------------------------------------
  // Export: check, confirm, build, download
  // ---------------------------------------------------------------------

  function openDialog(session, check, plan, onConfirm) {
    var dialog = document.getElementById('export-dialog');
    var body = document.getElementById('export-dialog-body');
    body.innerHTML = '';

    function add(tag, text, cls) {
      var e = document.createElement(tag);
      if (cls) { e.className = cls; }
      e.textContent = text;
      body.appendChild(e);
      return e;
    }

    add('p', 'Speaker ID ' + U.effectiveSpeakerId(session) + ', profile ' + session.audio.speakerProfile +
      ' (pitch ' + session.audio.pitchFloorHz + '–' + session.audio.pitchCeilingHz + ' Hz, formant ceiling ' +
      session.audio.formantCeilingHz + ' Hz).');
    add('p', 'Please check the task of each file:', 'strong');
    var table = document.createElement('table');
    table.className = 'export-table';
    table.innerHTML = '<thead><tr><th>Original file</th><th>Task</th><th>Name in package</th></tr></thead>';
    var tb = document.createElement('tbody');
    plan.forEach(function (p) {
      var tr = document.createElement('tr');
      [p.entry.originalName, taskLabel(p.entry.task) + (p.entry.taskSuggested ? ' (suggested)' : ''), p.exportName]
        .forEach(function (t) { var td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    table.appendChild(tb);
    body.appendChild(table);

    if (check.warnings.length) {
      add('p', 'Warnings (you can still export):', 'strong');
      var ul = document.createElement('ul');
      check.warnings.forEach(function (w) { var li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
      body.appendChild(ul);
    }

    var ok = document.getElementById('export-confirm');
    var cancel = document.getElementById('export-cancel');
    function close() { ok.onclick = null; cancel.onclick = null; dialog.close(); }
    ok.onclick = function () { close(); onConfirm(); };
    cancel.onclick = close;
    dialog.showModal();
  }

  function taskLabel(id) {
    var t = U.TASKS.filter(function (x) { return x[0] === id; })[0];
    return t ? t[1] : id;
  }

  function exportPackage() {
    var session = app.getSession();
    var check = U.validate(session);
    if (check.errors.length) {
      app.showMessage('error', 'The Praat package cannot be made yet. Please fix:', check.errors);
      document.getElementById('module-acoustic').open = true;
      document.getElementById('recordings').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    // Excluded takes have no exportName and are left out of the package.
    var plan = U.planNames(session).filter(function (p) { return p.exportName; });
    openDialog(session, check, plan, function () { build(session, plan); });
  }

  function build(session, plan) {
    var id = U.effectiveSpeakerId(session);
    var folder = id + '_praat_package';
    var entries = plan.map(function (p) {
      return { name: folder + '/' + p.exportName, data: U.getFile(p.entry) };
    });
    entries.push({ name: folder + '/cape_settings.tsv', data: buildSettingsTsv(session) });
    entries.push({ name: folder + '/cape_acoustics.praat', data: window.CAPE_PRAAT_SCRIPT.text });
    entries.push({ name: folder + '/README.txt', data: buildReadme(session, plan, folder) });

    var status = document.getElementById('export-summary');
    status.textContent = 'Making the package…';
    buildZip(entries).then(function (zip) {
      var name = folder + '.zip';
      var url = URL.createObjectURL(zip);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 10000);

      // The original -> exported name mapping is needed later to match
      // results.json back to the session's files.
      session.audio.lastExport = {
        at: S.isoNow(),
        packageName: name,
        scriptVersion: window.CAPE_PRAAT_SCRIPT.version,
        files: plan.map(function (p) { return { id: p.entry.id, originalName: p.entry.originalName, exportName: p.exportName, task: p.entry.task, take: p.take }; })
      };
      session.audio.files.forEach(function (f) { f.taskSuggested = false; });
      app.markDirty();
      app.render();
      app.showMessage('info', 'Praat package downloaded: ' + name, [
        'Unzip it, open cape_acoustics.praat in Praat, and choose Run > Run. results.json will appear in the same folder.',
        'Please also save the session (Save), so it records which file went into the package.'
      ]);
    }).catch(function (err) {
      app.showMessage('error', 'The package could not be made.', [err.message]);
      app.render();
    });
  }

  // ---------------------------------------------------------------------
  // CSV export: one row per evaluation, snake_case headers so many CSVs can
  // be combined later. Acoustic columns appear once results are imported.
  // Values are as Praat reported them; the only numbers the app
  // adds are clinician-chosen means, labeled as such. Missing/undefined
  // values are written empty, never 0, so they cannot be mistaken for data.
  // ---------------------------------------------------------------------

  function csvCell(v) {
    if (v === null || v === undefined) { return ''; }
    var s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

  function buildCsv(session, deidentify) {
    var cols = [], vals = [];
    function put(name, value) { cols.push(name); vals.push(value); }
    function choice(list, v) {
      var ids = Array.isArray(v) ? v : (v ? [v] : []);
      return ids.join(';');
    }
    var h = session.header, rc = session.recordingConditions, st = session.stimuli, rt = session.ratingConditions;
    var v = session.vas, d = session.descriptive, inc = session.inconsistencies;

    put('session_id', session.sessionId);
    put('app_version', S.APP_VERSION);
    put('csv_created_at', S.isoNow());
    // "names_hidden": selected identifying fields are left empty. This is
    // not a full de-identification (dates, age, gender, free text remain).
    put('names_hidden', deidentify ? 'yes' : 'no');
    // A speaker code made from Name/ID would reveal the name, so it is hidden too.
    function mask(s) { return deidentify ? U.maskName(session, s) : s; }
    put('speaker_code', deidentify ? U.hiddenCode(session) : U.effectiveSpeakerId(session));
    put('name_or_id', deidentify ? '' : h.nameOrId);
    put('gender', h.gender);
    put('age', h.age);
    put('examiner', deidentify ? '' : h.examiner);
    put('recording_date', h.recordingDate);
    put('audio_recorded', rc.audioRecorded);
    put('session_mode', rc.sessionMode);
    put('environment', rc.environment);
    put('recording_device', rc.recordingDevice);
    put('mouth_to_mic_cm', rc.mouthToMicCm);
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach(function (x, i) { put('sentence_' + x + '_modeled', st.examinerModeled['sentence_' + (i + 1)] ? 'yes' : 'no'); });
    put('extemp_prompt_used', st.extempPromptUsed);
    put('reading_passage', st.readingPassage);
    put('rating_source', rt.ratingSource);
    put('playback', rt.playback);
    put('auditory_anchors', rt.auditoryAnchors);
    put('rater', deidentify ? '' : rt.rater);
    put('rating_date', rt.ratingDate);
    put('times_played', rt.timesPlayed);
    put('overall_severity', v.overallSeverity);
    put('roughness', v.roughness);
    put('breathiness', v.breathiness);
    put('strain', v.strain);
    put('extra_attribute_label', v.extra.label);
    put('extra_attribute_score', v.extra.score);
    // Attributes added with "+ Add attribute", numbered in form order.
    (v.additional || []).forEach(function (a, i) {
      put('additional_attribute_' + (i + 1) + '_label', a.label);
      put('additional_attribute_' + (i + 1) + '_score', a.score);
    });
    ['pitch', 'loudness', 'resonance', 'nasality'].forEach(function (k) {
      put(k, choice(k, d[k].selected));
      put(k + '_comment', d[k].comment);
    });
    put('inconsistencies', inc.status);
    put('inconsistencies_vowels', inc.vowels);
    put('inconsistencies_sentences', inc.sentences);
    put('inconsistencies_extemporaneous', inc.extemporaneous);
    put('instabilities', choice('instabilities', session.instabilities.selected));
    put('instabilities_other', session.instabilities.other);
    put('additional_features', choice('features', session.additionalFeatures.selected));
    put('additional_features_other', session.additionalFeatures.other);
    put('overall_impression', session.overallImpression);

    put('acoustics_included', session.acoustics ? 'yes' : 'no (not imported)');
    if (session.acoustics) {
      var r = session.acoustics.results;
      var ap = r.analysisParameters || {};
      put('praat_version', r.praatVersion);
      put('praat_script_version', r.scriptVersion);
      put('praat_run_date', r.runDate);
      put('speaker_profile', r.speakerProfile);
      put('pitch_floor_hz', ap.pitchFloorHz);
      put('pitch_ceiling_hz', ap.pitchCeilingHz);
      put('formant_ceiling_hz', ap.formantCeilingHz);
      put('cpps_method', ap.cppsMethod);
      var originals = {};
      ((session.audio.lastExport || {}).files || []).forEach(function (f) { originals[f.exportName] = f.originalName; });
      var M = window.CapeSummary.MEASURES;
      r.files.slice().sort(function (a, b2) {
        var order = U.TASKS.map(function (t) { return t[0]; });
        return (order.indexOf(a.task) - order.indexOf(b2.task)) || (a.take - b2.take);
      }).forEach(function (f) {
        var p = f.task + '_t' + f.take + '_';
        put(p + 'file', mask(f.fileName));
        put(p + 'original_file', deidentify ? '' : (originals[f.fileName] || ''));
        put(p + 'status', f.status);
        var exclusion = U.exclusionForResult(session, f.fileName);
        put(p + 'excluded', exclusion ? 'yes' : 'no');
        put(p + 'excluded_reason', exclusion ? exclusion.reason : '');
        put(p + 'duration_s', f.durationSec);
        put(p + 'analysis_start_s', f.analysisStartSec);
        put(p + 'analysis_end_s', f.analysisEndSec);
        if (f.voicedDurationSec !== undefined) { put(p + 'voiced_duration_s', f.voicedDurationSec); }
        M.forEach(function (m) {
          var x = f.measures && f.measures[m.key];
          if (!x) { return; }
          put(p + m.csv, x.value === null ? '' : Number(x.value).toFixed(m.dec));
        });
      });
    }

    // The rules as they were applied. A rule is active once it is filled in;
    // "none" means it was left empty.
    var rules = window.CapeRules.ensure(session);
    function rangesText(holder) {
      return holder.ranges.filter(function (x) { return x.min !== null && x.max !== null && x.label; })
        .map(function (x) { return x.min + '-' + x.max + ':' + x.label; }).join('|') || 'none';
    }
    put('rules_name', rules.name);
    put('rules_saved_at', rules.savedAt);
    put('rule_severity_ranges', rangesText(rules.severity));
    put('rule_descriptor_ranges', rangesText(rules.descriptors));
    put('rule_feature_ranking', rules.ranking.minScore !== null
      ? 'ranks ' + rules.ranking.maxRanks + '; min score ' + rules.ranking.minScore + '; tie margin ' + (rules.ranking.tieMargin || 0) : 'none');
    put('rule_reference_values', rules.references.filter(function (x) { return !window.CapeRules.referenceProblem(x); }).map(function (x) {
      return x.id + ' ' + x.condition + ' ' + x.value;
    }).join('|') || 'none');

    var c = window.CapeSummary.compute(session);
    put('severity_category', c.severity ? c.severity.label : '');
    ['primary', 'secondary', 'tertiary'].forEach(function (name, i) {
      put(name + '_feature', c.ranks[i] ? c.ranks[i].attrs.map(function (a) { return a.label.toLowerCase(); }).join(';') : '');
    });
    put('attribute_descriptors', c.descriptors.map(function (d) { return d.attrLabel.toLowerCase() + ':' + d.label; }).join(';'));
    c.items.forEach(function (it) {
      var col = 'summary_' + window.CapeSummary.MEASURES.filter(function (m) { return m.key === it.measure; })[0].csv + '_' + slug(it.key);
      put(col, it.value === null ? '' : Number(it.value).toFixed(it.dec));
      if (it.isMean) { put(col + '_n', it.n); }
    });
    // Every statement the rules produced, and those left ticked (included
    // in the Clinical Summary and EMR draft).
    put('rule_statements', c.bullets.map(function (x) { return x.text; }).join(' | '));
    put('rule_statements_included', c.bullets.filter(function (x) { return x.included; }).map(function (x) { return x.text; }).join(' | '));
    put('clinical_summary_text', session.documentation.summaryText);
    put('emr_text', session.documentation.emrText);

    // UTF-8 with a byte-order mark (so Excel reads accents correctly), CRLF lines.
    return '﻿' + cols.map(csvCell).join(',') + '\r\n' + vals.map(csvCell).join(',') + '\r\n';
  }

  function exportCsv() {
    var session = app.getSession();
    var deid = document.getElementById('csv-deidentify').checked;
    var text = buildCsv(session, deid);
    var id = (deid ? U.hiddenCode(session) : U.effectiveSpeakerId(session)) || 'session';
    var name = id + '_capevr_' + S.isoNow().slice(0, 10) + (deid ? '_names-hidden' : '') + '.csv';
    var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    // Completes step 3 on the progress bar (saved with the next save).
    if (!session.progress.csvExportedAt) { session.progress.csvExportedAt = S.isoNow(); }
    app.renderSteps();
  }

  function init(shared) {
    app = shared;
    document.getElementById('btn-export').addEventListener('click', exportPackage);
    document.getElementById('btn-csv').addEventListener('click', exportCsv);
    // Only a missing script is reported; the version is not shown.
    var v = document.getElementById('script-version');
    if (v) { v.textContent = window.CAPE_PRAAT_SCRIPT ? '' : 'Praat script missing'; }
  }

  window.CapeExport = {
    init: init,
    // exposed for testing in the browser console
    _buildSettingsTsv: buildSettingsTsv,
    _buildCsv: buildCsv,
    _buildZip: buildZip,
    _buildReadme: buildReadme,
    _crc32: crc32
  };
})();
