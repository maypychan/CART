# CAPE-Vr Clinical Acoustic Reporting Tool (CART)

CART is a browser-based tool for completing the **Consensus
Auditory-Perceptual Evaluation of Voice – Revised (CAPE-Vr)**. Optionally, it
also prepares an acoustic analysis for [Praat](https://www.praat.org), imports
the results, and produces a combined, printable report. Optional
documentation tools help draft clinical text from transparent,
clinic-defined rules.

> **Documentation and reporting aid.** It does not diagnose disorders and does
> not replace clinical judgment. See [Disclaimers](#disclaimers).

Version 0.1.0 · tested with Praat 7.0.02

---

## Use it

- **Online:** *[https://maypychan.github.io/CART/](https://maypychan.github.io/CART/)*
- **On your own computer, with no internet needed:** download this repository
  (**Code → Download ZIP**), unzip it, and double-click `index.html`.

Either way, nothing is installed, nothing is stored in the browser, and
nothing you enter is sent anywhere. Ratings, recordings, and results stay on
your computer, in files you save yourself. When you use the online link, only
the page itself is loaded from GitHub. As with any website, GitHub may keep
standard access logs of that page visit.

Chrome or Edge is recommended. For the acoustic
analysis, install [Praat](https://www.praat.org) (tested with 7.0.02). Praat
is separate software and is not included.

A step-by-step guide is in [`docs/QUICK_START.md`](docs/QUICK_START.md).

## Overview

The tool follows the order of a voice evaluation:

1. **CAPE-Vr form:** rate with visual analog scales and descriptive options,
   as in the published form. Save and reload sessions as files.
2. **Acoustics (optional):** add WAV recordings, export a ready-to-run Praat
   package, run it in your own Praat, and import `results.json`.
3. **Documentation (optional):** an editable Clinical Summary and EMR draft,
   a CSV export, and rules your clinic defines.
4. **Report:** the filled-in CAPE-Vr form, plus the acoustic results, the
   methods, and the Clinical Summary and EMR draft, printed or saved as PDF.

A progress bar at the top shows each step as not started, in progress, or
complete.

## Features

- **CAPE-Vr form.**
  - Scales are 0–100, with direction-only end labels and no severity labels.
  - Numbers are hidden while rating by default.
  - Further named attribute scales can be added below the blank one.
  - The Table 1 instructions are included.
- **File-based.** Sessions are saved as files you download and load again.
  Nothing is stored in the browser.
- **Praat does the analysis.**
  - A packaged script and settings file run in stock Praat.
  - Every setting is recorded in `results.json` and summarized in the
    report's methods paragraph.
- **Measures:**
  - sustained vowels: F0, intensity, CPPS, HNR, jitter, shimmer, and F1–F3;
  - sentences, extemporaneous speech, and reading: F0, intensity, and CPPS.
- **Recording tools.**
  - Tasks are suggested from file names.
  - Takes are numbered automatically, and a take can be excluded.
  - A floating player lets you listen while rating.
- **Transparent documentation tools.**
  - Every generated line shows the value and the rule behind it.
  - All rules start empty and are used once filled in; categories and
    reference values are clinic-defined.
  - Each rule statement can be unticked to leave it out of the texts.
  - Rule sets can be shared as files.
  - The texts can be copied once the session has been saved.
- **Exports:** the session (JSON), the Praat package (ZIP), the report
  (print or PDF), and a CSV with one row per evaluation. "Hide names"
  options are available.

## Example workflow

```
Rate the CAPE-Vr form ─► Save session
        │
        ├─(optional) Add WAVs ─► Make Praat package ─► run in Praat ─► Import results.json
        ├─(optional) Documentation: rules ─► Clinical Summary / EMR draft ─► Copy / Export CSV
        └─► Generate and print report
```

## Outputs

| Output | File | Contents |
|---|---|---|
| Session | `<ID>_capevr_<date>.json` | All ratings, recording metadata (not audio), settings, rules copy, results, documentation texts |
| Praat package | `<ID>_praat_package.zip` | Renamed WAVs, `cape_settings.tsv`, `cape_acoustics.praat`, `README.txt` |
| Praat results | `results.json` (written by Praat) | Every measure (or `null` with a reason), the settings, and the versions |
| Report | print / PDF | The CAPE-Vr form filled in, the acoustic tables, the methods, the Clinical Summary and EMR draft (each optional), and attribution |
| CSV | `<ID>_capevr_<date>[_names-hidden].csv` | One row: session details, all scores, acoustic values, rule outputs |
| Rules | `rules_<name>_<date>.json` | The clinic-defined interpretation rules |

Session files, packages, reports, and CSV files can contain identifying
information and voice recordings. Store and share them according to your
organization's policies.

## Repository contents

```
index.html               the application (open this)
css/app.css              styles
js/                      the application code, one file per task (see below)
praat/
  cape_acoustics.praat   the Praat script (also runs on its own in Praat)
  cape_settings_template.tsv   example settings file for running the script by hand
docs/
  QUICK_START.md         step-by-step guide

tools/
  sync-praat-script.ps1  for developers only
```

| `js/` file | Purpose |
|---|---|
| `session.js` | Session data, loading checks, saving |
| `notices.js` | Disclaimer and attribution wording |
| `praat_script.js` | Generated copy of the Praat script, put into each package |
| `upload.js` | WAV intake (header details only), tasks, takes, player, pre-export checks |
| `export.js` | Settings file, ZIP package, CSV |
| `report.js` | Printable report and acoustic tables |
| `import.js` | `results.json` checks and import |
| `rules.js` | Clinic-defined rules and the rule editor |
| `summary.js` | Rule statements, Clinical Summary, and EMR draft |
| `form.js` | CAPE-Vr form, progress bar, and start-up (loaded last) |

There is nothing to build and there are no dependencies.

## Limitations

- **Not validated.** There is no validation study yet against hand-measured
  Praat values or other software. Verify results in your own workflow.
- **Browsers and platforms:** tested in Chrome, with Praat 7.0.02 on
  Windows. Firefox, Safari, and macOS Praat have not been tested.
- **Acoustic results are shown as soon as they are imported.** To rate
  without seeing them, complete and save the ratings before importing
  `results.json`.
- **"Hide names" is not de-identification:** dates, age, gender, and free
  text (including the Clinical Summary and EMR draft) remain.
- **No norms.** Categories and reference values exist only if your clinic
  defines them.

## Disclaimers

This software assists with documentation and reporting only.

- It does not diagnose disorders and does not replace clinician judgment.
- Acoustic results depend on recording conditions, equipment, analysis
  settings, preprocessing, and software versions. Users are responsible for
  verifying them.
- Generated text is rule-based and must be reviewed and edited before
  clinical use.
- Any reference values or ranges are clinic-defined. The software provides
  no normative values and makes no claim of clinical validity.
- It is provided as is, without warranty.

**Attribution.** CART implements a documentation workflow around the CAPE-Vr
(Kempster, Nagle & Solomon, 2025, *J Voice*, doi:10.1016/j.jvoice.2025.01.022).
The form content is adapted under CC BY 4.0. CART is independent and is not
affiliated with or endorsed by the CAPE-Vr or CAPE-V authors, ASHA, The Voice
Foundation, or Elsevier. Praat is separate software by P. Boersma and D. Weenink.

## Design principles
- Acoustic measures are computed by Praat, not by this application.
- Generated documentation remains traceable to explicit rules and reported values.
- The application operates entirely locally and does not require network access.

## Citation
If you use CART in research, please cite:
### Assessment Instrument
- Kempster GB, Nagle KF, Solomon NP (2025). Development and rationale for
  the Consensus Auditory-Perceptual Evaluation of Voice—Revised (CAPE-Vr).
  *J Voice*. doi:10.1016/j.jvoice.2025.01.022.
### Acoustic-analysis software
- Boersma P, Weenink D. *Praat: doing phonetics by computer* (version used).
### CART Software
- Chan MPY, *CART (CAPE-Vr Clinical Acoustic Reporting Tool)*. Version 1.0. GitHub repository, 2026. https://maypychan.github.io/CART/

The report's methods paragraph lists the Praat version and every analysis setting used.
