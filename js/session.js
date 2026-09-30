/*
 * session.js: the session file (one speaker, one rater, one CAPE-Vr form).
 *
 * Sessions live only in JSON files the user downloads and loads; nothing is
 * kept in browser storage, so the file is the single source of truth.
 * The file's layout is createBlankSession() below.
 */
(function () {
  'use strict';

  var APP_VERSION = '0.1.0';
  // Schema history (older files still load): 0.2.0 "audio"; 0.3.0 "acoustics";
  // 0.4.0 "rules" + "documentation"; 0.5.0 "vas.additional" + "progress"
  // (blinding dropped).
  var SCHEMA_VERSION = '0.5.0';
  var FILE_TYPE = 'cape-vr-session';

  // [id, label] in CAPE-Vr form order (Figure 3). Ids are stored in the file
  // so labels can be reworded without breaking saved sessions.
  var OPTIONS = {
    yesNo:          [['yes', 'Yes'], ['no', 'No']],
    sessionMode:    [['in_person', 'In person'], ['virtual', 'Virtual']],
    environment:    [['clinic_room', 'Clinic room'], ['sound_booth', 'Sound booth'],
                     ['bedside', 'Bedside'], ['home', 'Home']],
    ratingSource:   [['live_voice', 'Live voice'], ['recorded_voice', 'Recorded voice']],
    playback:       [['headphones', 'Headphones'], ['speakers', 'Speakers']],
    pitch:          [['normal', 'Normal'], ['low', 'Low'], ['high', 'High']],
    loudness:       [['normal', 'Normal'], ['quiet', 'Quiet'], ['loud', 'Loud']],
    resonance:      [['normal', 'Normal'], ['front', 'Front'], ['back', 'Back']],
    nasality:       [['normal', 'Normal'], ['hyponasal', 'Hyponasal'], ['hypernasal', 'Hypernasal']],
    inconsistency:  [['none', 'None'], ['present', 'Present']],
    instabilities:  [['aphonic_break', 'aphonic break'], ['pitch_break', 'pitch break'],
                     ['pitch_instability', 'pitch instability'], ['spasm', 'spasm'],
                     ['tremor', 'tremor']],
    features:       [['aphonia', 'aphonia'], ['asthenia', 'asthenia'],
                     ['diplophonia', 'diplophonia'], ['falsetto', 'falsetto'], ['fry', 'fry'],
                     ['hard_glottal_attack', 'hard glottal attack'], ['wet_gurgly', 'wet/gurgly']],

    // Analysis settings: ids must match the Praat settings file.
    profiles:       [['adult_female', 'Adult female'], ['adult_male', 'Adult male'], ['child', 'Child'],
                     ['trans_woman', 'Trans woman'], ['trans_man', 'Trans man'],
                     ['other_unspecified', 'Other / unspecified']],
    formantWindow:  [['whole_trimmed', 'Whole analysis window (mean, median, SD)'], ['midpoint', 'Midpoint only']],
    cppsMethod:     [['maryn_weenink_2015', 'Maryn & Weenink (2015)'], ['praat_default', 'Praat 7.0.02 defaults']],
    hnrMethod:      [['cc', 'Cross-correlation (cc)'], ['ac', 'Autocorrelation (ac)']],
    periodRange:    [['derived', 'From the pitch range'], ['fixed', 'Fixed (0.0001–0.02 s)']],
    intensityAvg:   [['energy', 'Energy'], ['dB', 'dB']],
    channels:       [['average', 'Average the channels'], ['left', 'Left channel only']],
    jitter:         [['local', 'local'], ['local_absolute', 'local, absolute'], ['rap', 'rap'],
                     ['ppq5', 'ppq5'], ['ddp', 'ddp']],
    shimmer:        [['local', 'local'], ['local_db', 'local, dB'], ['apq3', 'apq3'],
                     ['apq5', 'apq5'], ['apq11', 'apq11'], ['dda', 'dda']]
  };

  // Default analysis settings. Keep in sync with the defaults in the Praat
  // script (its header and settingsDialog procedure).
  var ANALYSIS_DEFAULTS = {
    formantCount: 5,
    vowelWindowSec: 3,
    vowelShortFraction: 0.5,
    formantWindow: 'whole_trimmed',
    cppsMethod: 'maryn_weenink_2015',
    cppsSpeechVoicedOnly: 'yes',
    intensitySpeechVoicedOnly: 'yes',
    intensityAveraging: 'energy',
    hnrMethod: 'cc',
    periodRangeMode: 'derived',
    jitterMeasures: ['local'],
    shimmerMeasures: ['local', 'local_db'],
    channelHandling: 'average'
  };

  // Every form field, used to validate loaded files:
  // [path, type, optionList?, defaultIfInvalid?]
  // type: text | date | number | integer | boolean | vas | single | multi
  var FIELDS = [
    ['header.nameOrId', 'text'], ['header.gender', 'text'], ['header.age', 'text'],
    ['header.examiner', 'text'], ['header.recordingDate', 'date'],

    ['recordingConditions.audioRecorded', 'single', 'yesNo'],
    ['recordingConditions.sessionMode', 'single', 'sessionMode'],
    ['recordingConditions.environment', 'single', 'environment'],
    ['recordingConditions.recordingDevice', 'text'],
    ['recordingConditions.mouthToMicCm', 'number'],

    ['stimuli.examinerModeled.sentence_1', 'boolean'], ['stimuli.examinerModeled.sentence_2', 'boolean'],
    ['stimuli.examinerModeled.sentence_3', 'boolean'], ['stimuli.examinerModeled.sentence_4', 'boolean'],
    ['stimuli.examinerModeled.sentence_5', 'boolean'], ['stimuli.examinerModeled.sentence_6', 'boolean'],
    ['stimuli.extempPromptUsed', 'text'], ['stimuli.readingPassage', 'text'],
    ['stimuli.showStimulusText', 'boolean'],

    ['ratingConditions.ratingSource', 'single', 'ratingSource'],
    ['ratingConditions.playback', 'single', 'playback'],
    ['ratingConditions.auditoryAnchors', 'single', 'yesNo'],
    ['ratingConditions.rater', 'text'], ['ratingConditions.ratingDate', 'date'],
    ['ratingConditions.timesPlayed', 'integer'],

    ['vas.overallSeverity', 'vas'], ['vas.roughness', 'vas'], ['vas.breathiness', 'vas'],
    ['vas.strain', 'vas'], ['vas.extra.label', 'text'], ['vas.extra.score', 'vas'],
    ['vas.showNumbers', 'boolean'],

    ['descriptive.pitch.selected', 'multi', 'pitch'], ['descriptive.pitch.comment', 'text'],
    ['descriptive.loudness.selected', 'multi', 'loudness'], ['descriptive.loudness.comment', 'text'],
    ['descriptive.resonance.selected', 'multi', 'resonance'], ['descriptive.resonance.comment', 'text'],
    ['descriptive.nasality.selected', 'multi', 'nasality'], ['descriptive.nasality.comment', 'text'],

    ['inconsistencies.status', 'single', 'inconsistency'],
    ['inconsistencies.vowels', 'text'], ['inconsistencies.sentences', 'text'],
    ['inconsistencies.extemporaneous', 'text'],

    ['instabilities.selected', 'multi', 'instabilities'], ['instabilities.other', 'text'],
    ['additionalFeatures.selected', 'multi', 'features'], ['additionalFeatures.other', 'text'],
    ['overallImpression', 'text'],

    ['audio.speakerIdForFiles', 'text'],
    ['audio.speakerProfile', 'single', 'profiles'],
    ['audio.pitchFloorHz', 'number'], ['audio.pitchCeilingHz', 'number'], ['audio.formantCeilingHz', 'number'],
    ['audio.advanced.formantCount', 'number', null, ANALYSIS_DEFAULTS.formantCount],
    ['audio.advanced.vowelWindowSec', 'number', null, ANALYSIS_DEFAULTS.vowelWindowSec],
    ['audio.advanced.vowelShortFraction', 'number', null, ANALYSIS_DEFAULTS.vowelShortFraction],
    ['audio.advanced.formantWindow', 'single', 'formantWindow', ANALYSIS_DEFAULTS.formantWindow],
    ['audio.advanced.cppsMethod', 'single', 'cppsMethod', ANALYSIS_DEFAULTS.cppsMethod],
    ['audio.advanced.cppsSpeechVoicedOnly', 'single', 'yesNo', ANALYSIS_DEFAULTS.cppsSpeechVoicedOnly],
    ['audio.advanced.intensitySpeechVoicedOnly', 'single', 'yesNo', ANALYSIS_DEFAULTS.intensitySpeechVoicedOnly],
    ['audio.advanced.intensityAveraging', 'single', 'intensityAvg', ANALYSIS_DEFAULTS.intensityAveraging],
    ['audio.advanced.hnrMethod', 'single', 'hnrMethod', ANALYSIS_DEFAULTS.hnrMethod],
    ['audio.advanced.periodRangeMode', 'single', 'periodRange', ANALYSIS_DEFAULTS.periodRangeMode],
    ['audio.advanced.jitterMeasures', 'multi', 'jitter'],
    ['audio.advanced.shimmerMeasures', 'multi', 'shimmer'],
    ['audio.advanced.channelHandling', 'single', 'channels', ANALYSIS_DEFAULTS.channelHandling]
  ];

  // ---------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Local time with offset rather than UTC (toISOString), so recorded
  // times match the clinic clock, e.g. "2026-09-25T14:03:07-04:00".
  function isoNow() {
    var d = new Date();
    var offset = -d.getTimezoneOffset();
    var sign = offset >= 0 ? '+' : '-';
    offset = Math.abs(offset);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      sign + pad2(Math.floor(offset / 60)) + ':' + pad2(offset % 60);
  }

  function todayDate() { return isoNow().slice(0, 10); }

  // "2026-09-25T14:03:07-04:00" -> "2026-09-25 14:03"
  function formatTime(iso) {
    if (!iso) { return ''; }
    return String(iso).slice(0, 10) + ' ' + String(iso).slice(11, 16);
  }

  // Version-4 UUID; links exported packages and results back to this session.
  function newSessionId() {
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  function getPath(obj, path) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (!isPlainObject(obj)) { return undefined; }
      obj = obj[parts[i]];
    }
    return obj;
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      if (!isPlainObject(obj[parts[i]])) { obj[parts[i]] = {}; }
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }

  function optionIds(listName) {
    return OPTIONS[listName].map(function (o) { return o[0]; });
  }

  function compareVersions(a, b) {
    var pa = String(a).split('.').map(Number);
    var pb = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      var x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) { return x < y ? -1 : 1; }
    }
    return 0;
  }

  // ---------------------------------------------------------------------
  // Blank session
  // ---------------------------------------------------------------------

  function createBlankSession() {
    var now = isoNow();
    return {
      schemaVersion: SCHEMA_VERSION,
      fileType: FILE_TYPE,
      appVersion: APP_VERSION,
      sessionId: newSessionId(),
      createdAt: now,
      savedAt: null,

      header: { nameOrId: '', gender: '', age: '', examiner: '', recordingDate: '' },
      recordingConditions: {
        audioRecorded: null, sessionMode: null, environment: null,
        recordingDevice: '', mouthToMicCm: null
      },
      stimuli: {
        examinerModeled: {
          sentence_1: false, sentence_2: false, sentence_3: false,
          sentence_4: false, sentence_5: false, sentence_6: false
        },
        extempPromptUsed: '',
        readingPassage: '',
        showStimulusText: true
      },
      ratingConditions: {
        ratingSource: null, playback: null, auditoryAnchors: null,
        rater: '', ratingDate: '', timesPlayed: null
      },
      vas: {
        overallSeverity: null, roughness: null, breathiness: null, strain: null,
        extra: { label: '', score: null },
        // Attributes added with "+ Add attribute", in order: [{ label, score }].
        additional: [],
        // Off by default so ratings are made from the line alone, not
        // anchored to numbers. Scores are stored either way.
        showNumbers: false
      },
      descriptive: {
        pitch: { selected: [], comment: '' },
        loudness: { selected: [], comment: '' },
        resonance: { selected: [], comment: '' },
        nasality: { selected: [], comment: '' }
      },
      inconsistencies: { status: null, vowels: '', sentences: '', extemporaneous: '' },
      instabilities: { selected: [], other: '' },
      additionalFeatures: { selected: [], other: '' },
      overallImpression: '',

      // First times these happened, for the progress bar (steps 3 and 4).
      progress: {
        docCopiedAt: null,
        csvExportedAt: null,
        reportOpenedAt: null,
        reportPrintedAt: null
      },

      // Audio itself is never stored in the session, only file metadata and
      // task assignments.
      audio: {
        speakerIdForFiles: '',
        speakerProfile: null,
        pitchFloorHz: null,
        pitchCeilingHz: null,
        formantCeilingHz: null,
        advanced: clone(ANALYSIS_DEFAULTS),
        files: [],
        lastExport: null
      },

      acoustics: null,

      // Filled in by rules.js and summary.js.
      rules: null,
      documentation: null
    };
  }

  // ---------------------------------------------------------------------
  // Loading: check a file and repair what can be repaired
  // ---------------------------------------------------------------------

  // Fields added in later schema versions: older files lack them normally,
  // so they are filled in without a warning.
  var QUIET_NEW_FIELDS = ['audio', 'rules', 'documentation', 'vas.showNumbers',
    'vas.additional', 'progress', 'acoustics'];

  // Fields from older versions that are no longer used; dropped on load
  // without a warning (rater blinding was removed in 0.5.0).
  var OBSOLETE_FIELDS = ['blinding'];

  // Unknown fields are kept (not dropped) so a file round-trips unchanged.
  function fillMissing(template, target, prefix, missing, unknown) {
    Object.keys(template).forEach(function (key) {
      var path = prefix ? prefix + '.' + key : key;
      if (!(key in target)) {
        target[key] = clone(template[key]);
        if (QUIET_NEW_FIELDS.indexOf(path) === -1) { missing.push(path); }
      } else if (isPlainObject(template[key])) {
        if (path === 'audio' && target[key] === null) {
          // Format 0.1.0 had "audio": null.
          target[key] = clone(template[key]);
        } else if (isPlainObject(target[key])) {
          fillMissing(template[key], target[key], path, missing, unknown);
        } else {
          target[key] = clone(template[key]);
          missing.push(path + ' (wrong type, reset)');
        }
      }
    });
    Object.keys(target).forEach(function (key) {
      var path = prefix ? prefix + '.' + key : key;
      if (!(key in template)) {
        unknown.push(path);
      }
    });
  }

  // Check every form field's value; invalid values become "not answered".
  function checkFieldValues(s, problems) {
    FIELDS.forEach(function (f) {
      var path = f[0], type = f[1], list = f[2];
      var v = getPath(s, path);
      var fixed;
      switch (type) {
        case 'text':
          if (typeof v !== 'string') { fixed = ''; }
          break;
        case 'date':
          if (typeof v !== 'string' || (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v))) { fixed = ''; }
          break;
        case 'number':
          if (v !== null && (typeof v !== 'number' || !isFinite(v) || v < 0)) { fixed = null; }
          if (v === null && f[3] !== undefined) { fixed = f[3]; }
          break;
        case 'integer':
          if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0)) { fixed = null; }
          break;
        case 'boolean':
          if (typeof v !== 'boolean') { fixed = (path === 'stimuli.showStimulusText'); }
          break;
        case 'vas':
          if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100)) { fixed = null; }
          break;
        case 'single':
          if (v !== null && optionIds(list).indexOf(v) === -1) { fixed = null; }
          // Settings with a default must always have a value.
          if ((fixed === null || v === null) && f[3] !== undefined) { fixed = f[3]; }
          break;
        case 'multi':
          if (!Array.isArray(v)) {
            fixed = [];
          } else {
            var ok = v.filter(function (x) { return optionIds(list).indexOf(x) !== -1; });
            if (ok.length !== v.length) { fixed = ok; }
          }
          break;
      }
      if (fixed !== undefined) {
        if (type === 'multi' && Array.isArray(v)) {
          problems.push(path + ' contained unknown options, which were removed (was ' +
            JSON.stringify(v) + ', now ' + JSON.stringify(fixed) + ')');
        } else {
          problems.push(path + ' had an invalid value (' + JSON.stringify(v) + ') and was cleared');
        }
        setPath(s, path, fixed);
      }
    });

    // Recording list: keep only entries that look like file records.
    if (!Array.isArray(s.audio.files)) {
      problems.push('audio.files was invalid; the recording list was cleared');
      s.audio.files = [];
    } else {
      var before = s.audio.files.length;
      s.audio.files = s.audio.files.filter(function (f) {
        return isPlainObject(f) && typeof f.id === 'string' && typeof f.originalName === 'string' &&
          typeof f.sizeBytes === 'number';
      });
      if (s.audio.files.length !== before) {
        problems.push((before - s.audio.files.length) + ' unreadable entries were removed from the recording list');
      }
    }

    // Expected: { importedAt, sourceFileName, results, importWarnings }.
    if (s.acoustics !== null && !(isPlainObject(s.acoustics) && isPlainObject(s.acoustics.results))) {
      problems.push('The imported acoustic results could not be read and were removed; please import results.json again');
      s.acoustics = null;
    }

    // Added attributes: keep entries with a text label; invalid scores
    // become "not rated".
    if (!Array.isArray(s.vas.additional)) {
      problems.push('vas.additional was invalid; the added attributes were cleared');
      s.vas.additional = [];
    } else {
      s.vas.additional = s.vas.additional.filter(isPlainObject).map(function (a) {
        var score = a.score;
        if (score !== null && (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 100)) {
          problems.push('An added attribute had an invalid score (' + JSON.stringify(score) + ') and was cleared');
          score = null;
        }
        return { label: typeof a.label === 'string' ? a.label : '', score: score === undefined ? null : score };
      });
    }

    ['docCopiedAt', 'csvExportedAt', 'reportOpenedAt', 'reportPrintedAt'].forEach(function (k) {
      if (s.progress[k] !== null && typeof s.progress[k] !== 'string') { s.progress[k] = null; }
    });
  }

  // Returns { session, warnings }; throws an Error with a user-facing
  // message if the file cannot be used.
  function parseSessionText(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('This file is not a valid session file (it could not be read as JSON).');
    }
    if (!isPlainObject(data)) {
      throw new Error('This file is not a valid session file.');
    }
    if (data.fileType !== FILE_TYPE) {
      if (data.fileType === 'cape-vr-acoustic-results') {
        throw new Error('This is a Praat results file (results.json), not a session file. ' +
          'Acoustic results are imported in a later step.');
      }
      throw new Error('This file is not a CAPE-Vr session file (fileType is "' + data.fileType + '").');
    }
    if (typeof data.schemaVersion !== 'string') {
      throw new Error('This session file has no schemaVersion, so it cannot be read safely.');
    }
    if (compareVersions(data.schemaVersion, SCHEMA_VERSION) > 0) {
      throw new Error('This session file was made by a newer version of the app (format ' +
        data.schemaVersion + '). This app understands format ' + SCHEMA_VERSION +
        ' or older. Please use the newer app.');
    }

    var warnings = [];
    var missing = [], unknown = [], problems = [];
    OBSOLETE_FIELDS.forEach(function (k) { delete data[k]; });
    fillMissing(createBlankSession(), data, '', missing, unknown);
    checkFieldValues(data, problems);

    if (missing.length) {
      warnings.push('Some fields were missing and were set to "not answered": ' + missing.join(', ') + '.');
    }
    if (unknown.length) {
      warnings.push('Some fields are not used by this version of the app. They were kept and will be saved again unchanged: ' +
        unknown.join(', ') + '.');
    }
    problems.forEach(function (p) { warnings.push(p + '.'); });
    return { session: data, warnings: warnings };
  }

  // ---------------------------------------------------------------------
  // Saving
  // ---------------------------------------------------------------------

  // <speakerID>_capevr_<YYYY-MM-DD>.json, with unsafe characters as "-".
  function sessionFileName(s) {
    var id = String(getPath(s, 'header.nameOrId') || '').trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return (id || 'session') + '_capevr_' + todayDate() + '.json';
  }

  // Saving is a download (Blob + link) because the app runs from file://
  // and cannot write to disk directly. Returns the file name used.
  function saveSession(s) {
    s.appVersion = APP_VERSION;
    s.schemaVersion = SCHEMA_VERSION;
    s.savedAt = isoNow();

    var name = sessionFileName(s);
    var blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return name;
  }

  window.CapeSession = {
    APP_VERSION: APP_VERSION,
    OPTIONS: OPTIONS,
    isoNow: isoNow,
    formatTime: formatTime,
    newId: newSessionId,
    clone: clone,
    getPath: getPath,
    setPath: setPath,
    createBlankSession: createBlankSession,
    parseSessionText: parseSessionText,
    saveSession: saveSession,
    compareVersions: compareVersions
  };
})();
