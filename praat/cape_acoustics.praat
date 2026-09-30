# ======================================================================
# cape_acoustics.praat
# CAPE-Vr Clinical Acoustic Reporting Tool (CART): acoustic analysis script for stock Praat
#
# Script version 0.1.0. Developed for Praat 7.0.02.
# Methods and output format: see the CART documentation.
#
# HOW TO RUN
#   1. Put this script and the WAV files in ONE folder, plus cape_settings.tsv
#      if you have one (the app creates it).
#   2. In Praat: Praat menu > Open Praat script... > choose this file.
#   3. In the script window: Run > Run.
#   4. Praat may ask whether you trust this script. That is Praat's own
#      security check, because the script saves results.json. Allow it.
#   5. With no cape_settings.tsv, a dialog asks for the speaker ID and the
#      speaker profile. Every other setting uses the default values.
#   6. results.json appears in the same folder. Progress is shown in the
#      Praat Info window.
#   If results.json already exists, you will be asked before it is replaced.
#
# FILE NAMES
#   <speakerID>_<task>.wav  or  <speakerID>_<task>_t<N>.wav  (N = take number)
#   task = vowel_a, vowel_i, sentence_1 ... sentence_6, extemporaneous, reading
#   Other file names, and non-WAV audio files, are listed in results.json
#   under "unrecognizedFiles". Nothing is skipped silently.
#
# SETTINGS READ FROM cape_settings.tsv (defaults and sources)
#   speakerProfile      adult_male | adult_female | child | trans_woman |
#                       trans_man | other_unspecified (label only; the numbers
#                       below come from the file)
#   pitchFloorHz / pitchCeilingHz, by profile:
#                       adult_male 75/300, adult_female 100/500
#                         (Praat manual, "Pitch settings")
#                       child 100/600 (600 = Praat's default pitch ceiling)
#                       trans_woman, trans_man 75/500; other_unspecified 75/600
#                         (wide-range defaults, NOT norms)
#   formantCeilingHz    adult_male 5000, adult_female 5500, child 8000
#                         (Praat manual, "Sound: To Formant (burg)...")
#                       trans_woman, trans_man, other_unspecified 5250
#                         (midway between the male and female values)
#   pitchOverridden / formantOverridden   yes | no (whether the user changed them)
#   formantCount        5 (Praat default for To Formant (burg))
#   vowelWindowSec      3 = analyze the middle 3 s of the voiced part of each
#                       vowel, found by voicing detection (3 s as in
#                       Maryn & Weenink 2015)
#   vowelShortFraction  0.5 = if the voiced part is shorter than
#                       vowelWindowSec, analyze its middle 50%
#   formantWindow       whole_trimmed (default) | midpoint
#   cppsMethod          maryn_weenink_2015 (default) | praat_default
#   cppsSpeechVoicedOnly, intensitySpeechVoicedOnly   yes (default) | no
#   intensityAveraging  energy (Praat default) | dB
#   hnrMethod           cc (default) | ac
#   periodRangeMode     derived (default; as in Praat's Voice report) | fixed
#   jitterMeasures      default "local"; any of local, local_absolute, rap, ppq5, ddp
#   shimmerMeasures     default "local,local_db"; any of local, local_db, apq3,
#                       apq5, apq11, dda
#   channelHandling     average (default; Praat "Convert to mono") | left
#   speakerID, schemaVersion, appVersion, createdAt   (written by the app)
#
# NOTES
#   - Intensity is uncalibrated dB (relative), never SPL.
#   - A measure that fails is written as null with a reason, never as 0.
#   - Takes are reported separately; nothing is averaged across takes.
#   - If a Praat command fails (for example in an older Praat version), Praat
#     shows the message in a window; please keep a note of it.
# ======================================================================

scriptVersion$ = "0.1.0"
resultsSchemaVersion$ = "0.2.0"
# Version of the cape_settings.tsv format; must match the app (js/export.js).
settingsSchemaVersion$ = "0.1.0"
testedPraatVersion = 7002
testedPraatVersion$ = "7.0.02"

# ----------------------------------------------------------------------
# FIXED ANALYSIS PARAMETERS
# These are not in the settings file. All of them are echoed into
# results.json under "analysisParameters".
# ----------------------------------------------------------------------

# Pitch: Sound: To Pitch (cc)... Praat defaults (Praat manual; Boersma 1993).
# "(cc)" is Praat's older name for "To Pitch (raw cross-correlation)" and is
# used so that the script also runs in older Praat versions.
pitchTimeStep = 0
pitchMaxCandidates = 15
pitchVeryAccurate$ = "no"
pitchSilenceThreshold = 0.03
pitchVoicingThreshold = 0.45
pitchOctaveCost = 0.01
pitchOctaveJumpCost = 0.35
pitchVoicedUnvoicedCost = 0.14

# Voiced/unvoiced intervals for speech tasks:
# PointProcess: To TextGrid (vuv)... (check against your Praat version's dialog).
vuvMaxPeriod = 0.02
vuvMeanPeriod = 0.01

# Intensity: Sound: To Intensity... (minimum pitch = pitch floor, time step
# automatic, subtract mean = yes). Praat manual.
intensityTimeStep = 0
intensitySubtractMean$ = "yes"

# CPPS: Sound: To PowerCepstrogram... (both presets).
# Maryn & Weenink (2015), J Voice 29(1):35-43.
cppsPitchFloor = 60
cppsTimeStep = 0.002
cppsMaxFrequency = 5000
cppsPreEmphasis = 50
cppsMinSampleRate = 2 * cppsMaxFrequency

# CPPS preset "maryn_weenink_2015": every value below matches the Appendix
# script of Maryn & Weenink (2015), AVQI v02.02 (checked against the published script).
# Trend line quefrency range 0.001 to 0 (0 = up to the highest quefrency).
# That script high-pass filters the sound before CPPS:
# Filter (stop Hann band): 0, 34, 0.1. This preset does the same, for CPPS only.
mwHighPassHz = 34
mwHighPassSmoothing = 0.1
mwSubtractTrend$ = "no"
mwTimeAveraging = 0.01
mwQuefrencyAveraging = 0.001
mwPeakMinHz = 60
mwPeakMaxHz = 330
mwTolerance = 0.05
mwInterpolation$ = "parabolic"
mwTrendFrom = 0.001
mwTrendTo = 0
mwTrendType$ = "Straight"
mwFitMethod$ = "Robust"

# CPPS preset "praat_default": Praat 7.0.02 dialog defaults for Get CPPS
# These defaults have changed across Praat versions; check them against the dialog.
pdSubtractTrend$ = "yes"
pdTimeAveraging = 0.02
pdQuefrencyAveraging = 0.0005
pdPeakMinHz = 60
pdPeakMaxHz = 330
pdTolerance = 0.05
pdInterpolation$ = "parabolic"
pdTrendFrom = 0.001
pdTrendTo = 0.05
pdTrendType$ = "Exponential decay"
pdFitMethod$ = "Robust slow"

# HNR: Sound: To Harmonicity (cc)/(ac)... Praat defaults (Boersma 1993;
# Praat manual).
hnrTimeStep = 0.01
hnrSilenceThreshold = 0.1
hnrPeriodsPerWindowCc = 1.0
hnrPeriodsPerWindowAc = 4.5

# Jitter and shimmer: Praat manual, "Voice 2. Jitter" and "Voice 3. Shimmer".
# The fixed period range and the factors are also those of the Maryn & Weenink (2015) AVQI script.
fixedShortestPeriod = 0.0001
fixedLongestPeriod = 0.02
maxPeriodFactor = 1.3
maxAmplitudeFactor = 1.6

# Vowel window: warn if the window contains an unvoiced stretch at least
# this long. This only triggers a warning and changes no values (design
# choice, no published source).
vowelGapWarningSec = 0.1

# Formants: Sound: To Formant (burg)... Praat defaults (Praat manual).
formantTimeStep = 0
formantWindowLength = 0.025
formantPreEmphasis = 50

# ----------------------------------------------------------------------
# TASK LABELS (must match the app). "reading" is optional, so it is never
# reported as missing.
# ----------------------------------------------------------------------
task$[1] = "vowel_a"
task$[2] = "vowel_i"
task$[3] = "sentence_1"
task$[4] = "sentence_2"
task$[5] = "sentence_3"
task$[6] = "sentence_4"
task$[7] = "sentence_5"
task$[8] = "sentence_6"
task$[9] = "extemporaneous"
task$[10] = "reading"
nTasks = 10
for t to nTasks
    taskFound[t] = 0
    taskRequired[t] = 1
endfor
taskRequired[10] = 0

# Audio extensions reported as "not WAV" (other files, such as this script,
# are ignored).
otherAudio$ = "|flac|mp3|m4a|aif|aiff|ogg|wma|aac|opus|"

# ======================================================================
# START
# ======================================================================
folder$ = defaultDirectory$
settingsPath$ = folder$ + "/cape_settings.tsv"
resultsPath$ = folder$ + "/results.json"

writeInfoLine: "CAPE-Vr acoustics script ", scriptVersion$, " (Praat ", praatVersion$, ")"
appendInfoLine: "Folder: ", folder$

# Ask before replacing an existing results.json, so earlier results are never lost silently.
if fileReadable (resultsPath$)
    beginPause: "results.json already exists"
        comment: "This folder already contains a results.json file."
        comment: "Running the analysis will replace it."
    clicked = endPause: "Cancel", "Overwrite", 2, 1
    if clicked = 1
        exitScript: "Cancelled. The existing results.json was not changed."
    endif
endif

# Warnings collected during the run, written to results.json.
nWarnings = 0

if praatVersion < testedPraatVersion
    @addWarning: "This Praat version (" + praatVersion$ + ") is older than the tested version (" + testedPraatVersion$ + "). Results may differ, and some measures may fail."
endif

# ----------------------------------------------------------------------
# READ AND CHECK SETTINGS
# ----------------------------------------------------------------------
# Settings come from cape_settings.tsv if it is there. Otherwise a dialog
# asks for them, and they are put into a table with the same rows, so the
# rest of the script works the same way.
if fileReadable (settingsPath$)
    settingsSource$ = "file"
    appendInfoLine: "Settings: cape_settings.tsv"
    settingsTable = Read Table from tab-separated file: settingsPath$
    nameColumn = Get column index: "name"
    valueColumn = Get column index: "value"
    if nameColumn = 0 or valueColumn = 0
        exitScript: "cape_settings.tsv must have two columns with the headers ""name"" and ""value""."
    endif
else
    settingsSource$ = "dialog"
    appendInfoLine: "Settings: no cape_settings.tsv found, so settings were chosen in the dialog"
    @settingsDialog
    settingsTable = settingsDialog.table
endif

@getText: "speakerID"
speakerID$ = getText.value$
@getChoice: "speakerProfile", "adult_male|adult_female|child|trans_woman|trans_man|other_unspecified"
speakerProfile$ = getChoice.value$
@getText: "appVersion"
appVersion$ = getText.value$

@getNumber: "pitchFloorHz"
pitchFloor = getNumber.value
@getNumber: "pitchCeilingHz"
pitchCeiling = getNumber.value
if pitchFloor <= 0 or pitchCeiling <= pitchFloor
    exitScript: "pitchFloorHz must be above 0 and below pitchCeilingHz."
endif
@getChoice: "pitchOverridden", "yes|no"

@getNumber: "formantCeilingHz"
formantCeiling = getNumber.value
if formantCeiling <= 0
    exitScript: "formantCeilingHz must be above 0."
endif
@getChoice: "formantOverridden", "yes|no"
@getNumber: "formantCount"
formantCount = getNumber.value
if formantCount < 3
    exitScript: "formantCount must be at least 3 (F1 to F3 are reported)."
endif

@getNumber: "vowelWindowSec"
vowelWindowSec = getNumber.value
if vowelWindowSec <= 0
    exitScript: "vowelWindowSec must be above 0 (default 3 = the middle 3 s of the voiced vowel)."
endif
@getNumber: "vowelShortFraction"
vowelShortFraction = getNumber.value
if vowelShortFraction <= 0 or vowelShortFraction > 1
    exitScript: "vowelShortFraction must be above 0 and at most 1 (0.5 = middle 50% of a short vowel)."
endif

@getChoice: "formantWindow", "whole_trimmed|midpoint"
formantWindow$ = getChoice.value$
@getChoice: "cppsMethod", "maryn_weenink_2015|praat_default"
cppsMethod$ = getChoice.value$
@getChoice: "cppsSpeechVoicedOnly", "yes|no"
cppsSpeechVoicedOnly$ = getChoice.value$
@getChoice: "intensitySpeechVoicedOnly", "yes|no"
intensitySpeechVoicedOnly$ = getChoice.value$
@getChoice: "intensityAveraging", "energy|dB"
intensityAveraging$ = getChoice.value$
@getChoice: "hnrMethod", "cc|ac"
hnrMethod$ = getChoice.value$
@getChoice: "periodRangeMode", "derived|fixed"
periodRangeMode$ = getChoice.value$
@getChoice: "channelHandling", "average|left"
channelHandling$ = getChoice.value$
@getList: "jitterMeasures", "local|local_absolute|rap|ppq5|ddp"
jitterMeasures$ = getList.value$
@getList: "shimmerMeasures", "local|local_db|apq3|apq5|apq11|dda"
shimmerMeasures$ = getList.value$

# Period range for jitter and shimmer.
if periodRangeMode$ = "derived"
    # Praat manual, "Voice 2. Jitter": 0.8 / pitch ceiling and 1.25 / pitch floor.
    shortestPeriod = 0.8 / pitchCeiling
    longestPeriod = 1.25 / pitchFloor
else
    shortestPeriod = fixedShortestPeriod
    longestPeriod = fixedLongestPeriod
endif

# Safeguard (design choice): an analysis segment must be long enough for
# Praat's analysis windows at the lowest floor used (6.4 periods).
minAnalysisDuration = max (6.4 / pitchFloor, 6.4 / cppsPitchFloor)

# ----------------------------------------------------------------------
# LIST AND CLASSIFY FILES
# ----------------------------------------------------------------------
fileList = Create Strings as file list: "files", folder$ + "/*"
nFiles = Get number of strings
nWav = 0
nUnrecognized = 0
seenKeys$ = "|"
@toLower: speakerID$
speakerIDLower$ = toLower.result$

for i to nFiles
    selectObject: fileList
    name$ = Get string: i
    @toLower: name$
    lower$ = toLower.result$
    dot = rindex (lower$, ".")
    if dot > 0
        ext$ = mid$ (lower$, dot + 1, length (lower$) - dot)
    else
        ext$ = ""
    endif

    if ext$ = "wav"
        @parseFileName: name$
        if parseFileName.ok
            nWav = nWav + 1
            wavName$[nWav] = name$
            wavTask$[nWav] = parseFileName.task$
                wavTake[nWav] = parseFileName.take
            taskFound[parseFileName.taskIndex] = 1
            key$ = parseFileName.task$ + "#" + string$ (parseFileName.take)
            if index (seenKeys$, "|" + key$ + "|") > 0
                @addWarning: "More than one file is labeled " + parseFileName.task$ + " take " + string$ (parseFileName.take) + " (one of them is " + name$ + "). Both are analyzed."
            endif
            seenKeys$ = seenKeys$ + key$ + "|"
            @toLower: parseFileName.speaker$
            if toLower.result$ <> speakerIDLower$
                @addWarning: "File " + name$ + " has speaker ID """ + parseFileName.speaker$ + """, but the settings file says """ + speakerID$ + """. It is analyzed anyway."
            endif
        else
            nUnrecognized = nUnrecognized + 1
            unrecName$[nUnrecognized] = name$
            unrecReason$[nUnrecognized] = parseFileName.reason$
        endif
    elsif ext$ <> "" and index (otherAudio$, "|" + ext$ + "|") > 0
        nUnrecognized = nUnrecognized + 1
        unrecName$[nUnrecognized] = name$
        unrecReason$[nUnrecognized] = "not a WAV file (." + ext$ + "); only .wav files are analyzed"
    endif
endfor
removeObject: fileList

appendInfoLine: "Found ", nWav, " recognized WAV file(s) and ", nUnrecognized, " unrecognized file(s)."

# ----------------------------------------------------------------------
# ANALYZE EACH FILE
# ----------------------------------------------------------------------
filesJson$ = ""
for f to nWav
    fileName$ = wavName$[f]
    currentTask$ = wavTask$[f]
    isVowel = (currentTask$ = "vowel_a" or currentTask$ = "vowel_i")
    appendInfoLine: "Analyzing ", fileName$, " (", currentTask$, ", take ", wavTake[f], ") ..."

    measures$ = ""
    measuresCount = 0
    status$ = "analyzed"
    errorReason$ = ""
    duration = undefined
    sampleRate = undefined
    channels = undefined
    analysisStart = undefined
    analysisEnd = undefined
    voicedDuration = undefined
    voicedOnset = undefined
    voicedOffset = undefined
    windowRule$ = ""

    # Try to open the file without stopping the whole script if it fails.
    selectObject: settingsTable
    nocheck Read from file: folder$ + "/" + fileName$
    if not startsWith (selected$ (), "Sound ")
        status$ = "error"
        errorReason$ = "Praat could not open this file as a sound (it may be damaged or not a real WAV file)."
        appendInfoLine: "   ERROR: ", errorReason$
    else
        original = selected ("Sound")
        duration = Get total duration
        sampleRate = Get sampling frequency
        channels = Get number of channels
        if channels > 1
            selectObject: original
            if channelHandling$ = "average"
                sound = Convert to mono
            else
                sound = Extract one channel: 1
            endif
            removeObject: original
        else
            sound = original
        endif

        if isVowel
            @analyzeVowel
        else
            @analyzeSpeech
        endif
        removeObject: sound
    endif

    # Build this file's JSON entry.
    @jsonString: fileName$
    entry$ = "    {" + newline$
    entry$ = entry$ + "      ""fileName"": " + jsonString.result$ + "," + newline$
    entry$ = entry$ + "      ""task"": """ + currentTask$ + """," + newline$
    entry$ = entry$ + "      ""take"": " + string$ (wavTake[f]) + "," + newline$
    entry$ = entry$ + "      ""status"": """ + status$ + """," + newline$
    if status$ = "error"
        @jsonString: errorReason$
        entry$ = entry$ + "      ""errorReason"": " + jsonString.result$ + "," + newline$
    endif
    @jsonNumber: duration, 3
    entry$ = entry$ + "      ""durationSec"": " + jsonNumber.result$ + "," + newline$
    @jsonNumber: sampleRate, 0
    entry$ = entry$ + "      ""sampleRateHz"": " + jsonNumber.result$ + "," + newline$
    @jsonNumber: channels, 0
    entry$ = entry$ + "      ""channels"": " + jsonNumber.result$ + "," + newline$
    @jsonNumber: analysisStart, 3
    entry$ = entry$ + "      ""analysisStartSec"": " + jsonNumber.result$ + "," + newline$
    @jsonNumber: analysisEnd, 3
    entry$ = entry$ + "      ""analysisEndSec"": " + jsonNumber.result$ + "," + newline$
    if isVowel and status$ = "analyzed"
        @jsonNumber: voicedOnset, 3
        entry$ = entry$ + "      ""voicedOnsetSec"": " + jsonNumber.result$ + "," + newline$
        @jsonNumber: voicedOffset, 3
        entry$ = entry$ + "      ""voicedOffsetSec"": " + jsonNumber.result$ + "," + newline$
        if windowRule$ = ""
            entry$ = entry$ + "      ""analysisWindowRule"": null," + newline$
        else
            @jsonString: windowRule$
            entry$ = entry$ + "      ""analysisWindowRule"": " + jsonString.result$ + "," + newline$
        endif
    endif
    if not isVowel
        @jsonNumber: voicedDuration, 3
        entry$ = entry$ + "      ""voicedDurationSec"": " + jsonNumber.result$ + "," + newline$
    endif
    if measuresCount = 0
        entry$ = entry$ + "      ""measures"": {}" + newline$
    else
        entry$ = entry$ + "      ""measures"": {" + newline$ + measures$ + newline$ + "      }" + newline$
    endif
    entry$ = entry$ + "    }"

    if f > 1
        filesJson$ = filesJson$ + "," + newline$
    endif
    filesJson$ = filesJson$ + entry$
endfor

# ----------------------------------------------------------------------
# WRITE results.json
# ----------------------------------------------------------------------
@isoNow
runDate$ = isoNow.result$

json$ = "{" + newline$
json$ = json$ + "  ""schemaVersion"": """ + resultsSchemaVersion$ + """," + newline$
json$ = json$ + "  ""fileType"": ""cape-vr-acoustic-results""," + newline$
json$ = json$ + "  ""scriptVersion"": """ + scriptVersion$ + """," + newline$
@jsonString: praatVersion$
json$ = json$ + "  ""praatVersion"": " + jsonString.result$ + "," + newline$
json$ = json$ + "  ""runDate"": """ + runDate$ + """," + newline$
@jsonString: appVersion$
json$ = json$ + "  ""appVersion"": " + jsonString.result$ + "," + newline$
@jsonString: speakerID$
json$ = json$ + "  ""speakerID"": " + jsonString.result$ + "," + newline$
json$ = json$ + "  ""speakerProfile"": """ + speakerProfile$ + """," + newline$
json$ = json$ + "  ""settingsSource"": """ + settingsSource$ + """," + newline$

# Settings: every row of cape_settings.tsv, exactly as read (as text).
json$ = json$ + "  ""settings"": {" + newline$
selectObject: settingsTable
nRows = Get number of rows
for r to nRows
    selectObject: settingsTable
    rowName$ = Get value: r, "name"
    rowValue$ = Get value: r, "value"
    @jsonString: rowName$
    rowNameJson$ = jsonString.result$
    @jsonString: rowValue$
    json$ = json$ + "    " + rowNameJson$ + ": " + jsonString.result$
    if r < nRows
        json$ = json$ + ","
    endif
    json$ = json$ + newline$
endfor
json$ = json$ + "  }," + newline$

# Analysis parameters actually used (fixed values and values worked out
# from the settings).
params$ = ""
nParams = 0
@addParamText: "pitchCommand", "To Pitch (cc)"
@addParamNumber: "pitchTimeStep", pitchTimeStep, 4
@addParamNumber: "pitchFloorHz", pitchFloor, 2
@addParamNumber: "pitchCeilingHz", pitchCeiling, 2
@addParamNumber: "pitchMaxCandidates", pitchMaxCandidates, 0
@addParamText: "pitchVeryAccurate", pitchVeryAccurate$
@addParamNumber: "pitchSilenceThreshold", pitchSilenceThreshold, 3
@addParamNumber: "pitchVoicingThreshold", pitchVoicingThreshold, 3
@addParamNumber: "pitchOctaveCost", pitchOctaveCost, 3
@addParamNumber: "pitchOctaveJumpCost", pitchOctaveJumpCost, 3
@addParamNumber: "pitchVoicedUnvoicedCost", pitchVoicedUnvoicedCost, 3
@addParamNumber: "vuvMaxPeriodSec", vuvMaxPeriod, 4
@addParamNumber: "vuvMeanPeriodSec", vuvMeanPeriod, 4
@addParamNumber: "intensityMinimumPitchHz", pitchFloor, 2
@addParamNumber: "intensityTimeStep", intensityTimeStep, 4
@addParamText: "intensitySubtractMean", intensitySubtractMean$
@addParamText: "intensityAveraging", intensityAveraging$
@addParamNumber: "cepstrogramPitchFloorHz", cppsPitchFloor, 1
@addParamNumber: "cepstrogramTimeStepSec", cppsTimeStep, 4
@addParamNumber: "cepstrogramMaxFrequencyHz", cppsMaxFrequency, 0
@addParamNumber: "cepstrogramPreEmphasisHz", cppsPreEmphasis, 0
@addParamText: "cppsMethod", cppsMethod$
if cppsMethod$ = "maryn_weenink_2015"
    @addParamText: "cppsHighPassFilter", "Filter (stop Hann band) 0-" + fixed$ (mwHighPassHz, 0) + " Hz, smoothing " + fixed$ (mwHighPassSmoothing, 1) + " Hz"
    @addParamText: "cppsSubtractTrendBeforeSmoothing", mwSubtractTrend$
    @addParamNumber: "cppsTimeAveragingSec", mwTimeAveraging, 4
    @addParamNumber: "cppsQuefrencyAveragingSec", mwQuefrencyAveraging, 4
    @addParamNumber: "cppsPeakSearchMinHz", mwPeakMinHz, 0
    @addParamNumber: "cppsPeakSearchMaxHz", mwPeakMaxHz, 0
    @addParamNumber: "cppsTolerance", mwTolerance, 3
    @addParamText: "cppsInterpolation", mwInterpolation$
    @addParamNumber: "cppsTrendFromSec", mwTrendFrom, 4
    @addParamNumber: "cppsTrendToSec", mwTrendTo, 4
    @addParamText: "cppsTrendType", mwTrendType$
    @addParamText: "cppsFitMethod", mwFitMethod$
else
    @addParamText: "cppsHighPassFilter", "none"
    @addParamText: "cppsSubtractTrendBeforeSmoothing", pdSubtractTrend$
    @addParamNumber: "cppsTimeAveragingSec", pdTimeAveraging, 4
    @addParamNumber: "cppsQuefrencyAveragingSec", pdQuefrencyAveraging, 4
    @addParamNumber: "cppsPeakSearchMinHz", pdPeakMinHz, 0
    @addParamNumber: "cppsPeakSearchMaxHz", pdPeakMaxHz, 0
    @addParamNumber: "cppsTolerance", pdTolerance, 3
    @addParamText: "cppsInterpolation", pdInterpolation$
    @addParamNumber: "cppsTrendFromSec", pdTrendFrom, 4
    @addParamNumber: "cppsTrendToSec", pdTrendTo, 4
    @addParamText: "cppsTrendType", pdTrendType$
    @addParamText: "cppsFitMethod", pdFitMethod$
endif
@addParamText: "hnrMethod", hnrMethod$
@addParamNumber: "hnrTimeStepSec", hnrTimeStep, 4
@addParamNumber: "hnrMinimumPitchHz", pitchFloor, 2
@addParamNumber: "hnrSilenceThreshold", hnrSilenceThreshold, 3
if hnrMethod$ = "cc"
    @addParamNumber: "hnrPeriodsPerWindow", hnrPeriodsPerWindowCc, 2
else
    @addParamNumber: "hnrPeriodsPerWindow", hnrPeriodsPerWindowAc, 2
endif
@addParamText: "periodRangeMode", periodRangeMode$
@addParamNumber: "shortestPeriodSec", shortestPeriod, 6
@addParamNumber: "longestPeriodSec", longestPeriod, 6
@addParamNumber: "maximumPeriodFactor", maxPeriodFactor, 2
@addParamNumber: "maximumAmplitudeFactor", maxAmplitudeFactor, 2
@addParamNumber: "formantTimeStep", formantTimeStep, 4
@addParamNumber: "formantCount", formantCount, 1
@addParamNumber: "formantCeilingHz", formantCeiling, 0
@addParamNumber: "formantWindowLengthSec", formantWindowLength, 4
@addParamNumber: "formantPreEmphasisHz", formantPreEmphasis, 0
@addParamNumber: "vowelWindowSec", vowelWindowSec, 3
@addParamNumber: "vowelShortFraction", vowelShortFraction, 3
@addParamNumber: "vowelGapWarningSec", vowelGapWarningSec, 3
@addParamNumber: "minAnalysisDurationSec", minAnalysisDuration, 3
json$ = json$ + "  ""analysisParameters"": {" + newline$ + params$ + newline$ + "  }," + newline$

if nWav = 0
    json$ = json$ + "  ""files"": []," + newline$
else
    json$ = json$ + "  ""files"": [" + newline$ + filesJson$ + newline$ + "  ]," + newline$
endif

if nUnrecognized = 0
    json$ = json$ + "  ""unrecognizedFiles"": []," + newline$
else
    json$ = json$ + "  ""unrecognizedFiles"": [" + newline$
    for u to nUnrecognized
        @jsonString: unrecName$[u]
        uName$ = jsonString.result$
        @jsonString: unrecReason$[u]
        json$ = json$ + "    { ""fileName"": " + uName$ + ", ""reason"": " + jsonString.result$ + " }"
        if u < nUnrecognized
            json$ = json$ + ","
        endif
        json$ = json$ + newline$
    endfor
    json$ = json$ + "  ]," + newline$
endif

# Missing required tasks
missing$ = ""
nMissing = 0
for t to nTasks
    if taskRequired[t] and taskFound[t] = 0
        if nMissing > 0
            missing$ = missing$ + ", "
        endif
        missing$ = missing$ + """" + task$[t] + """"
        nMissing = nMissing + 1
    endif
endfor
json$ = json$ + "  ""missingTasks"": [" + missing$ + "]," + newline$

if nWarnings = 0
    json$ = json$ + "  ""warnings"": []" + newline$
else
    json$ = json$ + "  ""warnings"": [" + newline$
    for w to nWarnings
        @jsonString: warning$[w]
        json$ = json$ + "    " + jsonString.result$
        if w < nWarnings
            json$ = json$ + ","
        endif
        json$ = json$ + newline$
    endfor
    json$ = json$ + "  ]" + newline$
endif
json$ = json$ + "}"

# All text is escaped to plain ASCII by @jsonString, so the file is valid
# UTF-8 whatever Praat's text-writing preference is.
writeFileLine: resultsPath$, json$
removeObject: settingsTable

appendInfoLine: ""
appendInfoLine: "Done. results.json written to: ", resultsPath$
appendInfoLine: "Files analyzed: ", nWav, "; unrecognized: ", nUnrecognized, "; missing tasks: ", nMissing, "; warnings: ", nWarnings
for w to nWarnings
    appendInfoLine: "WARNING: ", warning$[w]
endfor

# ======================================================================
# ANALYSIS PROCEDURES
# They use the global variables sound, duration, sampleRate, and the settings.
# ======================================================================

# --- Vowels: all vowel measures on the middle of the voiced part -------
# Where the vowel starts and ends is found with Praat's voicing detection,
# so silence or noise before or after the vowel is ignored.
#   - Voiced part at least vowelWindowSec long (default 3 s): analyze the
#     middle vowelWindowSec of it. This skips the voice onset and offset,
#     whose irregular first and last cycles would bias jitter, shimmer, HNR,
#     and CPPS.
#   - Voiced part shorter: analyze the middle vowelShortFraction (default
#     50%) of it, and add a warning.
# (Why the middle: see the methods documentation.)
procedure analyzeVowel
    # 1. Find the voiced part of the whole file.
    selectObject: sound
    .fullPitch = To Pitch (cc): pitchTimeStep, pitchFloor, pitchMaxCandidates, pitchVeryAccurate$, pitchSilenceThreshold, pitchVoicingThreshold, pitchOctaveCost, pitchOctaveJumpCost, pitchVoicedUnvoicedCost, pitchCeiling
    selectObject: sound, .fullPitch
    .fullPulses = To PointProcess (cc)
    .grid = To TextGrid (vuv): vuvMaxPeriod, vuvMeanPeriod
    removeObject: .fullPitch, .fullPulses
    @voicedSpan: .grid
    if voicedSpan.found = 0
        removeObject: .grid
        @nullVowelMeasures: "no voicing was found in this file"
    else
        voicedOnset = voicedSpan.onset
        voicedOffset = voicedSpan.offset
        .span = voicedOffset - voicedOnset

        # 2. Choose the analysis window inside the voiced part.
        if .span >= vowelWindowSec
            .mid = (voicedOnset + voicedOffset) / 2
            .start = .mid - vowelWindowSec / 2
            .end = .mid + vowelWindowSec / 2
            windowRule$ = "middle " + fixed$ (vowelWindowSec, 1) + " s of the voiced part"
        else
            .trim = .span * (1 - vowelShortFraction) / 2
            .start = voicedOnset + .trim
            .end = voicedOffset - .trim
            windowRule$ = "middle " + fixed$ (vowelShortFraction * 100, 0) + "% of the voiced part (voiced part shorter than " + fixed$ (vowelWindowSec, 1) + " s)"
            @addWarning: fileName$ + ": the voiced part of the vowel is only " + fixed$ (.span, 3) + " s long (less than " + fixed$ (vowelWindowSec, 3) + " s), so the middle " + fixed$ (vowelShortFraction * 100, 0) + "% of it was analyzed."
        endif

        # 3. Warn about long unvoiced stretches inside the window
        #    (voice breaks, or a cough or noise detected as voicing).
        @longestUnvoicedGap: .grid, .start, .end
        if longestUnvoicedGap.gap >= vowelGapWarningSec
            @addWarning: fileName$ + ": the analysis window (" + fixed$ (.start, 2) + "-" + fixed$ (.end, 2) + " s) contains an unvoiced stretch of " + fixed$ (longestUnvoicedGap.gap, 2) + " s. Please check the recording in Praat (voice break, or a cough or noise detected as voicing?)."
        endif
        removeObject: .grid
        @measureVowelWindow: .start, .end
    endif
endproc

# The first voiced moment and the last voiced moment in a vuv TextGrid.
procedure voicedSpan: .grid
    selectObject: .grid
    .n = Get number of intervals: 1
    .found = 0
    .onset = undefined
    .offset = undefined
    for .k to .n
        .label$ = Get label of interval: 1, .k
        if .label$ = "V"
            if .found = 0
                .onset = Get start time of interval: 1, .k
            endif
            .offset = Get end time of interval: 1, .k
            .found = 1
        endif
    endfor
endproc

# The longest unvoiced stretch that lies inside [.from, .to].
procedure longestUnvoicedGap: .grid, .from, .to
    selectObject: .grid
    .n = Get number of intervals: 1
    .gap = 0
    for .k to .n
        .label$ = Get label of interval: 1, .k
        if .label$ <> "V"
            .t1 = Get start time of interval: 1, .k
            .t2 = Get end time of interval: 1, .k
            .overlap = min (.t2, .to) - max (.t1, .from)
            if .overlap > .gap
                .gap = .overlap
            endif
        endif
    endfor
endproc

# Measure everything on the vowel between .start and .end.
procedure measureVowelWindow: .start, .end
    analysisStart = .start
    analysisEnd = .end
    .segDur = .end - .start
    if .segDur < minAnalysisDuration
        .reason$ = "analysis segment (" + fixed$ (.segDur, 3) + " s) is shorter than the " + fixed$ (minAnalysisDuration, 3) + " s minimum"
        @nullVowelMeasures: .reason$
    else
        selectObject: sound
        .seg = Extract part: .start, .end, "rectangular", 1, "no"
        .pitch = To Pitch (cc): pitchTimeStep, pitchFloor, pitchMaxCandidates, pitchVeryAccurate$, pitchSilenceThreshold, pitchVoicingThreshold, pitchOctaveCost, pitchOctaveJumpCost, pitchVoicedUnvoicedCost, pitchCeiling
        @measureF0: .pitch
        @measureIntensity: .seg, ""
        @measureCpps: .seg, ""
        @measureHnr: .seg
        selectObject: .seg, .pitch
        .pulses = To PointProcess (cc)
        @measureJitter: .pulses
        @measureShimmer: .seg, .pulses
        @measureFormants: .seg, .segDur
        removeObject: .seg, .pitch, .pulses
    endif
endproc

# --- Sentences, extemporaneous speech, reading -------------------------
procedure analyzeSpeech
    analysisStart = 0
    analysisEnd = duration
    if duration < minAnalysisDuration
        .reason$ = "file (" + fixed$ (duration, 3) + " s) is shorter than the " + fixed$ (minAnalysisDuration, 3) + " s minimum"
        @addMeasure: "f0Mean", undefined, 2, "Hz", .reason$
        @addMeasure: "f0SD", undefined, 2, "Hz", .reason$
        @addMeasure: "intensityMean", undefined, 2, "dB (uncalibrated)", .reason$
        @addMeasure: "cpps", undefined, 2, "dB", .reason$
    else
        selectObject: sound
        .pitch = To Pitch (cc): pitchTimeStep, pitchFloor, pitchMaxCandidates, pitchVeryAccurate$, pitchSilenceThreshold, pitchVoicingThreshold, pitchOctaveCost, pitchOctaveJumpCost, pitchVoicedUnvoicedCost, pitchCeiling
        @measureF0: .pitch
        selectObject: sound, .pitch
        .pulses = To PointProcess (cc)
        @extractVoiced: .pulses
        .voiced = extractVoiced.sound
        voicedDuration = extractVoiced.duration

        if intensitySpeechVoicedOnly$ = "yes"
            @measureIntensity: .voiced, "no voiced segments found"
        else
            @measureIntensity: sound, ""
        endif
        if cppsSpeechVoicedOnly$ = "yes"
            @measureCpps: .voiced, "no voiced segments found"
        else
            @measureCpps: sound, ""
        endif

        removeObject: .pitch, .pulses
        if .voiced <> 0
            removeObject: .voiced
        endif
    endif
endproc

# --- Voiced parts joined into one sound (0 if there are none) ---------
procedure extractVoiced: .pulses
    .sound = 0
    .duration = 0
    selectObject: .pulses
    .grid = To TextGrid (vuv): vuvMaxPeriod, vuvMeanPeriod
    .nIntervals = Get number of intervals: 1
    .nParts = 0
    for .k to .nIntervals
        selectObject: .grid
        .label$ = Get label of interval: 1, .k
        if .label$ = "V"
            .t1 = Get start time of interval: 1, .k
            .t2 = Get end time of interval: 1, .k
            selectObject: sound
            .nParts = .nParts + 1
            .part[.nParts] = Extract part: .t1, .t2, "rectangular", 1, "no"
            .duration = .duration + (.t2 - .t1)
        endif
    endfor
    removeObject: .grid
    if .nParts > 0
        selectObject: .part[1]
        if .nParts = 1
            .sound = Copy: "voiced"
        else
            for .k from 2 to .nParts
                plusObject: .part[.k]
            endfor
            .sound = Concatenate
        endif
        for .k to .nParts
            removeObject: .part[.k]
        endfor
    endif
endproc

# --- F0 mean and SD over voiced frames ---------------------------------
procedure measureF0: .pitch
    selectObject: .pitch
    .nVoiced = Count voiced frames
    if .nVoiced = 0
        @addMeasure: "f0Mean", undefined, 2, "Hz", "no voiced frames found"
        @addMeasure: "f0SD", undefined, 2, "Hz", "no voiced frames found"
    else
        .mean = Get mean: 0, 0, "Hertz"
        .sd = Get standard deviation: 0, 0, "Hertz"
        @addMeasure: "f0Mean", .mean, 2, "Hz", ""
        @addMeasure: "f0SD", .sd, 2, "Hz", "fewer than 2 voiced frames"
    endif
endproc

# --- Mean intensity, uncalibrated dB ------------------------------------
procedure measureIntensity: .snd, .missingReason$
    .unit$ = "dB (uncalibrated)"
    if .snd = 0
        @addMeasure: "intensityMean", undefined, 2, .unit$, .missingReason$
    else
        selectObject: .snd
        .dur = Get total duration
        if .dur < minAnalysisDuration
            @addMeasure: "intensityMean", undefined, 2, .unit$, "sound analyzed (" + fixed$ (.dur, 3) + " s) is shorter than the " + fixed$ (minAnalysisDuration, 3) + " s minimum"
        else
            .int = To Intensity: pitchFloor, intensityTimeStep, intensitySubtractMean$
            .mean = Get mean: 0, 0, intensityAveraging$
            removeObject: .int
            @addMeasure: "intensityMean", .mean, 2, .unit$, ""
        endif
    endif
endproc

# --- CPPS ---------------------------------------------------------------
procedure measureCpps: .snd, .missingReason$
    if .snd = 0
        @addMeasure: "cpps", undefined, 2, "dB", .missingReason$
    elsif sampleRate < cppsMinSampleRate
        @addMeasure: "cpps", undefined, 2, "dB", "sample rate " + fixed$ (sampleRate, 0) + " Hz is below the " + fixed$ (cppsMinSampleRate, 0) + " Hz needed for CPPS"
    else
        selectObject: .snd
        .dur = Get total duration
        if .dur < minAnalysisDuration
            @addMeasure: "cpps", undefined, 2, "dB", "sound analyzed (" + fixed$ (.dur, 3) + " s) is shorter than the " + fixed$ (minAnalysisDuration, 3) + " s minimum"
        else
            if cppsMethod$ = "maryn_weenink_2015"
                # As in the AVQI v02.02 script: high-pass filter first
                # (removes 0-34 Hz), then the cepstrogram. CPPS only.
                .filtered = Filter (stop Hann band): 0, mwHighPassHz, mwHighPassSmoothing
                .cep = To PowerCepstrogram: cppsPitchFloor, cppsTimeStep, cppsMaxFrequency, cppsPreEmphasis
                .v = Get CPPS: mwSubtractTrend$, mwTimeAveraging, mwQuefrencyAveraging, mwPeakMinHz, mwPeakMaxHz, mwTolerance, mwInterpolation$, mwTrendFrom, mwTrendTo, mwTrendType$, mwFitMethod$
                removeObject: .filtered
            else
                .cep = To PowerCepstrogram: cppsPitchFloor, cppsTimeStep, cppsMaxFrequency, cppsPreEmphasis
                .v = Get CPPS: pdSubtractTrend$, pdTimeAveraging, pdQuefrencyAveraging, pdPeakMinHz, pdPeakMaxHz, pdTolerance, pdInterpolation$, pdTrendFrom, pdTrendTo, pdTrendType$, pdFitMethod$
            endif
            removeObject: .cep
            @addMeasure: "cpps", .v, 2, "dB", ""
        endif
    endif
endproc

# --- HNR (vowels) ---------------------------------------------------------
procedure measureHnr: .seg
    selectObject: .seg
    if hnrMethod$ = "cc"
        .h = To Harmonicity (cc): hnrTimeStep, pitchFloor, hnrSilenceThreshold, hnrPeriodsPerWindowCc
    else
        .h = To Harmonicity (ac): hnrTimeStep, pitchFloor, hnrSilenceThreshold, hnrPeriodsPerWindowAc
    endif
    .v = Get mean: 0, 0
    removeObject: .h
    @addMeasure: "hnr", .v, 2, "dB", ""
endproc

# --- Jitter (vowels) ------------------------------------------------------
procedure measureJitter: .pulses
    .why$ = "Praat returned undefined (too few usable periods)"
    .list$ = "," + jitterMeasures$ + ","
    if index (.list$, ",local,") > 0
        selectObject: .pulses
        .v = Get jitter (local): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor
        @addMeasure: "jitterLocal", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",local_absolute,") > 0
        selectObject: .pulses
        .v = Get jitter (local, absolute): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor
        @addMeasure: "jitterLocalAbsolute", .v, 8, "s", .why$
    endif
    if index (.list$, ",rap,") > 0
        selectObject: .pulses
        .v = Get jitter (rap): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor
        @addMeasure: "jitterRap", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",ppq5,") > 0
        selectObject: .pulses
        .v = Get jitter (ppq5): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor
        @addMeasure: "jitterPpq5", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",ddp,") > 0
        selectObject: .pulses
        .v = Get jitter (ddp): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor
        @addMeasure: "jitterDdp", .v * 100, 3, "%", .why$
    endif
endproc

# --- Shimmer (vowels) -----------------------------------------------------
procedure measureShimmer: .seg, .pulses
    .why$ = "Praat returned undefined (too few usable periods)"
    .list$ = "," + shimmerMeasures$ + ","
    if index (.list$, ",local,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (local): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerLocal", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",local_db,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (local_dB): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerLocalDb", .v, 3, "dB", .why$
    endif
    if index (.list$, ",apq3,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (apq3): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerApq3", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",apq5,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (apq5): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerApq5", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",apq11,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (apq11): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerApq11", .v * 100, 3, "%", .why$
    endif
    if index (.list$, ",dda,") > 0
        selectObject: .seg, .pulses
        .v = Get shimmer (dda): 0, 0, shortestPeriod, longestPeriod, maxPeriodFactor, maxAmplitudeFactor
        @addMeasure: "shimmerDda", .v * 100, 3, "%", .why$
    endif
endproc

# --- Formants F1-F3 (vowels) ---------------------------------------------
procedure measureFormants: .seg, .segDur
    if sampleRate < 2 * formantCeiling
        @nullFormants: "sample rate " + fixed$ (sampleRate, 0) + " Hz is too low: formants need at least " + fixed$ (2 * formantCeiling, 0) + " Hz (twice the " + fixed$ (formantCeiling, 0) + " Hz formant ceiling)"
    else
        selectObject: .seg
        .fm = To Formant (burg): formantTimeStep, formantCount, formantCeiling, formantWindowLength, formantPreEmphasis
        for .n to 3
            .f$ = "f" + string$ (.n)
            selectObject: .fm
            if formantWindow$ = "whole_trimmed"
                .mean = Get mean: .n, 0, 0, "hertz"
                .median = Get quantile: .n, 0, 0, "hertz", 0.5
                .sd = Get standard deviation: .n, 0, 0, "hertz"
                @addMeasure: .f$ + "Mean", .mean, 2, "Hz", ""
                @addMeasure: .f$ + "Median", .median, 2, "Hz", ""
                @addMeasure: .f$ + "SD", .sd, 2, "Hz", ""
            else
                .v = Get value at time: .n, .segDur / 2, "hertz", "linear"
                @addMeasure: .f$ + "Midpoint", .v, 2, "Hz", ""
            endif
        endfor
        removeObject: .fm
    endif
endproc

procedure nullFormants: .reason$
    for .n to 3
        .f$ = "f" + string$ (.n)
        if formantWindow$ = "whole_trimmed"
            @addMeasure: .f$ + "Mean", undefined, 2, "Hz", .reason$
            @addMeasure: .f$ + "Median", undefined, 2, "Hz", .reason$
            @addMeasure: .f$ + "SD", undefined, 2, "Hz", .reason$
        else
            @addMeasure: .f$ + "Midpoint", undefined, 2, "Hz", .reason$
        endif
    endfor
endproc

# --- All vowel measures as null (no voicing, or segment too short) -----
procedure nullVowelMeasures: .reason$
    @addMeasure: "f0Mean", undefined, 2, "Hz", .reason$
    @addMeasure: "f0SD", undefined, 2, "Hz", .reason$
    @addMeasure: "intensityMean", undefined, 2, "dB (uncalibrated)", .reason$
    @addMeasure: "cpps", undefined, 2, "dB", .reason$
    @addMeasure: "hnr", undefined, 2, "dB", .reason$
    .j$ = "," + jitterMeasures$ + ","
    if index (.j$, ",local,") > 0
        @addMeasure: "jitterLocal", undefined, 3, "%", .reason$
    endif
    if index (.j$, ",local_absolute,") > 0
        @addMeasure: "jitterLocalAbsolute", undefined, 8, "s", .reason$
    endif
    if index (.j$, ",rap,") > 0
        @addMeasure: "jitterRap", undefined, 3, "%", .reason$
    endif
    if index (.j$, ",ppq5,") > 0
        @addMeasure: "jitterPpq5", undefined, 3, "%", .reason$
    endif
    if index (.j$, ",ddp,") > 0
        @addMeasure: "jitterDdp", undefined, 3, "%", .reason$
    endif
    .s$ = "," + shimmerMeasures$ + ","
    if index (.s$, ",local,") > 0
        @addMeasure: "shimmerLocal", undefined, 3, "%", .reason$
    endif
    if index (.s$, ",local_db,") > 0
        @addMeasure: "shimmerLocalDb", undefined, 3, "dB", .reason$
    endif
    if index (.s$, ",apq3,") > 0
        @addMeasure: "shimmerApq3", undefined, 3, "%", .reason$
    endif
    if index (.s$, ",apq5,") > 0
        @addMeasure: "shimmerApq5", undefined, 3, "%", .reason$
    endif
    if index (.s$, ",apq11,") > 0
        @addMeasure: "shimmerApq11", undefined, 3, "%", .reason$
    endif
    if index (.s$, ",dda,") > 0
        @addMeasure: "shimmerDda", undefined, 3, "%", .reason$
    endif
    @nullFormants: .reason$
endproc

# ======================================================================
# HELPER PROCEDURES
# ======================================================================

# Add one measure to the current file's "measures" object.
# If .value is undefined, it is written as null with .reason$ (or a
# generic reason if .reason$ is empty).
procedure addMeasure: .key$, .value, .decimals, .unit$, .reason$
    @jsonString: .unit$
    .unitJson$ = jsonString.result$
    if .value = undefined
        if .reason$ = ""
            .reason$ = "Praat returned undefined"
        endif
        @jsonString: .reason$
        .entry$ = "{ ""value"": null, ""unit"": " + .unitJson$ + ", ""reason"": " + jsonString.result$ + " }"
    else
        .entry$ = "{ ""value"": " + fixed$ (.value, .decimals) + ", ""unit"": " + .unitJson$ + ", ""reason"": null }"
    endif
    if measuresCount > 0
        measures$ = measures$ + "," + newline$
    endif
    measures$ = measures$ + "        """ + .key$ + """: " + .entry$
    measuresCount = measuresCount + 1
endproc

procedure addParamNumber: .name$, .value, .decimals
    @jsonNumber: .value, .decimals
    @addParamRaw: .name$, jsonNumber.result$
endproc

procedure addParamText: .name$, .value$
    @jsonString: .value$
    @addParamRaw: .name$, jsonString.result$
endproc

procedure addParamRaw: .name$, .json$
    if nParams > 0
        params$ = params$ + "," + newline$
    endif
    params$ = params$ + "    """ + .name$ + """: " + .json$
    nParams = nParams + 1
endproc

procedure addWarning: .text$
    nWarnings = nWarnings + 1
    warning$[nWarnings] = .text$
endproc

# A number as JSON text, or null if undefined.
procedure jsonNumber: .value, .decimals
    if .value = undefined
        .result$ = "null"
    else
        .result$ = fixed$ (.value, .decimals)
    endif
endproc

# A text as a JSON string in quotes. Quotes and backslashes are escaped,
# and every character outside plain ASCII is written as \uXXXX, so the
# output is always plain ASCII.
procedure jsonString: .s$
    .out$ = ""
    for .i to length (.s$)
        .c$ = mid$ (.s$, .i, 1)
        .code = unicode (.c$)
        if .c$ = """"
            .out$ = .out$ + "\"""
        elsif .c$ = "\"
            .out$ = .out$ + "\\"
        elsif .code < 32 or .code > 126
            if .code > 65535
                # Characters outside the Basic Multilingual Plane: surrogate pair.
                .rest = .code - 65536
                @hex4: 55296 + floor (.rest / 1024)
                .out$ = .out$ + "\u" + hex4.result$
                @hex4: 56320 + (.rest mod 1024)
                .out$ = .out$ + "\u" + hex4.result$
            else
                @hex4: .code
                .out$ = .out$ + "\u" + hex4.result$
            endif
        else
            .out$ = .out$ + .c$
        endif
    endfor
    .result$ = """" + .out$ + """"
endproc

# Four lowercase hexadecimal digits.
procedure hex4: .n
    .result$ = ""
    for .d to 4
        .digit = .n mod 16
        .result$ = mid$ ("0123456789abcdef", .digit + 1, 1) + .result$
        .n = floor (.n / 16)
    endfor
endproc

# Lowercase A-Z only (enough for file names and task labels).
procedure toLower: .s$
    .upper$ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    .lower$ = "abcdefghijklmnopqrstuvwxyz"
    .result$ = ""
    for .i to length (.s$)
        .c$ = mid$ (.s$, .i, 1)
        .p = index (.upper$, .c$)
        if .p > 0
            .c$ = mid$ (.lower$, .p, 1)
        endif
        .result$ = .result$ + .c$
    endfor
endproc

# Split "<speakerID>_<task>[_t<N>].wav" into its parts.
# Sets .ok (1/0), .speaker$, .task$, .taskIndex, .take, and .reason$ on failure.
procedure parseFileName: .name$
    .ok = 0
    .reason$ = ""
    .speaker$ = ""
    .task$ = ""
    .taskIndex = 0
    .take = 1
    # Remove ".wav" (any case).
    .base$ = left$ (.name$, length (.name$) - 4)
    @toLower: .base$
    .lowerBase$ = toLower.result$

    # Optional take marker "_t<N>" at the end.
    .takePos = index_regex (.lowerBase$, "_t[0-9]+$")
    if .takePos > 0
        .take = number (mid$ (.lowerBase$, .takePos + 2, length (.lowerBase$) - .takePos - 1))
        .base$ = left$ (.base$, .takePos - 1)
        .lowerBase$ = left$ (.lowerBase$, .takePos - 1)
    endif

    # The task label must be at the end, after "_".
    for .t to nTasks
        .suffix$ = "_" + task$[.t]
        if .taskIndex = 0 and endsWith (.lowerBase$, .suffix$)
            .taskIndex = .t
            .task$ = task$[.t]
            .speaker$ = left$ (.base$, length (.base$) - length (.suffix$))
        endif
    endfor

    if .take < 1
        .reason$ = "take number must be 1 or more (use _t1, _t2, ...)"
    elsif .taskIndex = 0
        .reason$ = "name does not match <speakerID>_<task>.wav or <speakerID>_<task>_t<N>.wav"
    elsif .speaker$ = ""
        .reason$ = "no speaker ID before the task label"
    else
        .ok = 1
    endif
endproc

# Current local date and time as ISO 8601 (no time zone; Praat does not
# report it). Built from date$(), e.g. "Fri Sep 25 14:03:07 2026".
procedure isoNow
    .d$ = date$ ()
    .months$ = "JanFebMarAprMayJunJulAugSepOctNovDec"
    .month = (index (.months$, mid$ (.d$, 5, 3)) + 2) / 3
    .day = number (mid$ (.d$, 9, 2))
    .monthText$ = string$ (.month)
    if .month < 10
        .monthText$ = "0" + .monthText$
    endif
    .dayText$ = string$ (.day)
    if .day < 10
        .dayText$ = "0" + .dayText$
    endif
    .result$ = right$ (.d$, 4) + "-" + .monthText$ + "-" + .dayText$ + "T" + mid$ (.d$, 12, 8)
endproc

# --- Settings dialog (used only when there is no cape_settings.tsv) -------
# Profile values MUST match the app (upload.js, PROFILES).
# If you change one here, change it there too.
procedure settingsDialog
    .profile$[1] = "adult_female"
    .floor[1] = 100
    .ceiling[1] = 500
    .formant[1] = 5500
    .profile$[2] = "adult_male"
    .floor[2] = 75
    .ceiling[2] = 300
    .formant[2] = 5000
    .profile$[3] = "child"
    .floor[3] = 100
    .ceiling[3] = 600
    .formant[3] = 8000
    .profile$[4] = "trans_woman"
    .floor[4] = 75
    .ceiling[4] = 500
    .formant[4] = 5250
    .profile$[5] = "trans_man"
    .floor[5] = 75
    .ceiling[5] = 500
    .formant[5] = 5250
    .profile$[6] = "other_unspecified"
    .floor[6] = 75
    .ceiling[6] = 600
    .formant[6] = 5250

    @guessSpeakerID
    .id$ = guessSpeakerID.result$
    .choice = 1
    .pf = 0
    .pc = 0
    .fc = 0
    .problem$ = ""
    .done = 0
    while not .done
        beginPause: "CAPE-Vr: analysis settings"
            if .problem$ <> ""
                comment: "PLEASE FIX: " + .problem$
            endif
            comment: "No cape_settings.tsv was found next to this script,"
            comment: "so please choose the settings here."
            sentence: "Speaker ID", .id$
            optionMenu: "Speaker profile", .choice
                option: "(choose a profile)"
                option: "adult_female"
                option: "adult_male"
                option: "child"
                option: "trans_woman"
                option: "trans_man"
                option: "other_unspecified"
            comment: "Optional: leave at 0 to use the profile's default values."
            real: "Pitch floor (Hz)", .pf
            real: "Pitch ceiling (Hz)", .pc
            real: "Formant ceiling (Hz)", .fc
            comment: "All other settings use the default values."
        .clicked = endPause: "Cancel", "OK", 2, 1
        if .clicked = 1
            exitScript: "Cancelled. Nothing was analyzed."
        endif
        .id$ = speaker_ID$
        .choice = speaker_profile
        .pf = pitch_floor
        .pc = pitch_ceiling
        .fc = formant_ceiling

        # Check the answers; if something is wrong, show the dialog again.
        .problem$ = ""
        if .id$ = ""
            .problem$ = "enter a speaker ID."
        elsif .choice = 1
            .problem$ = "choose a speaker profile."
        elsif .pf < 0 or .pc < 0 or .fc < 0
            .problem$ = "the Hz values cannot be negative."
        else
            .p = .choice - 1
            .useFloor = .floor[.p]
            .useCeiling = .ceiling[.p]
            .useFormant = .formant[.p]
            if .pf > 0
                .useFloor = .pf
            endif
            if .pc > 0
                .useCeiling = .pc
            endif
            if .fc > 0
                .useFormant = .fc
            endif
            if .useFloor >= .useCeiling
                .problem$ = "the pitch floor (" + string$ (.useFloor) + " Hz) must be below the pitch ceiling (" + string$ (.useCeiling) + " Hz)."
            else
                .done = 1
            endif
        endif
    endwhile

    # Overrides count only if they differ from the profile's value.
    .pitchOverridden$ = "no"
    if .useFloor <> .floor[.p] or .useCeiling <> .ceiling[.p]
        .pitchOverridden$ = "yes"
    endif
    .formantOverridden$ = "no"
    if .useFormant <> .formant[.p]
        .formantOverridden$ = "yes"
    endif

    # Build a settings table with the same rows as cape_settings.tsv.
    # The non-profile values are the default values.
    @isoNow
    .table = Create Table with column names: "settings", 0, "name value"
    @addSettingRow: .table, "schemaVersion", settingsSchemaVersion$
    @addSettingRow: .table, "appVersion", "none (standalone run)"
    @addSettingRow: .table, "createdAt", isoNow.result$
    @addSettingRow: .table, "speakerID", .id$
    @addSettingRow: .table, "speakerProfile", .profile$[.p]
    @addSettingRow: .table, "pitchFloorHz", string$ (.useFloor)
    @addSettingRow: .table, "pitchCeilingHz", string$ (.useCeiling)
    @addSettingRow: .table, "pitchOverridden", .pitchOverridden$
    @addSettingRow: .table, "formantCeilingHz", string$ (.useFormant)
    @addSettingRow: .table, "formantOverridden", .formantOverridden$
    @addSettingRow: .table, "formantCount", "5"
    @addSettingRow: .table, "vowelWindowSec", "3"
    @addSettingRow: .table, "vowelShortFraction", "0.5"
    @addSettingRow: .table, "formantWindow", "whole_trimmed"
    @addSettingRow: .table, "cppsMethod", "maryn_weenink_2015"
    @addSettingRow: .table, "cppsSpeechVoicedOnly", "yes"
    @addSettingRow: .table, "intensitySpeechVoicedOnly", "yes"
    @addSettingRow: .table, "intensityAveraging", "energy"
    @addSettingRow: .table, "hnrMethod", "cc"
    @addSettingRow: .table, "periodRangeMode", "derived"
    @addSettingRow: .table, "jitterMeasures", "local"
    @addSettingRow: .table, "shimmerMeasures", "local,local_db"
    @addSettingRow: .table, "channelHandling", "average"
endproc

procedure addSettingRow: .table, .name$, .value$
    selectObject: .table
    Append row
    .row = Get number of rows
    Set string value: .row, "name", .name$
    Set string value: .row, "value", .value$
endproc

# Speaker ID from the first correctly named WAV file ("" if none).
procedure guessSpeakerID
    .result$ = ""
    .list = Create Strings as file list: "guess", folder$ + "/*"
    .n = Get number of strings
    for .i to .n
        selectObject: .list
        .f$ = Get string: .i
        @toLower: .f$
        if .result$ = "" and endsWith (toLower.result$, ".wav")
            @parseFileName: .f$
            if parseFileName.ok
                .result$ = parseFileName.speaker$
            endif
        endif
    endfor
    removeObject: .list
endproc

# --- Reading settings -----------------------------------------------------
procedure getText: .name$
    selectObject: settingsTable
    .row = Search column: "name", .name$
    if .row = 0
        exitScript: "cape_settings.tsv is missing the setting """ + .name$ + """. Re-export the package from the app, or add this row."
    endif
    .value$ = Get value: .row, "value"
    # Praat shows empty table cells as "?".
    if .value$ = "?"
        .value$ = ""
    endif
endproc

procedure getNumber: .name$
    @getText: .name$
    .value = number (getText.value$)
    if .value = undefined
        exitScript: "Setting """ + .name$ + """ must be a number (with a period as the decimal point), but it is """ + getText.value$ + """."
    endif
endproc

procedure getChoice: .name$, .allowed$
    @getText: .name$
    .value$ = getText.value$
    if index ("|" + .allowed$ + "|", "|" + .value$ + "|") = 0
        exitScript: "Setting """ + .name$ + """ is """ + .value$ + """, but it must be one of: " + replace$ (.allowed$, "|", ", ", 0)
    endif
endproc

# A comma-separated list; every item must be allowed. May be empty.
procedure getList: .name$, .allowed$
    @getText: .name$
    .value$ = getText.value$
    .rest$ = .value$ + ","
    while .rest$ <> ""
        .p = index (.rest$, ",")
        .item$ = left$ (.rest$, .p - 1)
        .rest$ = mid$ (.rest$, .p + 1, length (.rest$) - .p)
        if .item$ <> "" and index ("|" + .allowed$ + "|", "|" + .item$ + "|") = 0
            exitScript: "Setting """ + .name$ + """ contains """ + .item$ + """, but items must be from: " + replace$ (.allowed$, "|", ", ", 0)
        endif
    endwhile
endproc
