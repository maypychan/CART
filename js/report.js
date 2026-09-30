/*
 * report.js: the printable report.
 *
 * Part 1: the CAPE-Vr form (Figure 3), filled in from the session.
 * Part 2: the acoustic results from Praat (if imported) and a methods
 *         paragraph built ONLY from the Praat version and settings inside
 *         results.json.
 * Part 3: the Clinical Summary and EMR draft (each can be left out with a
 *         tick-box in the report toolbar).
 *
 * The acoustic part makes no normative comparisons and uses no severity
 * words, colors, or interpretation: values are reported exactly as Praat
 * wrote them. A measure that failed is shown as "n/a" with the script's reason.
 *
 * Printed via the browser (Print / Save as PDF); print styles are in css/app.css.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var app = null;

  // ---------------------------------------------------------------------
  // Small DOM helpers
  // ---------------------------------------------------------------------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }
  function append(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) { continue; }
      parent.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return parent;
  }
  function blank(value, width) {
    // Mimics the paper form's fill-in line: the value, underlined.
    var s = el('span', 'r-fill' + (width ? ' w-' + width : ''), value === null || value === undefined || value === '' ? ' ' : String(value));
    return s;
  }
  // Options printed in a row; the chosen ones are circled, as on paper.
  function optionsRow(listName, chosen) {
    var chosenList = Array.isArray(chosen) ? chosen : (chosen ? [chosen] : []);
    var wrap = el('span', 'r-opts');
    S.OPTIONS[listName].forEach(function (o, i) {
      if (i > 0) { wrap.appendChild(document.createTextNode(' ')); }
      var on = chosenList.indexOf(o[0]) !== -1;
      var span = el('span', 'r-opt' + (on ? ' is-on' : ''), o[1]);
      if (on) { span.setAttribute('aria-label', o[1] + ' (selected)'); }
      wrap.appendChild(span);
    });
    return wrap;
  }
  function labelOf(listName, id) {
    var o = (S.OPTIONS[listName] || []).filter(function (x) { return x[0] === id; })[0];
    return o ? o[1] : id;
  }

  // ---------------------------------------------------------------------
  // Part 1: the CAPE-Vr form, filled in
  // ---------------------------------------------------------------------

  var SENTENCES = [
    ['a', 'The blue spot is on the key again.'], ['b', 'He helped her hurry home.'],
    ['c', 'We were away a year ago.'], ['d', 'I eat eggs every evening.'],
    ['e', 'My mama makes lemon muffins.'], ['f', 'Papa took a piece of the cake.']
  ];

  function vasRow(label, score) {
    var row = el('div', 'r-vas-row');
    row.appendChild(el('span', 'r-vas-label', label));
    var line = el('span', 'r-vas-line');
    if (score !== null && score !== undefined) {
      var tick = el('span', 'r-vas-tick');
      tick.style.left = score + 'mm';        // line is 100 mm, as on paper, so 1 point = 1 mm
      line.appendChild(tick);
    }
    row.appendChild(line);
    row.appendChild(el('span', 'r-vas-score', (score === null || score === undefined ? '___' : String(score)) + ' /100'));
    return row;
  }

  function buildForm(session, opts) {
    var s = session;
    var form = el('section', 'r-form');
    form.appendChild(el('h1', 'r-title', 'Consensus Auditory-Perceptual Evaluation of Voice – Revised (CAPE-Vr)'));
    form.appendChild(el('p', 'r-adapted', 'Form adapted from Kempster, Nagle & Solomon (2025), J Voice, CC BY 4.0. Completed electronically.'));

    var nameOrId = opts.deidentify ? opts.speakerCode : s.header.nameOrId;
    var examiner = opts.removeStaff ? '[removed]' : s.header.examiner;
    var h = el('div', 'r-header');
    append(h, append(el('div'), el('b', null, 'Name/ID: '), blank(nameOrId, 'l')),
      append(el('div'), el('b', null, 'Gender: '), blank(s.header.gender, 's'), '  ', el('b', null, 'Age: '), blank(s.header.age, 's')),
      append(el('div'), el('b', null, 'Examiner: '), blank(examiner, 'l')),
      append(el('div'), el('b', null, 'Date: '), blank(s.header.recordingDate, 'm')));
    form.appendChild(h);

    var rc = s.recordingConditions;
    var box1 = el('div', 'r-box');
    box1.appendChild(el('div', 'r-box-title', 'Recording Conditions'));
    append(box1, append(el('div', 'r-line'),
      'Audio recorded: ', optionsRow('yesNo', rc.audioRecorded), '    ',
      optionsRow('sessionMode', rc.sessionMode), '    Environment: ', optionsRow('environment', rc.environment)));
    append(box1, append(el('div', 'r-line'),
      'Recording device/platform: ', blank(rc.recordingDevice, 'l'), '   Mouth-to-mic (cm): ', blank(rc.mouthToMicCm, 's')));
    form.appendChild(box1);

    var st = s.stimuli;
    var stim = el('div', 'r-stimuli');
    stim.appendChild(el('div', 'r-sub', 'Stimuli'));
    var showText = st.showStimulusText;
    append(stim, append(el('div', 'r-line'), el('b', null, 'Vowels: '),
      showText ? '/ɑ/ and /i/. Sustain each for 3–5 seconds; one or more productions in typical speaking voice.' : '/ɑ/ and /i/'));
    stim.appendChild(el('div', 'r-line', 'Sentences:'));
    var ol = el('ol', 'r-sentences');
    SENTENCES.forEach(function (x, i) {
      var li = el('li');
      li.appendChild(document.createTextNode(x[0] + '. ' + (showText ? x[1] : 'Sentence ' + x[0])));
      if (st.examinerModeled['sentence_' + (i + 1)]) { li.appendChild(el('span', 'r-modeled', ' ☑ examiner modeled')); }
      ol.appendChild(li);
    });
    stim.appendChild(ol);
    append(stim, append(el('div', 'r-line'), el('b', null, 'Extemporaneous Speech: '),
      showText ? '“Tell me about a place you have gone or would like to go.”' : 'standard prompt'));
    if (st.extempPromptUsed) {
      append(stim, append(el('div', 'r-line'), 'Prompt used instead: ', blank(st.extempPromptUsed, 'l')));
    }
    append(stim, append(el('div', 'r-line'), el('b', null, 'Reading Passage (optional): '), 'Specify: ', blank(st.readingPassage, 'l')));
    form.appendChild(stim);

    var rt = s.ratingConditions;
    var box2 = el('div', 'r-box');
    append(box2, append(el('div', 'r-line'), el('b', null, 'Rating Conditions: '),
      optionsRow('ratingSource', rt.ratingSource), '    ', optionsRow('playback', rt.playback),
      '    Auditory anchors: ', optionsRow('yesNo', rt.auditoryAnchors)));
    append(box2, append(el('div', 'r-line'),
      'Rater: ', blank(opts.removeStaff ? '[removed]' : rt.rater, 'm'), '   Date: ', blank(rt.ratingDate, 'm'),
      '   Number of times sample was played: ', blank(rt.timesPlayed, 's')));
    form.appendChild(box2);

    // Direction-only end labels; no severity bands or colors.
    var v = s.vas;
    var vas = el('div', 'r-vas');
    append(vas, append(el('div', 'r-vas-row r-vas-head'), el('span', 'r-vas-label'),
      append(el('span', 'r-vas-ends'), el('span', null, 'Normal'), el('span', null, 'Extreme')), el('span', 'r-vas-score')));
    vas.appendChild(vasRow('Overall Severity', v.overallSeverity));
    vas.appendChild(vasRow('Roughness', v.roughness));
    vas.appendChild(vasRow('Breathiness', v.breathiness));
    vas.appendChild(vasRow('Strain', v.strain));
    vas.appendChild(vasRow(v.extra.label || '________', v.extra.score));
    // Attributes added with "+ Add attribute" (not on the paper form).
    (v.additional || []).forEach(function (a) { vas.appendChild(vasRow(a.label || '________', a.score)); });
    form.appendChild(vas);

    var d = s.descriptive;
    var desc = el('div', 'r-desc');
    [['Pitch', 'pitch'], ['Loudness', 'loudness'], ['Resonance', 'resonance'], ['Nasality', 'nasality']].forEach(function (x) {
      append(desc, append(el('div', 'r-desc-row'), el('b', 'r-desc-label', x[0] + ':'),
        optionsRow(x[1], d[x[1]].selected), append(el('span', 'r-desc-comment'), 'Comment: ', blank(d[x[1]].comment, 'l'))));
    });
    form.appendChild(desc);

    var inc = s.inconsistencies;
    var rest = el('div', 'r-rest');
    append(rest, append(el('div', 'r-line'), el('b', null, 'Inconsistencies: '), optionsRow('inconsistency', inc.status), ' (describe):'));
    append(rest, append(el('div', 'r-line'), el('i', null, 'Vowels: '), blank(inc.vowels, 'xl')));
    append(rest, append(el('div', 'r-line'), el('i', null, 'Sentences: '), blank(inc.sentences, 'xl')));
    append(rest, append(el('div', 'r-line'), el('i', null, 'Extemporaneous speech: '), blank(inc.extemporaneous, 'xl')));
    append(rest, append(el('div', 'r-line'), el('b', null, 'Instabilities: '), optionsRow('instabilities', s.instabilities.selected),
      '  other: ', blank(s.instabilities.other, 'm')));
    append(rest, append(el('div', 'r-line'), el('b', null, 'Additional features: '), optionsRow('features', s.additionalFeatures.selected)));
    append(rest, append(el('div', 'r-line'), 'other: ', blank(s.additionalFeatures.other, 'xl')));
    append(rest, append(el('div', 'r-line r-impression'), el('b', null, 'Overall Impression: '), blank(s.overallImpression, 'xl')));
    form.appendChild(rest);
    return form;
  }

  // ---------------------------------------------------------------------
  // Part 2: acoustic results (tables are also used on screen by import.js)
  // ---------------------------------------------------------------------

  var MEASURE_LABELS = {
    f0Mean: 'F0 mean', f0SD: 'F0 SD', intensityMean: 'Intensity mean', cpps: 'CPPS', hnr: 'HNR',
    jitterLocal: 'Jitter (local)', jitterLocalAbsolute: 'Jitter (local, absolute)', jitterRap: 'Jitter (rap)',
    jitterPpq5: 'Jitter (ppq5)', jitterDdp: 'Jitter (ddp)',
    shimmerLocal: 'Shimmer (local)', shimmerLocalDb: 'Shimmer (local)', shimmerApq3: 'Shimmer (apq3)',
    shimmerApq5: 'Shimmer (apq5)', shimmerApq11: 'Shimmer (apq11)', shimmerDda: 'Shimmer (dda)',
    f1Mean: 'F1 mean', f1Median: 'F1 median', f1SD: 'F1 SD', f2Mean: 'F2 mean', f2Median: 'F2 median', f2SD: 'F2 SD',
    f3Mean: 'F3 mean', f3Median: 'F3 median', f3SD: 'F3 SD',
    f1Midpoint: 'F1 (midpoint)', f2Midpoint: 'F2 (midpoint)', f3Midpoint: 'F3 (midpoint)'
  };
  var MEASURE_ORDER = Object.keys(MEASURE_LABELS);

  // Decimals as written by the Praat script (see its @addMeasure calls).
  // Reading JSON drops trailing zeros ("202.00" becomes 202), so they are put
  // back for display. This only formats Praat's value; nothing is recalculated.
  function decimalsFor(key, unit) {
    if (key === 'jitterLocalAbsolute') { return 8; }
    if (key === 'shimmerLocalDb') { return 3; }
    if (unit === '%') { return 3; }
    return 2;
  }
  function fmt(value, decimals) {
    return (value === null || value === undefined) ? 'n/a' : Number(value).toFixed(decimals);
  }

  function taskLabel(id) {
    var t = window.CapeUpload.TASKS.filter(function (x) { return x[0] === id; })[0];
    return t ? t[1] : id;
  }

  // Original file names, from the last export ("S012_vowel_a.wav" -> "ah.wav").
  function originalNames(session) {
    var map = {};
    var le = session.audio && session.audio.lastExport;
    if (le && Array.isArray(le.files)) { le.files.forEach(function (f) { map[f.exportName] = f.originalName; }); }
    return map;
  }

  // Footnotes for "n/a" values: the same reason gets the same number.
  function Notes() {
    var list = [];
    return {
      mark: function (reason) {
        var i = list.indexOf(reason);
        if (i === -1) { list.push(reason); i = list.length - 1; }
        return i + 1;
      },
      render: function () {
        if (!list.length) { return null; }
        var ol = el('ol', 'r-footnotes');
        list.forEach(function (r) { ol.appendChild(el('li', null, 'n/a: ' + r)); });
        return ol;
      }
    };
  }

  function valueCell(key, m, notes) {
    var td = el('td', 'num');
    if (!m) { td.textContent = '—'; td.title = 'not measured for this task'; return td; }
    if (m.value === null || m.value === undefined) {
      td.appendChild(document.createTextNode('n/a'));
      td.appendChild(el('sup', null, String(notes.mark(m.reason || 'no reason given'))));
    } else {
      td.textContent = fmt(m.value, decimalsFor(key, m.unit));
    }
    return td;
  }

  function fileLabel(f, opts, originals) {
    var wrap = el('span');
    wrap.appendChild(el('span', 'r-file', opts.mask(f.fileName)));
    if (!opts.deidentify && originals[f.fileName]) {
      wrap.appendChild(el('span', 'r-orig', ' (original: ' + originals[f.fileName] + ')'));
    }
    var ex = opts.exclusion ? opts.exclusion(f.fileName) : null;
    if (ex) {
      wrap.appendChild(el('div', 'r-excluded', 'Excluded by the clinician' + (ex.reason ? ': ' + ex.reason : '') + '. Not used in summaries.'));
    }
    return wrap;
  }

  function fmtRange(a, b) {
    return (a === null || a === undefined) ? 'n/a' : fmt(a, 3) + '–' + fmt(b, 3);
  }

  // Vowels and connected speech get separate tables: their measure sets
  // differ and their values must never be averaged together.
  // Vowels: one column per file (take), one row per measure.
  function vowelTables(results, opts, originals, notes) {
    var files = results.files.filter(function (f) { return f.task === 'vowel_a' || f.task === 'vowel_i'; });
    if (!files.length) { return null; }
    var wrap = el('div');
    wrap.appendChild(el('h3', 'r-h3', 'Sustained vowels'));
    for (var start = 0; start < files.length; start += 4) {
      var group = files.slice(start, start + 4);
      var keys = MEASURE_ORDER.filter(function (k) { return group.some(function (f) { return f.measures && f.measures[k]; }); });
      var table = el('table', 'r-table');
      var head = el('tr');
      head.appendChild(el('th', null, 'Measure'));
      group.forEach(function (f) {
        var th = el('th');
        append(th, el('div', null, taskLabel(f.task) + ', take ' + f.take), fileLabel(f, opts, originals));
        head.appendChild(th);
      });
      append(table, append(el('thead'), head));
      var body = el('tbody');

      function infoRow(label, fn) {
        var tr = el('tr', 'r-info-row');
        tr.appendChild(el('th', null, label));
        group.forEach(function (f) { tr.appendChild(el('td', 'num', fn(f))); });
        body.appendChild(tr);
      }
      infoRow('Duration (s)', function (f) { return fmt(f.durationSec, 3); });
      infoRow('Voiced part (s)', function (f) { return fmtRange(f.voicedOnsetSec, f.voicedOffsetSec); });
      infoRow('Analysis window (s)', function (f) { return fmtRange(f.analysisStartSec, f.analysisEndSec); });

      keys.forEach(function (k) {
        var unit = '';
        group.some(function (f) { if (f.measures && f.measures[k]) { unit = f.measures[k].unit; return true; } return false; });
        var tr = el('tr');
        tr.appendChild(el('th', null, MEASURE_LABELS[k] + (unit ? ' (' + unit + ')' : '')));
        group.forEach(function (f) {
          if (f.status === 'error') {
            var td = el('td', 'num', 'n/a');
            td.appendChild(el('sup', null, String(notes.mark(f.errorReason || 'the file could not be analyzed'))));
            tr.appendChild(td);
          } else {
            tr.appendChild(valueCell(k, f.measures && f.measures[k], notes));
          }
        });
        body.appendChild(tr);
      });
      table.appendChild(body);
      wrap.appendChild(table);
    }
    return wrap;
  }

  // Sentences, extemporaneous speech, reading: one row per file.
  function speechTable(results, opts, originals, notes) {
    var order = window.CapeUpload.TASKS.map(function (t) { return t[0]; });
    var files = results.files.filter(function (f) { return !(f.task === 'vowel_a' || f.task === 'vowel_i'); })
      .sort(function (a, b) { return (order.indexOf(a.task) - order.indexOf(b.task)) || (a.take - b.take); });
    if (!files.length) { return null; }
    var keys = ['f0Mean', 'f0SD', 'intensityMean', 'cpps'];
    var units = {};
    files.forEach(function (f) { keys.forEach(function (k) { if (f.measures && f.measures[k] && !units[k]) { units[k] = f.measures[k].unit; } }); });

    var wrap = el('div');
    wrap.appendChild(el('h3', 'r-h3', 'Sentences, extemporaneous speech, and reading'));
    var table = el('table', 'r-table');
    var head = el('tr');
    ['Task', 'File', 'Duration (s)', 'Voiced time analyzed (s)'].forEach(function (t) { head.appendChild(el('th', null, t)); });
    keys.forEach(function (k) { head.appendChild(el('th', null, MEASURE_LABELS[k] + (units[k] ? ' (' + units[k] + ')' : ''))); });
    append(table, append(el('thead'), head));
    var body = el('tbody');
    files.forEach(function (f) {
      var tr = el('tr');
      tr.appendChild(el('td', null, taskLabel(f.task) + (f.take > 1 || files.filter(function (x) { return x.task === f.task; }).length > 1 ? ', take ' + f.take : '')));
      append(tr, append(el('td'), fileLabel(f, opts, originals)));
      tr.appendChild(el('td', 'num', fmt(f.durationSec, 3)));
      tr.appendChild(el('td', 'num', fmt(f.voicedDurationSec, 3)));
      keys.forEach(function (k) {
        if (f.status === 'error') {
          var td = el('td', 'num', 'n/a');
          td.appendChild(el('sup', null, String(notes.mark(f.errorReason || 'the file could not be analyzed'))));
          tr.appendChild(td);
        } else {
          tr.appendChild(valueCell(k, f.measures && f.measures[k], notes));
        }
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    return wrap;
  }

  // Results tables + notes. Used by the report and by the on-screen panel.
  function buildAcousticTables(session, opts) {
    opts = Object.assign({ mask: function (s) { return s; } }, opts, {
      exclusion: function (name) { return window.CapeUpload.exclusionForResult(session, name); }
    });
    var results = session.acoustics.results;
    var originals = originalNames(session);
    var notes = Notes();
    var frag = el('div', 'r-acoustic-tables');
    var v = vowelTables(results, opts, originals, notes);
    var sp = speechTable(results, opts, originals, notes);
    if (v) { frag.appendChild(v); }
    if (sp) { frag.appendChild(sp); }
    if (!v && !sp) { frag.appendChild(el('p', null, 'The results file contains no analyzed recordings.')); }
    var fn = notes.render();
    if (fn) { frag.appendChild(fn); }

    var extra = [];
    if (results.missingTasks && results.missingTasks.length) {
      extra.push('No recording for: ' + results.missingTasks.map(taskLabel).join(', ') + '.');
    }
    if (results.unrecognizedFiles && results.unrecognizedFiles.length) {
      extra.push('Files not analyzed: ' + results.unrecognizedFiles.map(function (u) {
        return (opts.deidentify ? '(file)' : u.fileName) + ' (' + u.reason + ')';
      }).join('; ') + '.');
    }
    (results.warnings || []).forEach(function (w) { extra.push('Praat script note: ' + opts.mask(w)); });
    if (extra.length) {
      var ul = el('ul', 'r-notes');
      extra.forEach(function (t) { ul.appendChild(el('li', null, t)); });
      frag.appendChild(ul);
    }
    return frag;
  }

  // ---------------------------------------------------------------------
  // Methods paragraph: built ONLY from results.json (Praat version + settings)
  // ---------------------------------------------------------------------

  function buildMethods(results) {
    var ap = results.analysisParameters || {};
    var st = results.settings || {};
    var parts = [];
    function has(k) { return ap[k] !== undefined && ap[k] !== null; }

    parts.push('Acoustic measures were computed in Praat ' + results.praatVersion + ' (Boersma & Weenink) with the ' +
      'CAPE-Vr acoustics script, run on ' + String(results.runDate).replace('T', ' ') + '.');

    var profile = labelOf('profiles', results.speakerProfile);
    parts.push('Speaker profile: ' + profile + '; pitch floor ' + ap.pitchFloorHz + ' Hz and ceiling ' + ap.pitchCeilingHz + ' Hz' +
      (st.pitchOverridden === 'yes' ? ' (changed by the user from the profile defaults)' : '') +
      '; formant ceiling ' + ap.formantCeilingHz + ' Hz' + (st.formantOverridden === 'yes' ? ' (changed by the user)' : '') + '.');

    if (st.channelHandling) {
      parts.push('Stereo recordings were ' + (st.channelHandling === 'left' ? 'reduced to the left channel.' : 'converted to mono by averaging the channels.'));
    }

    if (has('vowelWindowSec')) {
      parts.push('For sustained vowels, the voiced part of each recording was located with Praat voicing detection, and the middle ' +
        ap.vowelWindowSec + ' s of it was analyzed (the middle ' + Math.round(ap.vowelShortFraction * 100) +
        '% when the voiced part was shorter).');
    }

    parts.push('F0 (mean and SD over voiced frames) was obtained with the cross-correlation pitch method (' + ap.pitchCommand +
      '; voicing threshold ' + ap.pitchVoicingThreshold + ', silence threshold ' + ap.pitchSilenceThreshold +
      ', octave cost ' + ap.pitchOctaveCost + ', octave-jump cost ' + ap.pitchOctaveJumpCost +
      ', voiced/unvoiced cost ' + ap.pitchVoicedUnvoicedCost + ').');

    var voicedSpeech = 'For connected speech (sentences, extemporaneous speech, reading), voiced segments were identified by Praat ' +
      'voiced/unvoiced analysis of the glottal pulses and concatenated';
    var speechNotes = [];
    if (st.intensitySpeechVoicedOnly === 'yes') { speechNotes.push('mean intensity'); }
    if (st.cppsSpeechVoicedOnly === 'yes') { speechNotes.push('CPPS'); }
    if (speechNotes.length) { parts.push(voicedSpeech + ' before computing ' + speechNotes.join(' and ') + '.'); }

    parts.push('Mean intensity is reported in uncalibrated dB (relative level, not sound pressure level), averaged by ' +
      ap.intensityAveraging + '.');

    if (ap.cppsMethod === 'maryn_weenink_2015') {
      parts.push('CPPS followed the settings of Maryn and Weenink (2015): ' +
        (ap.cppsHighPassFilter && ap.cppsHighPassFilter !== 'none' ? 'high-pass filtering (' + ap.cppsHighPassFilter + '), ' : '') +
        'a power cepstrogram (pitch floor ' + ap.cepstrogramPitchFloorHz + ' Hz, time step ' + ap.cepstrogramTimeStepSec +
        ' s, maximum frequency ' + ap.cepstrogramMaxFrequencyHz + ' Hz, pre-emphasis from ' + ap.cepstrogramPreEmphasisHz +
        ' Hz), and smoothing of ' + ap.cppsTimeAveragingSec + ' s by ' + ap.cppsQuefrencyAveragingSec + ' s, peak search ' +
        ap.cppsPeakSearchMinHz + '–' + ap.cppsPeakSearchMaxHz + ' Hz, a ' + String(ap.cppsTrendType).toLowerCase() +
        ' trend line, and ' + String(ap.cppsFitMethod).toLowerCase() + ' fitting.' +
        ' Unlike the AVQI script of that paper, each task was analyzed separately and voiced segments of connected speech were found with Praat voiced/unvoiced analysis.');
    } else if (ap.cppsMethod) {
      parts.push('CPPS used the Praat defaults of Get CPPS (trend type ' + ap.cppsTrendType + ', fit method ' + ap.cppsFitMethod +
        ', smoothing ' + ap.cppsTimeAveragingSec + ' s by ' + ap.cppsQuefrencyAveragingSec + ' s), without high-pass filtering.');
    }

    // "local,local_db" -> "local, local dB"
    function measureList(s) {
      return String(s || '').split(',').filter(Boolean).map(function (x) {
        return { local_db: 'local dB', local_absolute: 'local absolute' }[x] || x;
      }).join(', ') || 'none';
    }
    var periods = Number(ap.hnrPeriodsPerWindow);
    parts.push('For sustained vowels, HNR was computed with To Harmonicity (' + ap.hnrMethod + '; ' + periods +
      (periods === 1 ? ' period' : ' periods') + ' per window). Jitter (' + measureList(st.jitterMeasures) + ') and shimmer (' +
      measureList(st.shimmerMeasures) +
      ') were computed from cross-correlation glottal pulses with a period range of ' + ap.shortestPeriodSec + '–' +
      ap.longestPeriodSec + ' s (' + (ap.periodRangeMode === 'derived' ? 'derived from the pitch range' : 'fixed') +
      '), maximum period factor ' + ap.maximumPeriodFactor + ', and maximum amplitude factor ' + ap.maximumAmplitudeFactor + '.');

    parts.push('Formants F1–F3 were estimated with the Burg method (' + ap.formantCount + ' formants below ' + ap.formantCeilingHz +
      ' Hz, window ' + ap.formantWindowLengthSec + ' s) and are reported as ' +
      (st.formantWindow === 'midpoint' ? 'values at the midpoint of the analysis window.' : 'the mean, median, and SD over the analysis window.'));
    parts.push('Measures that could not be computed are reported as not available, with the reason.');
    parts.push('Values are reported as computed; no normative comparison or interpretation is made.');
    return parts.join(' ');
  }

  // ---------------------------------------------------------------------
  // The whole report
  // ---------------------------------------------------------------------

  function currentOptions(session) {
    var deid = document.getElementById('report-deidentify').checked;
    var staff = document.getElementById('report-remove-staff').checked;
    return {
      deidentify: deid,
      removeStaff: staff,
      includeSummary: document.getElementById('report-include-summary').checked,
      includeEmr: document.getElementById('report-include-emr').checked,
      // With names hidden, a speaker code made from Name/ID is hidden too.
      speakerCode: window.CapeUpload.hiddenCode(session) || '[removed]',
      mask: deid ? function (s) { return window.CapeUpload.maskName(session, s); } : function (s) { return s; }
    };
  }

  // The Clinical Summary or EMR draft as it currently reads in the
  // Documentation area (generated, or as edited by the clinician).
  function docSection(title, text, notice) {
    var sec = el('section', 'r-doc');
    sec.appendChild(el('h2', 'r-h2', title));
    sec.appendChild(el('div', 'r-doc-text', text && text.trim() ? text : '(empty)'));
    sec.appendChild(el('p', 'r-smallprint', notice));
    return sec;
  }

  function buildReport(session, opts) {
    var root = el('div');
    root.appendChild(buildForm(session, opts));

    var ac = el('section', 'r-acoustics');
    ac.appendChild(el('h2', 'r-h2', 'Acoustic analysis (Praat)'));
    if (!session.acoustics) {
      ac.appendChild(el('p', null, 'No acoustic results have been imported.'));
    } else {
      var r = session.acoustics.results;
      ac.appendChild(el('p', 'r-meta', 'Speaker ID ' + opts.mask(r.speakerID) + ' · profile ' + labelOf('profiles', r.speakerProfile) +
        ' · analyzed ' + String(r.runDate).replace('T', ' ') + ' · imported ' + S.formatTime(session.acoustics.importedAt)));
      ac.appendChild(buildAcousticTables(session, opts));
      ac.appendChild(el('h3', 'r-h3', 'Methods'));
      ac.appendChild(el('p', 'r-methods', buildMethods(r)));
    }
    root.appendChild(ac);

    // The texts are shown as they read in the Documentation area; hiding
    // names in the report does not change them, so the clinician is warned.
    var d = session.documentation || {};
    if (opts.includeSummary) {
      root.appendChild(docSection('Clinical Summary', d.summaryText, window.CapeNotices.SUMMARY_SHORT));
    }
    if (opts.includeEmr) {
      root.appendChild(docSection('EMR Documentation Draft', d.emrText, window.CapeNotices.EMR_SHORT));
    }

    var foot = [];
    foot.push('Report made ' + S.formatTime(S.isoNow()) + ' with the CAPE-Vr Clinical Acoustic Reporting Tool (CART).');
    foot.push(window.CapeNotices.ATTRIBUTION_SHORT);
    foot.push('Visual analog scales are scored 0–100 from the left end; no severity categories are applied on the form.');
    // The two privacy options are independent; the note lists what was hidden.
    var hidden = [];
    if (opts.deidentify) {
      hidden.push(opts.speakerCode === '[removed]' ? 'Name/ID and the speaker code made from it' : 'Name/ID (replaced by the speaker code)',
        'original file names');
    }
    if (opts.removeStaff) { hidden.push('examiner and rater'); }
    if (hidden.length) {
      foot.push('Hidden in this report: ' + hidden.join(', ') + '. Not a full de-identification: dates, age, gender, and free text' +
        (opts.includeSummary || opts.includeEmr ? ' (including the Clinical Summary and EMR draft)' : '') + ' are unchanged.');
    }
    var f = el('footer', 'r-footer');
    foot.forEach(function (t) { f.appendChild(el('p', null, t)); });
    f.appendChild(el('p', 'r-smallprint', window.CapeNotices.REPORT_SMALL_PRINT));
    root.appendChild(f);
    return root;
  }

  function renderReport() {
    var session = app.getSession();
    // Brings the generated texts up to date before they are copied in.
    window.CapeSummary.render();
    var target = document.getElementById('report');
    target.innerHTML = '';
    var opts = currentOptions(session);
    target.appendChild(buildReport(session, opts));
    // Explain why Name/ID shows "[removed]" rather than a code.
    document.getElementById('report-code-note').hidden = !(opts.deidentify && opts.speakerCode === '[removed]');
  }

  // First times the report was opened and printed, for the progress bar.
  // Bookkeeping only: they are saved with the next save, without marking
  // the session as changed.
  function noteProgress(key) {
    var session = app.getSession();
    if (!session.progress[key]) { session.progress[key] = S.isoNow(); }
    app.renderSteps();
  }

  function open() {
    renderReport();
    noteProgress('reportOpenedAt');
    document.body.classList.add('report-mode');
    document.getElementById('report-view').hidden = false;
    window.scrollTo(0, 0);
  }

  function close() {
    document.body.classList.remove('report-mode');
    document.getElementById('report-view').hidden = true;
  }

  function init(shared) {
    app = shared;
    document.getElementById('btn-report').addEventListener('click', open);
    document.getElementById('btn-report-2').addEventListener('click', open);
    document.getElementById('report-back').addEventListener('click', close);
    document.getElementById('report-print').addEventListener('click', function () {
      renderReport();
      noteProgress('reportPrintedAt');
      window.print();
    });
    ['report-deidentify', 'report-remove-staff', 'report-include-summary', 'report-include-emr'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', renderReport);
    });
  }

  window.CapeReport = {
    init: init,
    buildAcousticTables: buildAcousticTables
  };
})();
