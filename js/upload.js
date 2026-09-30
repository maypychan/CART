/*
 * upload.js: recordings (WAV files) and the speaker profile.
 *
 * Reads ONLY WAV header facts (duration, sample rate, channels, bit depth);
 * it never measures the sound, because all acoustic values must come from
 * Praat. Also suggests tasks from file names, numbers takes, plays files,
 * applies speaker profiles, and validates before export.
 *
 * Audio stays in memory as File objects; the session file stores facts about
 * each file, not the audio. After loading a session, the same files must be
 * added again; they reconnect by name and size.
 */
(function () {
  'use strict';

  var S = window.CapeSession;
  var app = null; // helpers shared by form.js: getSession, markDirty, render, renderSteps, showMessage

  // Task labels are used in file names and results.json, so they must match
  // the Praat script exactly. Listed in form order.
  var TASKS = [
    ['vowel_a', 'Vowel /ɑ/'], ['vowel_i', 'Vowel /i/'],
    ['sentence_1', 'Sentence a'], ['sentence_2', 'Sentence b'], ['sentence_3', 'Sentence c'],
    ['sentence_4', 'Sentence d'], ['sentence_5', 'Sentence e'], ['sentence_6', 'Sentence f'],
    ['extemporaneous', 'Extemporaneous speech'], ['reading', 'Reading passage (optional)']
  ];
  var OPTIONAL_TASKS = ['reading'];

  // The first words of each sentence, shown only in the task drop-down so
  // files are easier to match to sentences ("Sentence a (The blue spot…)").
  var SENTENCE_CUES = {
    sentence_1: 'The blue spot…', sentence_2: 'He helped her…', sentence_3: 'We were away…',
    sentence_4: 'I eat eggs…', sentence_5: 'My mama makes…', sentence_6: 'Papa took a…'
  };

  // Speaker profile values. These MUST match the header and the settingsDialog
  // procedure in praat/cape_acoustics.praat, where their sources are cited.
  var PROFILES = {
    adult_female:      { floor: 100, ceiling: 500, formant: 5500 },
    adult_male:        { floor: 75,  ceiling: 300, formant: 5000 },
    child:             { floor: 100, ceiling: 600, formant: 8000 },
    trans_woman:       { floor: 75,  ceiling: 500, formant: 5250 },
    trans_man:         { floor: 75,  ceiling: 500, formant: 5250 },
    other_unspecified: { floor: 75,  ceiling: 600, formant: 5250 }
  };

  // File objects for this browser tab, keyed by "name|size" so that files
  // re-added after loading a session reconnect to their entries.
  var audioFiles = {};   // key -> File
  var audioUrls = {};    // key -> object URL for playing

  function fileKey(name, size) { return name + '|' + size; }

  function taskName(id) {
    for (var i = 0; i < TASKS.length; i++) { if (TASKS[i][0] === id) { return TASKS[i][1]; } }
    return id;
  }

  // ---------------------------------------------------------------------
  // WAV header (metadata only)
  // ---------------------------------------------------------------------

  // Accept only formats stock Praat reads reliably (PCM integer 8/16/24/32-bit
  // and 32-bit float), so problems surface here rather than in Praat.
  function parseWavHeader(buffer, fileSize) {
    var dv = new DataView(buffer);
    function tag(o) {
      return String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    }
    if (buffer.byteLength < 12) { return { error: 'The file is too short to be a WAV file.' }; }
    var riff = tag(0);
    if (riff === 'RF64') { return { error: 'This is an RF64 (very large) WAV file, which is not supported. Please save it as a standard WAV.' }; }
    if (riff !== 'RIFF' || tag(8) !== 'WAVE') {
      return { error: 'This is not a real WAV file (it has no WAV header). It may be another format, such as MP3 or M4A, renamed to .wav.' };
    }
    var off = 12, fmt = null, dataOffset = null, dataSize = null;
    while (off + 8 <= buffer.byteLength) {
      var id = tag(off);
      var size = dv.getUint32(off + 4, true);
      if (id === 'fmt ' && off + 8 + 16 <= buffer.byteLength) {
        fmt = {
          code: dv.getUint16(off + 8, true),
          channels: dv.getUint16(off + 10, true),
          sampleRate: dv.getUint32(off + 12, true),
          blockAlign: dv.getUint16(off + 20, true),
          bits: dv.getUint16(off + 22, true)
        };
        // WAVE_FORMAT_EXTENSIBLE: the real format is in the sub-format field.
        if (fmt.code === 0xFFFE && size >= 40 && off + 8 + 26 <= buffer.byteLength) {
          fmt.code = dv.getUint16(off + 8 + 24, true);
        }
      } else if (id === 'data') {
        dataOffset = off + 8;
        dataSize = size;
        break;
      }
      off += 8 + size + (size % 2);
    }
    if (!fmt) { return { error: 'The WAV header has no format information, so the file cannot be read.' }; }
    var supported = (fmt.code === 1 && [8, 16, 24, 32].indexOf(fmt.bits) !== -1) || (fmt.code === 3 && fmt.bits === 32);
    if (!supported) {
      return { error: 'This WAV uses a format Praat may not read (format code ' + fmt.code + ', ' + fmt.bits +
        '-bit). Please save it again as standard PCM WAV (for example 16-bit or 24-bit).' };
    }
    if (dataOffset === null) { return { error: 'No audio data was found near the start of this WAV file.' }; }
    var note = '';
    if (dataSize === 0xFFFFFFFF || dataOffset + dataSize > fileSize) {
      dataSize = fileSize - dataOffset;
      note = 'The WAV header gives an unusual data size; the duration shown is estimated from the file size.';
    }
    if (!fmt.blockAlign || !fmt.sampleRate) { return { error: 'The WAV header is damaged (sample rate or block size is zero).' }; }
    return {
      durationSec: Math.round(dataSize / fmt.blockAlign / fmt.sampleRate * 1000) / 1000,
      sampleRateHz: fmt.sampleRate,
      channels: fmt.channels,
      bitsPerSample: fmt.bits,
      formatCode: fmt.code,
      note: note
    };
  }

  // ---------------------------------------------------------------------
  // Task suggestion from the file name (a suggestion only; the user decides)
  // ---------------------------------------------------------------------

  function suggestTask(fileName) {
    // "S001_Sent-3 (take 2).wav" -> " s001 sent 3 take 2 "
    var n = ' ' + fileName.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    var m;
    // Sentences: "sentence 1", "sent3", "s3", "sen a", "sentence_c"...
    m = n.match(/ (?:sentence|sent|sen|s) ?([1-6a-f]) /);
    if (m) {
      var k = '123456'.indexOf(m[1]) !== -1 ? Number(m[1]) : 'abcdef'.indexOf(m[1]) + 1;
      return 'sentence_' + k;
    }
    if (/ (?:extemp|extemporaneous|spont|spontaneous|conv|conversation|monologue|mono|free|place)\w* /.test(n)) { return 'extemporaneous'; }
    if (/ (?:read|reading|rainbow|passage|grandfather|caterpillar)\w* /.test(n)) { return 'reading'; }
    if (/ (?:vowel ?i|ee|ii|i) /.test(n)) { return 'vowel_i'; }
    if (/ (?:vowel ?a|ah|aa|a) /.test(n)) { return 'vowel_a'; }
    return null;
  }

  // ---------------------------------------------------------------------
  // Adding and removing files
  // ---------------------------------------------------------------------

  function addFiles(fileList) {
    var session = app.getSession();
    var files = Array.prototype.slice.call(fileList);
    var skipped = [];
    var jobs = files.map(function (file) {
      if (!/\.wave?$/i.test(file.name)) {
        skipped.push(file.name + ': not a .wav file (only WAV recordings can be used).');
        return Promise.resolve();
      }
      var key = fileKey(file.name, file.size);
      var existing = session.audio.files.filter(function (f) { return fileKey(f.originalName, f.sizeBytes) === key; })[0];
      if (existing && audioFiles[key]) {
        skipped.push(file.name + ': already in the list.');
        return Promise.resolve();
      }
      // Read up to the first 4 MB for the header (the audio is not analyzed).
      return file.slice(0, Math.min(file.size, 4 * 1024 * 1024)).arrayBuffer().then(function (buf) {
        var info = parseWavHeader(buf, file.size);
        audioFiles[key] = file;
        if (existing) { return; } // reconnected a file from a loaded session
        var suggestion = info.error ? null : suggestTask(file.name);
        session.audio.files.push({
          id: S.newId(),
          originalName: file.name,
          sizeBytes: file.size,
          lastModified: file.lastModified,
          task: suggestion,
          taskSuggested: suggestion !== null,
          durationSec: info.error ? null : info.durationSec,
          sampleRateHz: info.error ? null : info.sampleRateHz,
          channels: info.error ? null : info.channels,
          bitsPerSample: info.error ? null : info.bitsPerSample,
          formatCode: info.error ? null : info.formatCode,
          formatError: info.error || null,
          headerNote: info.note || '',
          playCount: 0
        });
      });
    });
    Promise.all(jobs).then(function () {
      sortFiles(session);
      if (skipped.length) { app.showMessage('warning', 'Some files were not added:', skipped); }
      app.markDirty();
      render();
    });
  }

  function sortFiles(session) {
    var order = TASKS.map(function (t) { return t[0]; });
    session.audio.files.sort(function (a, b) {
      var ta = a.task ? order.indexOf(a.task) : 99, tb = b.task ? order.indexOf(b.task) : 99;
      if (ta !== tb) { return ta - tb; }
      // Compare without ".wav", so "vowel i.wav" comes before "vowel i take2.wav".
      var na = a.originalName.replace(/\.[^.]*$/, ''), nb = b.originalName.replace(/\.[^.]*$/, '');
      return na.localeCompare(nb, undefined, { numeric: true });
    });
  }

  function removeFile(id) {
    var session = app.getSession();
    var entry = session.audio.files.filter(function (f) { return f.id === id; })[0];
    if (!entry) { return; }
    var key = fileKey(entry.originalName, entry.sizeBytes);
    if (players[key]) { players[key].pause(); delete players[key]; }
    if (audioUrls[key]) { URL.revokeObjectURL(audioUrls[key]); delete audioUrls[key]; }
    delete audioFiles[key];
    session.audio.files = session.audio.files.filter(function (f) { return f.id !== id; });
    app.markDirty();
    render();
  }

  function forgetAllAudio() {
    Object.keys(players).forEach(function (k) { players[k].pause(); });
    Object.keys(audioUrls).forEach(function (k) { URL.revokeObjectURL(audioUrls[k]); });
    audioFiles = {};
    audioUrls = {};
    players = {};
  }

  // ---------------------------------------------------------------------
  // Takes and export names
  // ---------------------------------------------------------------------

  // A safe speaker ID for file names: the "Speaker ID for file names" field,
  // or, if that is empty, Name/ID with unsafe characters replaced.
  function speakerIdFromNameOrId(session) {
    return String(session.header.nameOrId || '').trim()
      .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '');
  }
  function effectiveSpeakerId(session) {
    var typed = String(session.audio.speakerIdForFiles || '').trim();
    return typed || speakerIdFromNameOrId(session);
  }

  // For "Hide names" (report and CSV). If no separate Speaker ID was typed,
  // the speaker code (and every exported file name) is built from Name/ID,
  // so it would reveal the name. maskName() replaces the Name/ID, and the
  // code made from it, where it starts a file name ("Jane-Doe_vowel_a.wav"
  // -> "[ID]_vowel_a.wav"). hiddenCode() is the code to show instead of
  // Name/ID: the typed Speaker ID, or '' if there is none.
  function namesToHide(session) {
    var typed = String(session.audio.speakerIdForFiles || '').trim();
    var raw = String(session.header.nameOrId || '').trim();
    return [raw, speakerIdFromNameOrId(session)].filter(function (x, i, all) {
      return x && x !== typed && all.indexOf(x) === i;
    });
  }
  function maskName(session, text) {
    var s = String(text === null || text === undefined ? '' : text);
    namesToHide(session).forEach(function (id) {
      if (s === id) { s = '[ID]'; return; }
      var safe = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp('(^|[^A-Za-z0-9])' + safe + '(?=_)', 'g'), '$1[ID]');
    });
    return s;
  }
  function hiddenCode(session) {
    var typed = String(session.audio.speakerIdForFiles || '').trim();
    if (typed) { return typed; }
    // A code from a standalone Praat run is fine, unless it is the name.
    var fromResults = session.acoustics && session.acoustics.results.speakerID;
    return fromResults && maskName(session, fromResults) === fromResults ? fromResults : '';
  }

  // For each file: take number, and the name it gets in the Praat package.
  // One take -> "<id>_<task>.wav". Several takes -> "<id>_<task>_t1.wav", "_t2"...
  function planNames(session) {
    // With no ID yet, show a placeholder (export is blocked until there is one).
    var id = effectiveSpeakerId(session) || '[speaker ID]';
    var counts = {}, seen = {};
    // Excluded takes are skipped when numbering, so packaged takes run
    // _t1, _t2... without gaps and excluded audio never enters the package.
    session.audio.files.forEach(function (f) { if (f.task && !f.excluded) { counts[f.task] = (counts[f.task] || 0) + 1; } });
    return session.audio.files.map(function (f) {
      if (f.excluded) { return { entry: f, take: null, exportName: null, excluded: true }; }
      if (!f.task) { return { entry: f, take: null, exportName: null }; }
      seen[f.task] = (seen[f.task] || 0) + 1;
      var take = seen[f.task];
      var name = id + '_' + f.task + (counts[f.task] > 1 ? '_t' + take : '') + '.wav';
      return { entry: f, take: take, exportName: name };
    });
  }

  // ---------------------------------------------------------------------
  // Checks before export
  // ---------------------------------------------------------------------

  // Returns { errors: [...], warnings: [...], rows: { id: { errors, warnings } } }
  function validate(session) {
    var a = session.audio;
    var errors = [], warnings = [], rows = {};
    var id = effectiveSpeakerId(session);

    if (!a.files.length) { errors.push('Add at least one WAV recording.'); }
    if (!id) {
      errors.push('Enter a speaker ID for the file names (or fill in Name/ID on the form).');
    } else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
      errors.push('The speaker ID for file names may only contain letters, digits, "-" and "_", and must start with a letter or digit.');
    }
    if (!a.speakerProfile) { errors.push('Choose a speaker profile.'); }
    var fl = a.pitchFloorHz, ce = a.pitchCeilingHz, fc = a.formantCeilingHz;
    if (!(fl > 0) || !(ce > 0)) { errors.push('Enter the pitch floor and pitch ceiling (Hz).'); }
    else if (fl >= ce) { errors.push('The pitch floor must be below the pitch ceiling.'); }
    if (!(fc > 0)) { errors.push('Enter the formant ceiling (Hz).'); }

    var adv = a.advanced;
    if (!(adv.vowelWindowSec > 0)) { errors.push('Advanced settings: the vowel analysis window must be more than 0 seconds.'); }
    if (!(adv.vowelShortFraction > 0 && adv.vowelShortFraction <= 1)) { errors.push('Advanced settings: the short-vowel fraction must be above 0 and at most 1.'); }
    if (!(adv.formantCount >= 3)) { errors.push('Advanced settings: the number of formants must be at least 3.'); }

    var seenContent = {};
    if (a.files.length && a.files.every(function (f) { return f.excluded; })) {
      errors.push('Every recording is excluded, so there is nothing to put in the package.');
    }
    a.files.forEach(function (f) {
      var r = { errors: [], warnings: [] };
      var key = fileKey(f.originalName, f.sizeBytes);
      if (f.excluded) { rows[f.id] = r; return; }
      if (f.formatError) { r.errors.push(f.formatError); }
      if (!audioFiles[key]) { r.errors.push('Not loaded in this window. Add this file again (same file) to play or export it, or remove it.'); }
      if (!f.task) { r.errors.push('Choose a task for this file.'); }
      if (!f.formatError && f.sampleRateHz) {
        if (f.sampleRateHz < 10000) { r.warnings.push('Sample rate ' + f.sampleRateHz + ' Hz: CPPS needs at least 10000 Hz and will be reported as not available.'); }
        var isVowel = f.task === 'vowel_a' || f.task === 'vowel_i';
        if (isVowel && fc > 0 && f.sampleRateHz < 2 * fc) { r.warnings.push('Sample rate ' + f.sampleRateHz + ' Hz is below twice the formant ceiling (' + (2 * fc) + ' Hz): formants will be reported as not available.'); }
        if (isVowel && f.durationSec !== null && f.durationSec < adv.vowelWindowSec) { r.warnings.push('Shorter than ' + adv.vowelWindowSec + ' s: the script will analyze the middle ' + Math.round(adv.vowelShortFraction * 100) + '% of the voiced part.'); }
        if (f.task === 'extemporaneous' && f.durationSec !== null && f.durationSec < 20) { r.warnings.push('Shorter than 20 s (the protocol asks for at least 20 seconds of speech).'); }
        if (f.headerNote) { r.warnings.push(f.headerNote); }
      }
      // Without analyzing audio, identical size + header facts is the best
      // available hint that the same recording was added twice.
      var sig = [f.sizeBytes, f.durationSec, f.sampleRateHz, f.channels, f.bitsPerSample].join('|');
      if (seenContent[sig] && !f.formatError) { r.warnings.push('This may be the same recording as "' + seenContent[sig] + '" (same size and format).'); }
      else { seenContent[sig] = f.originalName; }
      rows[f.id] = r;
      r.errors.forEach(function (e) { errors.push(f.originalName + ': ' + e); });
      r.warnings.forEach(function (w) { warnings.push(f.originalName + ': ' + w); });
    });

    var present = {};
    a.files.forEach(function (f) { if (f.task && !f.excluded) { present[f.task] = true; } });
    var missing = TASKS.filter(function (t) { return !present[t[0]] && OPTIONAL_TASKS.indexOf(t[0]) === -1; })
      .map(function (t) { return t[1]; });
    if (a.files.length && missing.length) {
      warnings.push('No recording yet for: ' + missing.join(', ') + '. The Praat results will list these as missing.');
    }
    return { errors: errors, warnings: warnings, rows: rows };
  }

  // ---------------------------------------------------------------------
  // Speaker profile -> pitch and formant settings
  // ---------------------------------------------------------------------

  function applyProfile(session) {
    var p = PROFILES[session.audio.speakerProfile];
    if (!p) { return; }
    session.audio.pitchFloorHz = p.floor;
    session.audio.pitchCeilingHz = p.ceiling;
    session.audio.formantCeilingHz = p.formant;
  }

  // Were pitch or formant values changed from the profile's defaults?
  function overrides(session) {
    var p = PROFILES[session.audio.speakerProfile] || {};
    return {
      pitch: session.audio.pitchFloorHz !== p.floor || session.audio.pitchCeilingHz !== p.ceiling,
      formant: session.audio.formantCeilingHz !== p.formant
    };
  }

  // ---------------------------------------------------------------------
  // Drawing the recording list
  // ---------------------------------------------------------------------

  function formatMeta(f) {
    if (f.formatError) { return ''; }
    var ch = f.channels === 1 ? 'mono' : (f.channels === 2 ? 'stereo' : f.channels + ' channels');
    return f.durationSec.toFixed(1) + ' s · ' + (f.sampleRateHz / 1000) + ' kHz · ' + ch + ' · ' + f.bitsPerSample + '-bit';
  }

  var players = {};  // key -> <audio> element, kept between redraws

  function getPlayer(key, name) {
    if (players[key]) { return players[key]; }
    if (!audioUrls[key]) { audioUrls[key] = URL.createObjectURL(audioFiles[key]); }
    var audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';
    audio.src = audioUrls[key];
    audio.setAttribute('aria-label', 'Play ' + name);
    // Count a play when playback starts from the beginning (not on resume).
    audio.addEventListener('play', function () {
      if (audio.currentTime >= 0.25) { return; }
      var entry = app.getSession().audio.files.filter(function (f) {
        return fileKey(f.originalName, f.sizeBytes) === key;
      })[0];
      if (!entry) { return; }
      entry.playCount = (entry.playCount || 0) + 1;
      if (audio._counter) { audio._counter.textContent = 'played ' + entry.playCount + '×'; }
      app.markDirty();
    });
    ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(function (ev) {
      audio.addEventListener(ev, updateFloatingState);
    });
    players[key] = audio;
    return audio;
  }

  // ---------------------------------------------------------------------
  // Floating player: playable while rating the form. It reuses the same
  // <audio> elements as the Recordings list so play counts stay consistent.
  // ---------------------------------------------------------------------

  var floatHidden = false;   // "Hide" state, for this window only

  function mmss(t) {
    if (!isFinite(t)) { return '0:00'; }
    var m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function renderFloating() {
    var session = app.getSession();
    var box = document.getElementById('float-player');
    var listEl = document.getElementById('fp-list');
    var plan = planNames(session);
    var playable = plan.filter(function (p) {
      var f = p.entry;
      return audioFiles[fileKey(f.originalName, f.sizeBytes)] && !f.formatError;
    });
    box.hidden = playable.length === 0;
    listEl.hidden = floatHidden;
    document.getElementById('fp-toggle').textContent = floatHidden ? 'Show' : 'Hide';
    document.getElementById('fp-toggle').setAttribute('aria-expanded', floatHidden ? 'false' : 'true');
    listEl.innerHTML = '';
    playable.forEach(function (p) {
      var f = p.entry;
      var key = fileKey(f.originalName, f.sizeBytes);
      var audio = getPlayer(key, f.originalName);
      var row = el('div', 'fp-row' + (f.excluded ? ' is-excluded' : ''));
      var btn = el('button', 'fp-play', '▶');
      btn.type = 'button';
      btn.dataset.key = key;
      btn.addEventListener('click', function () {
        if (audio.paused) {
          // Only one recording plays at a time.
          Object.keys(players).forEach(function (k) { if (k !== key) { players[k].pause(); } });
          audio.play();
        } else {
          audio.pause();
        }
      });
      row.appendChild(btn);
      var label = el('div', 'fp-label');
      label.appendChild(el('div', 'fp-task', f.task ? taskName(f.task) + (p.take && plan.filter(function (x) { return x.entry.task === f.task && !x.excluded; }).length > 1 ? ', take ' + p.take : '') + (f.excluded ? ' (excluded)' : '') : f.originalName));
      label.appendChild(el('div', 'fp-name', f.originalName));
      row.appendChild(label);
      var time = el('span', 'fp-time', '');
      time.dataset.key = key;
      row.appendChild(time);
      listEl.appendChild(row);
    });
    updateFloatingState();
  }

  // Updates in place (not a full rebuild) because it runs on every timeupdate.
  function updateFloatingState() {
    Array.prototype.forEach.call(document.querySelectorAll('#fp-list .fp-play'), function (b) {
      var a = players[b.dataset.key];
      var playing = a && !a.paused && !a.ended;
      b.textContent = playing ? '❚❚' : '▶';
      b.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + b.parentNode.querySelector('.fp-task').textContent);
      b.parentNode.classList.toggle('is-playing', !!playing);
    });
    Array.prototype.forEach.call(document.querySelectorAll('#fp-list .fp-time'), function (t) {
      var a = players[t.dataset.key];
      t.textContent = a ? mmss(a.currentTime) + ' / ' + mmss(a.duration) : '';
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }

  function render() {
    if (!app) { return; }
    var session = app.getSession();
    var list = document.getElementById('recordings-list');
    var plan = planNames(session);
    var check = validate(session);
    list.innerHTML = '';

    if (!session.audio.files.length) {
      list.appendChild(el('p', 'muted', 'No recordings yet. Drag WAV files here, or use “Add WAV files…”.'));
    }

    plan.forEach(function (p) {
      var f = p.entry;
      var key = fileKey(f.originalName, f.sizeBytes);
      var row = el('div', 'rec-row');
      var r = check.rows[f.id] || { errors: [], warnings: [] };
      if (r.errors.length) { row.classList.add('has-error'); }

      // The same player is reused on every redraw so playback is not interrupted.
      var playerCell = el('div', 'rec-player');
      var counter = el('span', 'play-count', 'played ' + (f.playCount || 0) + '×');
      if (audioFiles[key] && !f.formatError) {
        var audio = getPlayer(key, f.originalName);
        audio._counter = counter;
        playerCell.appendChild(audio);
      }
      playerCell.appendChild(counter);
      row.appendChild(playerCell);

      var info = el('div', 'rec-info');
      info.appendChild(el('div', 'rec-name', f.originalName));
      info.appendChild(el('div', 'rec-meta', formatMeta(f)));
      row.appendChild(info);

      var taskCell = el('div', 'rec-task');
      var select = document.createElement('select');
      select.setAttribute('aria-label', 'Task for ' + f.originalName);
      var blank = el('option', null, '— choose task —');
      blank.value = '';
      select.appendChild(blank);
      TASKS.forEach(function (t) {
        var o = el('option', null, t[1] + (SENTENCE_CUES[t[0]] ? ' (' + SENTENCE_CUES[t[0]] + ')' : ''));
        o.value = t[0];
        select.appendChild(o);
      });
      select.value = f.task || '';
      select.disabled = !!f.formatError;
      select.addEventListener('change', function () {
        f.task = select.value || null;
        f.taskSuggested = false;
        sortFiles(session);
        app.markDirty();
        render();
      });
      taskCell.appendChild(select);
      if (f.task && f.taskSuggested) { taskCell.appendChild(el('span', 'badge', 'suggested from file name')); }
      row.appendChild(taskCell);

      var out = el('div', 'rec-export');
      if (p.exportName) {
        out.appendChild(el('span', 'muted', 'take ' + p.take + ' → '));
        out.appendChild(el('code', null, p.exportName));
      } else if (f.excluded) {
        out.appendChild(el('span', 'muted', 'Excluded: not put in the Praat package, and left out of the summary.'));
      }
      var exL = el('label', 'rec-exclude');
      var exC = document.createElement('input');
      exC.type = 'checkbox';
      exC.checked = !!f.excluded;
      exC.addEventListener('change', function () {
        f.excluded = exC.checked;
        if (!f.excluded) { f.excludedReason = ''; }
        app.markDirty();
        render();
        if (window.CapeSummary) { window.CapeSummary.render(); }
      });
      exL.appendChild(exC);
      exL.appendChild(document.createTextNode(' Exclude this take'));
      out.appendChild(exL);
      if (f.excluded) {
        var reason = document.createElement('input');
        reason.type = 'text';
        reason.className = 'rec-exclude-reason';
        reason.placeholder = 'reason (e.g. cough, restarted)';
        reason.value = f.excludedReason || '';
        reason.setAttribute('aria-label', 'Reason for excluding ' + f.originalName);
        reason.addEventListener('input', function () { f.excludedReason = reason.value; app.markDirty(); });
        out.appendChild(reason);
        row.classList.add('is-excluded');
      }
      row.appendChild(out);

      var rm = el('button', 'rec-remove', 'Remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', 'Remove ' + f.originalName);
      rm.addEventListener('click', function () { removeFile(f.id); });
      row.appendChild(rm);

      if (r.errors.length || r.warnings.length) {
        var notes = el('ul', 'rec-notes');
        r.errors.forEach(function (e) { notes.appendChild(el('li', 'is-error', e)); });
        r.warnings.forEach(function (w) { notes.appendChild(el('li', 'is-warning', w)); });
        row.appendChild(notes);
      }
      list.appendChild(row);
    });

    // Privacy: the speaker ID appears in every exported file name, so warn when
    // it is falling back to Name/ID (which may be a real name).
    var idInput = document.getElementById('speaker-id-files');
    var fromName = speakerIdFromNameOrId(session);
    idInput.placeholder = fromName ? fromName + '  (from Name/ID)' : 'e.g. S001';
    document.getElementById('speaker-id-note').textContent =
      (!String(session.audio.speakerIdForFiles || '').trim() && fromName)
        ? 'Using Name/ID. If it contains a real name, type a code here instead: this ID appears in every exported file name.'
        : '';

    var ov = overrides(session);
    document.getElementById('pitch-override-note').textContent =
      session.audio.speakerProfile && ov.pitch ? 'changed from the profile default' : '';
    document.getElementById('formant-override-note').textContent =
      session.audio.speakerProfile && ov.formant ? 'changed from the profile default' : '';

    var summary = document.getElementById('export-summary');
    summary.textContent = check.errors.length
      ? check.errors.length + ' thing(s) to fix before export.'
      : (session.audio.files.length ? 'Ready to export' + (check.warnings.length ? ' (' + check.warnings.length + ' warning(s)).' : '.') : '');
    summary.className = 'export-summary' + (check.errors.length ? ' is-error' : '');

    var last = session.audio.lastExport;
    document.getElementById('export-last').textContent = last
      ? 'Last package: ' + last.packageName + ', ' + S.formatTime(last.at) + '.' : '';

    renderFloating();
    if (app.renderSteps) { app.renderSteps(); }   // the step hint depends on loaded audio
  }

  function hasPlayableAudio() {
    return app.getSession().audio.files.some(function (f) {
      return audioFiles[fileKey(f.originalName, f.sizeBytes)] && !f.formatError;
    });
  }

  // ---------------------------------------------------------------------
  // Start up
  // ---------------------------------------------------------------------

  function init(shared) {
    app = shared;
    document.getElementById('fp-toggle').addEventListener('click', function () {
      floatHidden = !floatHidden;
      renderFloating();
    });
    var input = document.getElementById('wav-input');
    document.getElementById('btn-add-wav').addEventListener('click', function () { input.value = ''; input.click(); });
    input.addEventListener('change', function () { if (input.files.length) { addFiles(input.files); } });

    var zone = document.getElementById('recordings');
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-dragover'); });
    zone.addEventListener('dragleave', function (e) { if (!zone.contains(e.relatedTarget)) { zone.classList.remove('is-dragover'); } });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files.length) { addFiles(e.dataTransfer.files); }
    });
    // Dropping a file anywhere else should not open it in the browser.
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    // When the profile changes, fill in its pitch and formant values.
    document.addEventListener('cape:changed', function (e) {
      var path = e.detail.path;
      var session = app.getSession();
      if (path === 'audio.speakerProfile') {
        applyProfile(session);
        app.render();
      } else if (path.indexOf('audio.') === 0 || path === 'header.nameOrId') {
        render();
      }
    });
  }

  window.CapeUpload = {
    TASKS: TASKS,
    init: init,
    render: render,
    validate: validate,
    planNames: planNames,
    overrides: overrides,
    effectiveSpeakerId: effectiveSpeakerId,
    maskName: maskName,
    hiddenCode: hiddenCode,
    getFile: function (entry) { return audioFiles[fileKey(entry.originalName, entry.sizeBytes)] || null; },
    // Was the file behind this results.json entry excluded by the clinician
    // (possibly after the package was made)? Returns { reason } or null.
    exclusionForResult: function (session, exportName) {
      var le = session.audio && session.audio.lastExport;
      if (!le || !Array.isArray(le.files)) { return null; }
      var ex = le.files.filter(function (x) { return x.exportName === exportName; })[0];
      if (!ex) { return null; }
      var entry = session.audio.files.filter(function (f) { return f.id === ex.id; })[0];
      return entry && entry.excluded ? { reason: entry.excludedReason || '' } : null;
    },
    forgetAllAudio: forgetAllAudio,
    hasPlayableAudio: hasPlayableAudio,
    // exposed for testing in the browser console
    _parseWavHeader: parseWavHeader,
    _suggestTask: suggestTask
  };
})();
