/*
 * summary.js: the Documentation area (rule statements, Clinical Summary,
 * EMR draft), built from the ratings, Praat's values, and the clinic's rules
 * (rules.js).
 *
 * Every generated sentence carries its "why" (values + rule) so nothing is
 * hidden logic; nothing here diagnoses. The texts can be copied only after
 * the session has been saved at least once.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var app = null;

  // dec matches the decimals the Praat script writes, so the app never
  // displays more precision than Praat reported.
  var MEASURES = [
    { key: 'f0Mean', label: 'Mean F0', csv: 'f0_mean_hz', dec: 2 },
    { key: 'f0SD', label: 'F0 SD', csv: 'f0_sd_hz', dec: 2 },
    { key: 'intensityMean', label: 'Mean intensity', csv: 'intensity_mean_db_uncal', dec: 2 },
    { key: 'cpps', label: 'CPPS', csv: 'cpps_db', dec: 2 },
    { key: 'hnr', label: 'HNR', csv: 'hnr_db', dec: 2 },
    { key: 'jitterLocal', label: 'Jitter (local)', csv: 'jitter_local_pct', dec: 3 },
    { key: 'jitterLocalAbsolute', label: 'Jitter (local, absolute)', csv: 'jitter_local_abs_s', dec: 8 },
    { key: 'jitterRap', label: 'Jitter (rap)', csv: 'jitter_rap_pct', dec: 3 },
    { key: 'jitterPpq5', label: 'Jitter (ppq5)', csv: 'jitter_ppq5_pct', dec: 3 },
    { key: 'jitterDdp', label: 'Jitter (ddp)', csv: 'jitter_ddp_pct', dec: 3 },
    { key: 'shimmerLocal', label: 'Shimmer (local, %)', csv: 'shimmer_local_pct', dec: 3 },
    { key: 'shimmerLocalDb', label: 'Shimmer (local, dB)', csv: 'shimmer_local_db', dec: 3 },
    { key: 'shimmerApq3', label: 'Shimmer (apq3)', csv: 'shimmer_apq3_pct', dec: 3 },
    { key: 'shimmerApq5', label: 'Shimmer (apq5)', csv: 'shimmer_apq5_pct', dec: 3 },
    { key: 'shimmerApq11', label: 'Shimmer (apq11)', csv: 'shimmer_apq11_pct', dec: 3 },
    { key: 'shimmerDda', label: 'Shimmer (dda)', csv: 'shimmer_dda_pct', dec: 3 },
    { key: 'f1Mean', label: 'F1 mean', csv: 'f1_mean_hz', dec: 2 }, { key: 'f1Median', label: 'F1 median', csv: 'f1_median_hz', dec: 2 },
    { key: 'f1SD', label: 'F1 SD', csv: 'f1_sd_hz', dec: 2 },
    { key: 'f2Mean', label: 'F2 mean', csv: 'f2_mean_hz', dec: 2 }, { key: 'f2Median', label: 'F2 median', csv: 'f2_median_hz', dec: 2 },
    { key: 'f2SD', label: 'F2 SD', csv: 'f2_sd_hz', dec: 2 },
    { key: 'f3Mean', label: 'F3 mean', csv: 'f3_mean_hz', dec: 2 }, { key: 'f3Median', label: 'F3 median', csv: 'f3_median_hz', dec: 2 },
    { key: 'f3SD', label: 'F3 SD', csv: 'f3_sd_hz', dec: 2 },
    { key: 'f1Midpoint', label: 'F1 (midpoint)', csv: 'f1_midpoint_hz', dec: 2 },
    { key: 'f2Midpoint', label: 'F2 (midpoint)', csv: 'f2_midpoint_hz', dec: 2 },
    { key: 'f3Midpoint', label: 'F3 (midpoint)', csv: 'f3_midpoint_hz', dec: 2 }
  ];
  function measureInfo(key) { return MEASURES.filter(function (m) { return m.key === key; })[0]; }

  var VOWELS = ['vowel_a', 'vowel_i'];
  function lcTask(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function groupOf(task) { return VOWELS.indexOf(task) !== -1 ? 'vowels' : 'speech'; }
  function taskLabel(id) {
    var t = window.CapeUpload.TASKS.filter(function (x) { return x[0] === id; })[0];
    return t ? t[1].replace(' (optional)', '') : id;
  }
  // Mid-sentence lower-casing must not break acronyms ("CPPS", "F0", "HNR").
  function lc(s) {
    if (s.length > 1 && s.charAt(1) === s.charAt(1).toUpperCase() && /[A-Z0-9]/.test(s.charAt(1))) { return s; }
    return s.charAt(0).toLowerCase() + s.slice(1);
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function vasLabel(key) {
    return window.CapeRules.VAS.filter(function (v) { return v[0] === key; })[0][1];
  }

  // The rated attributes a rule applies to, as { key, label, value }. The
  // rule key 'extra' stands for the blank attribute row on the form plus
  // every attribute added with "+ Add attribute", so shared rules files
  // work whatever attributes a session has.
  function attrEntries(session, keys) {
    var out = [];
    keys.forEach(function (k) {
      if (k !== 'extra') { out.push({ key: k, label: vasLabel(k), value: session.vas[k] }); return; }
      out.push({ key: 'extra', label: session.vas.extra.label || 'Additional attribute', value: session.vas.extra.score });
      (session.vas.additional || []).forEach(function (a, i) {
        out.push({ key: 'extra_' + (i + 1), label: a.label || 'Added attribute ' + (i + 1), value: a.score });
      });
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // Acoustic values for the summary (and their averages, if chosen)
  // ---------------------------------------------------------------------

  // A simple mean is the only arithmetic allowed. Means are labeled with n
  // and their source files, and vowels and speech are grouped separately
  // because they differ systematically and must never be averaged together.
  function summaryItems(session) {
    if (!session.acoustics) { return []; }
    var cfg = session.rules.summary;
    var files = session.acoustics.results.files.filter(function (f) {
      return f.status === 'analyzed' && !window.CapeUpload.exclusionForResult(session, f.fileName);
    });
    var items = [];

    cfg.measures.forEach(function (mk) {
      var info = measureInfo(mk);
      ['vowels', 'speech'].forEach(function (group) {
        var tasks = cfg.tasks.filter(function (t) { return groupOf(t) === group; });
        var perTask = tasks.map(function (t) {
          var fs = files.filter(function (f) { return f.task === t && f.measures && f.measures[mk]; })
            .sort(function (a, b) { return a.take - b.take; });
          return { task: t, files: fs };
        }).filter(function (x) { return x.files.length; });
        if (!perTask.length) { return; }

        // key is built from task ids only, because it becomes a CSV column name.
        function make(where, key, fs, isMean) {
          var unit = fs[0].measures[mk].unit;
          if (!isMean) {
            var m = fs[0].measures[mk];
            return { measure: mk, label: info.label, where: where, key: key, value: m.value, unit: unit, dec: info.dec, n: 1,
              excluded: 0, files: [fs[0].fileName], reason: m.reason || null, isMean: false, group: group };
          }
          var vals = fs.map(function (f) { return f.measures[mk].value; });
          var ok = vals.filter(function (v) { return v !== null && v !== undefined; });
          var mean = ok.length ? ok.reduce(function (a, b) { return a + b; }, 0) / ok.length : null;
          return { measure: mk, label: info.label, where: where, key: key, value: mean, unit: unit, dec: info.dec, n: ok.length,
            excluded: vals.length - ok.length, files: fs.map(function (f) { return f.fileName; }),
            reason: ok.length ? null : 'no values available', isMean: true, group: group };
        }

        if (cfg.combineTasks === 'mean' && (perTask.length > 1 || perTask[0].files.length > 1)) {
          var all = [];
          perTask.forEach(function (x) { all = all.concat(x.files); });
          var names = perTask.map(function (x) { return lcTask(taskLabel(x.task)); }).join(', ');
          items.push(make((perTask.length > 1 ? 'mean across different tasks: ' : 'mean of ') + names +
            (perTask.length === 1 ? ' takes' : ''), 'mean_' + perTask.map(function (x) { return x.task; }).join('_'), all, true));
        } else {
          perTask.forEach(function (x) {
            if (cfg.takes === 'mean' && x.files.length > 1) {
              items.push(make(lcTask(taskLabel(x.task)) + ', mean of ' + x.files.length + ' takes', x.task + '_mean_of_takes', x.files, true));
            } else {
              x.files.forEach(function (f) {
                items.push(make(lcTask(taskLabel(x.task)) + (x.files.length > 1 || f.take > 1 ? ', take ' + f.take : ''), x.task + '_t' + f.take, [f], false));
              });
            }
          });
        }
      });
    });
    return items;
  }

  function fmtItem(it) {
    if (it.value === null || it.value === undefined) { return 'not available' + (it.reason ? ' (' + it.reason + ')' : ''); }
    return Number(it.value).toFixed(it.dec) + ' ' + it.unit;
  }
  function itemWhy(it) {
    if (!it.isMean) { return it.label + ' = ' + fmtItem(it) + ' (Praat, ' + it.files[0] + ')'; }
    return it.label + ' = ' + fmtItem(it) + ': arithmetic mean of ' + it.n + ' value(s) reported by Praat (' + it.files.join(', ') + ')' +
      (it.excluded ? '; ' + it.excluded + ' value(s) not available were left out' : '');
  }

  // ---------------------------------------------------------------------
  // Rules -> statements (each with its "why")
  // ---------------------------------------------------------------------

  // A rule is active once it is filled in. An empty rule is silent; a
  // partly filled or unmatched rule produces a note, never a guessed
  // sentence. Each statement ("bullet") is included in the Clinical Summary
  // and EMR draft unless the clinician unticks it.
  function compute(session) {
    var rules = window.CapeRules.ensure(session);
    var excluded = session.documentation.excludedSuggestions;
    var out = { bullets: [], notes: [], severity: null, ranks: [], descriptors: [], references: [], items: [] };
    var RANK_NAMES = ['Primary', 'Secondary', 'Tertiary'];
    function bullet(id, text, why) {
      out.bullets.push({ id: id, text: text, why: why, included: excluded.indexOf(id) === -1 });
    }

    var chk = window.CapeRules.checkSeverity(rules);
    var sv = session.vas.overallSeverity;
    if (!chk.ok) { if (!chk.empty) { out.notes.push('Severity rule inactive: ' + chk.error); } }
    else if (sv === null) { out.notes.push('Severity rule: Overall Severity was not rated.'); }
    else {
      var match = chk.ranges.filter(function (r) { return sv >= r.min && sv <= r.max; })[0];
      if (!match) { out.notes.push('Severity rule: no range contains Overall Severity = ' + sv + '.'); }
      else {
        var why = ['Overall Severity = ' + sv + '/100 (CAPE-Vr form)',
          'Rule “Severity ranges” (clinic-defined): ' + match.min + '–' + match.max + ' → ' + match.label];
        out.severity = { id: 'severity', label: match.label, value: sv, why: why };
        bullet('severity', 'Overall severity falls within the clinician-defined ' + match.label + ' range (' + sv + '/100)', why);
      }
    }

    // The minimum score keeps a barely present attribute from being named
    // "primary" just because it is the highest of low scores. The rule is
    // active once a minimum score is entered.
    var rk = rules.ranking;
    if (rk.minScore !== null) {
      var rated = attrEntries(session, rk.attributes).filter(function (a) { return a.value !== null && a.value !== undefined; });
      var eligible = rated.filter(function (a) { return a.value >= rk.minScore; }).sort(function (a, b) { return b.value - a.value; });
      var margin = rk.tieMargin || 0;
      var ruleText = 'Rule “Feature ranking” (clinic-defined): attributes ' + rk.attributes.map(function (k) { return k === 'extra' ? 'additional attributes' : lc(vasLabel(k)); }).join(', ') +
        ' ranked by score; minimum score ' + rk.minScore + '; ' + (margin ? 'within ' + margin + ' point(s) = same rank' : 'exact ties = same rank') +
        '; up to ' + rk.maxRanks + ' rank(s)';
      var baseWhy = rated.map(function (a) { return a.label + ' = ' + a.value + '/100'; });
      if (!rk.attributes.length) { out.notes.push('Feature ranking inactive: no attributes are ticked.'); }
      else if (!eligible.length) { out.notes.push('Feature ranking: no chosen attribute reaches the minimum score (' + rk.minScore + ').'); }
      // Measured from the rank's highest score, not the previous attribute,
      // so ties cannot chain across a wide spread of scores.
      var i = 0;
      while (i < eligible.length && out.ranks.length < rk.maxRanks) {
        var group = [eligible[i]];
        var j = i + 1;
        while (j < eligible.length && eligible[i].value - eligible[j].value <= margin) { group.push(eligible[j]); j++; }
        var rankName = RANK_NAMES[out.ranks.length];
        var id = 'rank_' + (out.ranks.length + 1);
        var whyR = baseWhy.concat([ruleText]);
        out.ranks.push({ id: id, rank: rankName, attrs: group, why: whyR });
        bullet(id, rankName + ' perceptual feature' + (group.length > 1 ? 's' : '') + ': ' +
          list(group.map(function (a) { return lc(a.label) + ' (' + a.value + '/100)'; })), whyR);
        i = j;
      }
    }

    var dc = window.CapeRules.checkRanges(rules.descriptors.ranges, 0, 100);
    if (!dc.ok) { if (!dc.empty) { out.notes.push('Attribute descriptors inactive: ' + dc.error); } }
    else {
      attrEntries(session, rules.descriptors.attributes).forEach(function (a) {
        if (a.value === null || a.value === undefined) { return; }
        var m = dc.ranges.filter(function (r) { return a.value >= r.min && a.value <= r.max; })[0];
        if (!m) { return; }
        var whyD = [a.label + ' = ' + a.value + '/100 (CAPE-Vr form)',
          'Rule “Attribute descriptors” (clinic-defined): ' + m.min + '–' + m.max + ' → ' + m.label];
        var idD = 'desc_' + a.key;
        out.descriptors.push({ id: idD, key: a.key, attrLabel: a.label, label: m.label, value: a.value, why: whyD });
        bullet(idD, a.label + ' ' + m.label + ' (' + a.value + '/100)', whyD);
      });
    }

    out.items = summaryItems(session);
    if (session.acoustics) {
      var results = session.acoustics.results;
      rules.references.forEach(function (ref) {
        if (window.CapeRules.referenceEmpty(ref)) { return; }
        var def = window.CapeRules.refDef(ref.id);
        var problem = window.CapeRules.referenceProblem(ref);
        if (problem) { out.notes.push('Reference value “' + def.label + '” inactive: ' + problem + '.'); return; }
        var its = out.items.filter(function (it) { return it.measure === def.measure && it.group === def.group; });
        if (!its.length) { out.notes.push('Reference value “' + def.label + '”: this measure/task is not included in the summary (see “Acoustic values in the Clinical Summary and EMR draft”).'); return; }
        var diffs = window.CapeRules.settingsDifferences(ref, results);
        if (diffs.length) {
          out.notes.push('⚠ Reference value “' + def.label + '” was entered for different analysis settings (' + diffs.join('; ') + '). Reference values should not be transferred across analysis configurations; please review it.');
        }
        its.forEach(function (it) {
          if (it.value === null) { return; }
          // Strict comparison: a value equal to the reference meets neither.
          var met = ref.condition === 'below' ? it.value < ref.value : it.value > ref.value;
          if (!met) { return; }   // silence, not an implied "normal" statement
          var whyV = [itemWhy(it), 'Rule “' + def.label + '” (clinic reference value): ' + ref.value + ' ' + def.unit +
            '; condition: ' + ref.condition + ' → “' + ref.text + '”'];
          if (diffs.length) { whyV.push('⚠ Settings differ from those the reference value was entered for: ' + diffs.join('; ')); }
          var idV = 'ref_' + ref.key + '_' + it.key;
          var text = ref.text.trim().replace(/\.$/, '') + ' (' + it.label + ', ' + it.where + ': ' + fmtItem(it) + ')' +
            (diffs.length ? ' ⚠ settings differ' : '');
          out.references.push({ id: idV, ref: ref, item: it, text: text, why: whyV });
          bullet(idV, text, whyV);
        });
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Generated texts, as lists of { text, why } so every sentence is traceable
  // ---------------------------------------------------------------------

  function choiceText(session, listName, ids) {
    ids = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    return ids.map(function (id) {
      var o = S.OPTIONS[listName].filter(function (x) { return x[0] === id; })[0];
      return o ? o[1] : id;
    }).join(', ');
  }

  function isIncluded(c, id) {
    return c.bullets.some(function (b) { return b.id === id && b.included; });
  }

  function buildSummary(session, c) {
    var lines = [];
    function add(text, why) { lines.push({ text: text, why: why || [] }); }
    var v = session.vas;
    add('CAPE-Vr', []);
    ['overallSeverity', 'roughness', 'breathiness', 'strain'].forEach(function (k) {
      var val = v[k];
      add(vasLabel(k) + ': ' + (val === null ? 'not rated' : val + '/100'), ['CAPE-Vr form: ' + vasLabel(k) + ' = ' + (val === null ? 'not rated' : val)]);
    });
    // Blank or added attribute rows appear only once named or rated.
    attrEntries(session, ['extra']).forEach(function (a, i) {
      var named = i === 0 ? v.extra.label : v.additional[i - 1].label;
      if (a.value === null && !named) { return; }
      add(a.label + ': ' + (a.value === null ? 'not rated' : a.value + '/100'),
        ['CAPE-Vr form: ' + (i === 0 ? 'additional attribute' : 'added attribute ' + i) + ' “' + a.label + '” = ' + (a.value === null ? 'not rated' : a.value)]);
    });
    [['Pitch', 'pitch'], ['Loudness', 'loudness'], ['Resonance', 'resonance'], ['Nasality', 'nasality']].forEach(function (x) {
      var d = session.descriptive[x[1]];
      var t = choiceText(session, x[1], d.selected);
      if (t || d.comment) { add(x[0] + ': ' + (t || '—') + (d.comment ? ' (' + d.comment + ')' : ''), ['CAPE-Vr form: ' + x[0]]); }
    });
    var inc = session.inconsistencies;
    if (inc.status) {
      var parts = [['vowels', 'vowels'], ['sentences', 'sentences'], ['extemporaneous', 'extemporaneous speech']]
        .filter(function (p) { return inc[p[0]]; }).map(function (p) { return p[1] + ': ' + inc[p[0]]; });
      add('Inconsistencies: ' + choiceText(session, 'inconsistency', inc.status) + (parts.length ? ' (' + parts.join('; ') + ')' : ''), ['CAPE-Vr form: Inconsistencies']);
    }
    var ins = choiceText(session, 'instabilities', session.instabilities.selected);
    if (ins || session.instabilities.other) { add('Instabilities: ' + [ins, session.instabilities.other].filter(Boolean).join(', '), ['CAPE-Vr form: Instabilities']); }
    var fe = choiceText(session, 'features', session.additionalFeatures.selected);
    if (fe || session.additionalFeatures.other) { add('Additional features: ' + [fe, session.additionalFeatures.other].filter(Boolean).join(', '), ['CAPE-Vr form: Additional features']); }

    if (c.items.length) {
      add('', []);
      add('Acoustic Measures (Praat)', []);
      c.items.forEach(function (it) { add(it.label + ', ' + it.where + ': ' + fmtItem(it), [itemWhy(it)]); });
    }
    var ticked = c.bullets.filter(function (b) { return b.included; });
    if (ticked.length) {
      add('', []);
      add('Clinic-defined rule statements', []);
      ticked.forEach(function (b) { add(b.text, b.why.concat(['Included because it is ticked in the statement list'])); });
    }
    if (session.overallImpression) {
      add('', []);
      add('Overall Impression (rater)', []);
      add(session.overallImpression, ['CAPE-Vr form: Overall Impression (the rater’s own words)']);
    }
    return lines;
  }

  // "a", "a and b", "a, b, and c"
  function list(words) {
    if (words.length <= 1) { return words[0] || ''; }
    if (words.length === 2) { return words[0] + ' and ' + words[1]; }
    return words.slice(0, -1).join(', ') + ', and ' + words[words.length - 1];
  }

  // "sentence_1", "sentence_3" -> "sentences a and c"; vowels -> "/ɑ/ and /i/".
  function describeTasks(ids) {
    var parts = [];
    var vowels = ids.filter(function (t) { return VOWELS.indexOf(t) !== -1; })
      .map(function (t) { return t === 'vowel_a' ? '/ɑ/' : '/i/'; });
    if (vowels.length) { parts.push('the sustained vowel' + (vowels.length > 1 ? 's ' : ' ') + list(vowels)); }
    var letters = ids.filter(function (t) { return /^sentence_[1-6]$/.test(t); })
      .map(function (t) { return 'abcdef'.charAt(Number(t.slice(-1)) - 1); });
    if (letters.length === 6) { parts.push('sentences a–f'); }
    else if (letters.length) { parts.push((letters.length > 1 ? 'sentences ' : 'sentence ') + list(letters)); }
    if (ids.indexOf('extemporaneous') !== -1) { parts.push('extemporaneous speech'); }
    if (ids.indexOf('reading') !== -1) { parts.push('the reading passage'); }
    return list(parts);
  }

  // Sentences describing the rating conditions and which tasks were
  // recorded, each traceable to the form or the recordings list.
  function conditionSentences(session) {
    var out = [];
    var rc = session.ratingConditions;
    if (rc.ratingSource === 'live_voice' || rc.ratingSource === 'recorded_voice') {
      var how = rc.ratingSource === 'live_voice' ? 'live voice'
        : 'recorded voice samples' + (rc.playback ? ' presented via ' + rc.playback : '');
      var anchors = rc.auditoryAnchors === 'yes' ? ', with auditory anchors' : rc.auditoryAnchors === 'no' ? ', without auditory anchors' : '';
      out.push({ text: 'Ratings were based on ' + how + anchors + '.', why: ['CAPE-Vr form: Rating Conditions'] });
    } else {
      out.push({ text: 'Rating conditions (live or recorded voice) were not documented.', why: ['CAPE-Vr form: Rating Conditions left blank'] });
    }

    // Tasks are known only from the recordings list (the form itself does
    // not record which tasks were administered), so nothing is claimed
    // without recordings.
    var used = [];
    session.audio.files.forEach(function (f) { if (f.task && !f.excluded && used.indexOf(f.task) === -1) { used.push(f.task); } });
    if (used.length) {
      var order = window.CapeUpload.TASKS.map(function (t) { return t[0]; });
      used.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
      var missing = order.filter(function (t) { return t !== 'reading' && used.indexOf(t) === -1; });
      out.push({
        text: 'Recordings were available for ' + describeTasks(used) + '.' +
          (missing.length ? ' No recording was available for ' + describeTasks(missing) + '.' : ''),
        why: ['Recordings list (step 2): tasks with at least one take that is not excluded']
      });
    }

    var modeled = [1, 2, 3, 4, 5, 6].filter(function (n) { return session.stimuli.examinerModeled['sentence_' + n]; })
      .map(function (n) { return 'sentence_' + n; });
    if (modeled.length) {
      out.push({ text: 'The examiner modeled ' + describeTasks(modeled) + '.', why: ['CAPE-Vr form: "Check if the examiner modeled the sentences"'] });
    }
    if (session.stimuli.extempPromptUsed && session.stimuli.extempPromptUsed.trim()) {
      out.push({ text: 'An alternative extemporaneous prompt was used: “' + session.stimuli.extempPromptUsed.trim() + '”.',
        why: ['CAPE-Vr form: Prompt used, if different'] });
    }
    return out;
  }

  function buildEmr(session, c) {
    var s = [];
    function add(text, why) { s.push({ text: text, why: why || [] }); }
    var TICKED = 'Included because it is ticked in the statement list';
    // The opening reports how the evaluation was actually done, so the note
    // never implies full protocol fidelity when tasks were not recorded or
    // ratings were made from live voice.
    add('Perceptual voice evaluation was performed using the Consensus Auditory-Perceptual Evaluation of Voice – Revised (CAPE-Vr).', ['Fixed opening sentence']);
    conditionSentences(session).forEach(function (x) { add(x.text, x.why); });

    // Rule-based sentences appear only for statements left ticked;
    // otherwise the plain rating is reported.
    var sv = session.vas.overallSeverity;
    if (c.severity && isIncluded(c, c.severity.id)) {
      add('Overall severity fell within the clinician-defined ' + c.severity.label + ' range (' + sv + '/100).', c.severity.why.concat([TICKED]));
    } else if (sv !== null) {
      add('Overall severity was rated ' + sv + '/100.', ['CAPE-Vr form: Overall Severity = ' + sv]);
    }

    // Track named attributes so none is mentioned twice in the draft.
    var named = [];
    var ranks = c.ranks.filter(function (r) { return isIncluded(c, r.id); });
    function part(r) { return list(r.attrs.map(function (a) { named.push(a.key); return lc(a.label) + ' (' + a.value + '/100)'; })); }
    function rankWhy(rs) {
      var w = [];
      rs.forEach(function (r) { r.why.forEach(function (x) { if (w.indexOf(x) === -1) { w.push(x); } }); });
      return w.concat([TICKED]);
    }
    if (ranks.length && ranks[0].rank === 'Primary') {
      var sentence = 'Ratings were characterized primarily by ' + part(ranks[0]);
      var more = ranks.slice(1).map(function (r) { return part(r) + ' as ' + (r.rank === 'Secondary' ? 'a secondary' : 'a tertiary') + ' feature'; });
      if (more.length) { sentence += ', with ' + list(more); }
      add(sentence + '.', rankWhy(ranks));
    } else {
      // The primary statement was unticked: name the others on their own.
      ranks.forEach(function (r) {
        add(cap(part(r)) + (r.attrs.length > 1 ? ' were' : ' was') + ' named as ' + (r.rank === 'Secondary' ? 'a secondary' : 'a tertiary') +
          ' perceptual feature.', rankWhy([r]));
      });
    }
    c.descriptors.filter(function (d) { return isIncluded(c, d.id); }).forEach(function (d) {
      if (named.indexOf(d.key) !== -1) { return; }
      named.push(d.key);
      add(d.attrLabel + ' was ' + d.label + ' (' + d.value + '/100).', d.why.concat([TICKED]));
    });
    var others = attrEntries(session, ['roughness', 'breathiness', 'strain']).filter(function (a) { return named.indexOf(a.key) === -1 && a.value !== null; });
    if (others.length) {
      add(cap(list(others.map(function (a) { return lc(a.label) + ' was rated ' + a.value + '/100'; }))) + '.',
        others.map(function (a) { return 'CAPE-Vr form: ' + a.label + ' = ' + a.value; }));
    }
    attrEntries(session, ['extra']).forEach(function (a, i) {
      var label = i === 0 ? session.vas.extra.label : session.vas.additional[i - 1].label;
      if (a.value === null || !label || named.indexOf(a.key) !== -1) { return; }
      add(label + ' was rated ' + a.value + '/100.', ['CAPE-Vr form: ' + (i === 0 ? 'additional attribute' : 'added attribute ' + i)]);
    });

    var desc = [['pitch', 'Pitch'], ['loudness', 'Loudness'], ['resonance', 'Resonance'], ['nasality', 'Nasality']]
      .map(function (x) { var t = choiceText(session, x[0], session.descriptive[x[0]].selected); return t ? x[1].toLowerCase() + ' ' + t.toLowerCase() : null; })
      .filter(Boolean);
    if (desc.length) { add('Descriptive ratings: ' + desc.join('; ') + '.', ['CAPE-Vr form: Pitch, Loudness, Resonance, Nasality']); }

    if (c.items.length) {
      var avail = c.items.filter(function (it) { return it.value !== null; });
      if (avail.length) {
        add('Acoustic analysis (Praat) yielded ' + list(avail.map(function (it) {
          return lc(it.label) + ' of ' + fmtItem(it) + ' (' + it.where + ')';
        })) + '.', avail.map(itemWhy));
      }
    }
    c.references.filter(function (r) { return isIncluded(c, r.id); }).forEach(function (r) {
      add(r.text + '.', r.why.concat([TICKED]));
    });

    if (session.overallImpression) {
      add('Clinician impression: ' + session.overallImpression, ['CAPE-Vr form: Overall Impression (the rater’s own words)']);
    }
    return s;
  }

  // ---------------------------------------------------------------------
  // Drawing the Documentation area
  // ---------------------------------------------------------------------

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined && text !== null) { e.textContent = text; }
    return e;
  }

  // Older files may have "suggestedChecked" and "includeAttestation"; both
  // are dropped, so every statement starts included.
  function ensureDoc(session) {
    if (!session.documentation || typeof session.documentation !== 'object') {
      session.documentation = { summaryText: '', summaryEdited: false, emrText: '', emrEdited: false, excludedSuggestions: [] };
    }
    var d = session.documentation;
    delete d.suggestedChecked;
    delete d.includeAttestation;
    if (!Array.isArray(d.excludedSuggestions)) { d.excludedSuggestions = []; }
    ['summaryText', 'emrText'].forEach(function (k) { if (typeof d[k] !== 'string') { d[k] = ''; } });
    return d;
  }

  function whyList(items) {
    var ul = el('ul', 'why-list');
    items.forEach(function (w) { ul.appendChild(el('li', null, w)); });
    return ul;
  }

  function sourcesPanel(sentences) {
    var det = el('details', 'sources');
    det.appendChild(el('summary', null, 'Why does the text say this? (' + sentences.filter(function (x) { return x.text; }).length + ' generated lines)'));
    var ol = el('ol');
    sentences.forEach(function (x) {
      if (!x.text || !x.why.length) { return; }
      var li = el('li');
      li.appendChild(el('div', 'src-text', x.text));
      li.appendChild(whyList(x.why));
      ol.appendChild(li);
    });
    det.appendChild(ol);
    return det;
  }

  // Copying is allowed only once the session has been saved, so text never
  // leaves the app before there is a saved record it came from.
  function canCopy(session) { return !!session.savedAt; }
  var COPY_BLOCKED = 'Save the session first to copy.';

  // Once the clinician edits the text it is never regenerated automatically,
  // so their wording is not silently overwritten by a rule or rating change.
  function editableBlock(host, session, key, generated, title) {
    var d = session.documentation;
    var editedKey = key + 'Edited', textKey = key + 'Text';
    var genText = generated.map(function (x) { return x.text; }).join(key === 'emr' ? ' ' : '\n');
    if (key === 'emr') { genText = genText.replace(/ {2,}/g, ' ').trim(); }
    if (!d[editedKey]) { d[textKey] = genText; }

    var wrap = el('div', 'doc-block');
    var head = el('div', 'doc-block-head');
    head.appendChild(el('span', 'doc-state', d[editedKey] ? 'Edited by you. Changes to the ratings or rules no longer update this text.' : 'Generated. It updates automatically until you edit it.'));
    if (d[editedKey]) {
      var regen = el('button', 'small', 'Regenerate (replaces your edits)');
      regen.type = 'button';
      regen.addEventListener('click', function () {
        if (!window.confirm('Replace your edited text with newly generated text?')) { return; }
        d[editedKey] = false;
        app.markDirty();
        render();
      });
      head.appendChild(regen);
    }
    var copy = el('button', 'small primary', 'Copy to clipboard');
    copy.type = 'button';
    copy.disabled = !canCopy(session);
    copy.addEventListener('click', function () { copyText(ta, copy); });
    head.appendChild(copy);
    if (!canCopy(session)) { head.appendChild(el('span', 'copy-note', COPY_BLOCKED)); }
    wrap.appendChild(head);
    var ta = document.createElement('textarea');
    ta.rows = key === 'emr' ? 8 : 14;
    ta.value = d[textKey];
    ta.setAttribute('aria-label', title);
    ta.addEventListener('input', function () {
      d[textKey] = ta.value;
      if (!d[editedKey]) { d[editedKey] = true; head.querySelector('.doc-state').textContent = 'Edited by you. Changes to the ratings or rules no longer update this text.'; }
      app.markDirty();
      app.renderSteps();
    });
    // Ctrl+C / Ctrl+X are blocked the same way as the button.
    ['copy', 'cut'].forEach(function (type) {
      ta.addEventListener(type, function (e) {
        if (!canCopy(app.getSession())) { e.preventDefault(); window.alert(COPY_BLOCKED); }
      });
    });
    wrap.appendChild(ta);
    wrap.appendChild(el('p', 'notice', key === 'emr' ? window.CapeNotices.EMR_SHORT : window.CapeNotices.SUMMARY_SHORT));
    wrap.appendChild(sourcesPanel(generated));
    host.appendChild(wrap);
  }

  function copyText(ta, button) {
    function done(ok) {
      var old = 'Copy to clipboard';
      button.textContent = ok ? 'Copied ✓' : 'Copy failed: select the text and press Ctrl+C';
      setTimeout(function () { button.textContent = old; }, 2000);
      if (ok) {
        // Completes step 3 on the progress bar (saved with the next save).
        var session = app.getSession();
        if (!session.progress.docCopiedAt) { session.progress.docCopiedAt = S.isoNow(); }
        app.renderSteps();
      }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(ta.value).then(function () { done(true); }, function () { fallback(); });
    } else { fallback(); }
    function fallback() {
      ta.focus();
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      done(ok);
    }
  }

  function render() {
    if (!app) { return; }
    var session = app.getSession();
    window.CapeRules.ensure(session);
    ensureDoc(session);
    var c = compute(session);

    // One list: each statement with its wording, its "why", and a tick-box
    // (ticked = included in the Clinical Summary and EMR draft).
    var host = document.getElementById('doc-statements');
    host.innerHTML = '';
    if (!c.bullets.length) {
      host.appendChild(el('p', 'muted', 'No statements. They appear here when a rule under “Interpretation Rules” below is filled in and applies to this evaluation.'));
    }
    c.bullets.forEach(function (b) {
      var row = el('div', 'suggestion');
      var l = el('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = b.included;
      cb.addEventListener('change', function () {
        var d = session.documentation;
        d.excludedSuggestions = d.excludedSuggestions.filter(function (x) { return x !== b.id; });
        if (!cb.checked) { d.excludedSuggestions.push(b.id); }
        app.markDirty();
        render();
        app.renderSteps();
      });
      l.appendChild(cb);
      l.appendChild(document.createTextNode(' ' + b.text));
      row.appendChild(l);
      var det = el('details', 'why-inline');
      det.appendChild(el('summary', null, 'why?'));
      det.appendChild(whyList(b.why));
      row.appendChild(det);
      host.appendChild(row);
    });
    if (c.notes.length) {
      var ul = el('ul', 'doc-notes');
      c.notes.forEach(function (n) { ul.appendChild(el('li', null, n)); });
      host.appendChild(ul);
    }

    var sumHost = document.getElementById('doc-summary');
    sumHost.innerHTML = '';
    editableBlock(sumHost, session, 'summary', buildSummary(session, c), 'Clinical Summary');
    var emrHost = document.getElementById('doc-emr');
    emrHost.innerHTML = '';
    editableBlock(emrHost, session, 'emr', buildEmr(session, c), 'EMR Documentation Draft');
  }

  function init(shared) {
    app = shared;
    document.addEventListener('cape:changed', function () { render(); });
  }

  window.CapeSummary = {
    MEASURES: MEASURES,
    init: init,
    render: render,
    compute: function (session) { window.CapeRules.ensure(session); ensureDoc(session); return compute(session); }
  };
})();
