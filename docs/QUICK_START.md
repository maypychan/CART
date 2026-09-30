# Quick start: CAPE-Vr Clinical Acoustic Reporting Tool (CART)

For clinicians, students, and researchers. No installation is needed to use
CART.

## 1. Open the tool

Either way, everything you enter stays in your browser and on your computer.
Nothing is sent anywhere, and nothing is installed.

- **Online:** open the link on the project's page (see the README).
- **On your own computer (works without internet):** download the project as a
  ZIP (on GitHub: **Code → Download ZIP**), unzip it, and **double-click
  `index.html`**. It opens in your web browser.

Chrome or Edge is recommended; Firefox should work.

The bar at the top shows four steps, in page order. Only step 1 is needed;
steps 2 and 3 are optional.

**① CAPE-Vr form → ② Acoustics (optional) → ③ Documentation (optional) → ④ Report**

- Each step's circle shows its state: empty = not started, blue outline = in
  progress, filled with a check mark = complete. Click a circle to jump to
  that step.
- The buttons on the right are **New**, **Load…**, **Save**, and
  **Report…**. The small dot on **Save** is orange when there are unsaved
  changes and green when everything is saved.

## 2. Rate with the CAPE-Vr form (step 1)

- Fill in the blue-framed form from top to bottom, the same as the paper
  CAPE-Vr.
- **Rating lines:** click or drag on a line to place your mark; the arrow
  keys also work. Numbers are hidden by default, so you rate from the line
  alone. Tick **Show numerical values** to see them. Scores are saved either
  way.
- **More attributes:** type a name on the blank line to rate another
  attribute. Click **+ Add attribute** for further named lines (✕ removes
  one). These extra lines are an addition to the paper form.
- **Options** (Yes/No, Pitch, Instabilities, …): click to choose; click
  again to un-choose. Some items allow more than one choice.
- **Instructions:** the CAPE-Vr instructions (Table 1) are at the bottom of
  the form, under *CAPE-Vr instructions*.
- **Save:** click **Save** in the top bar. This downloads a session file
  (`…_capevr_<date>.json`). To continue later, use **Load…** and choose that
  file.

> Sessions are kept only in the files you save. If you close the browser
> without saving, your changes are lost. The browser warns you before this
> happens.

**Listening while rating:** add the recordings in step 2 first (a short
reminder sits just above the form). A small player then appears in the
bottom-right corner.

## 3. Acoustic analysis with Praat (step 2, optional)

You need [Praat](https://www.praat.org) installed; version 7.0.02 was used
for testing.

1. Open **2 · Acoustic analysis with Praat**.
2. **Add WAV files** (drag them in, or click the button). The app suggests a
   task for each file from its name. Check the suggestions and change any
   that are wrong.
3. Choose the **speaker profile**. You can adjust the pitch and formant
   values; they only set the ranges Praat searches in.
4. Click **Make Praat package…**, check the list, and click **Download
   package**.
5. **Unzip** the package. In Praat: *Praat → Open Praat script…* →
   `cape_acoustics.praat` → *Run → Run*. Praat may ask whether you trust the
   script; allow it. When the Info window says *Done*, `results.json` is in
   the same folder.
6. Back in the app, click **Import results.json…**.

The acoustic results are shown as soon as you import `results.json`. If you
want to rate without seeing the acoustics, finish and save your ratings
before you import the results.

**Excluding a take:** use *Exclude this take* on a recording that shouldn't
be used (a cough, a restart). It is left out of the package and the
summaries.

## 4. Documentation (step 3, optional)

Open **3 · Documentation tools**, below the acoustics. You can see and edit
everything here at any time, but the text can only be copied after the
session has been saved at least once ("Save the session first to copy").
Loading a saved session file counts as saved.

- **Statements from your clinic's rules:** one list of statements produced
  by your clinic's rules, each with its value (e.g. "Primary perceptual
  feature: roughness (35/100)"). Click **why?** to see the rule and the
  value behind it. Ticked statements (all, by default) are included in the
  Clinical Summary and the EMR draft; untick any you don't want.
- **Clinical Summary** and **EMR Documentation Draft:** editable text. Use
  **Copy to clipboard** to paste it into your notes. Always review and edit
  it first.
- **Interpretation Rules:** every rule starts empty. Your clinic decides
  whether to use any of them (severity ranges, feature ranking, descriptors,
  reference values) and sets its own values. A rule is used as soon as it is
  filled in; clear it to stop using it.
- **Rules files:** **Save rules file** / **Load rules file…** let a clinic
  share one set of rules.
- **Export CSV:** one row per evaluation, for spreadsheets or research. Tick
  *CSV without names* to leave out the name, examiner, rater, and original
  file names (and the speaker code, if it was made from Name/ID).

## 5. Report (step 4)

Click **Report…** (in the top bar) or **Generate and print report…** (at
the bottom of the page).

- **What's in it:** the CAPE-Vr form filled in, then (if imported) the
  acoustic results and the methods, then the Clinical Summary and the EMR
  draft as they read in the Documentation area. Untick *Clinical Summary* or
  *EMR draft* in the report's toolbar to leave them out.
- **Print / Save as PDF:** prints the report, or saves it as a PDF from the
  print dialog.
- **Hide names:** replaces Name/ID with the speaker code and hides original
  file names. If no separate *Speaker ID for file names* was typed in step 2,
  the speaker code is made from Name/ID, so it is hidden as well: Name/ID shows
  [removed] and file names start with [ID]. **Hide examiner and rater** hides those two names. Neither
  changes the text of the Clinical Summary or EMR draft. This is not a full
  de-identification: check the dates and free text before sharing.

## Common questions

- **Where is my data stored?** Only in the files you save: sessions, CSV,
  reports, and packages. Nothing is kept in the browser, and nothing is sent
  anywhere.
- **Do I have to use the acoustics?** No. The CAPE-Vr form, save/load, and
  the report work on their own.
- **Why are the numbers hidden while rating?** To reduce anchoring on
  numbers. Tick *Show numerical values* if you prefer to see them.
- **Can I rate without seeing the acoustic results?** Yes: finish and save
  your ratings before you import `results.json`. Results are shown as soon
  as they are imported.
- **Why can't I copy the summary?** Save the session first. Copying is
  available once the session has been saved at least once.
- **I reloaded a session and the recordings say "Not loaded".** The audio
  isn't stored in the session file. Add the same WAV files again, and they
  reconnect automatically.
- **Does the tool diagnose or tell me what's normal?** No. It organizes and
  documents your evaluation. Any categories or reference values come from
  rules your clinic defines.
- **Praat says the script failed.** Make sure every file from the package is
  in one folder, that the downloaded .zip folder is unzipped before loading the Praat script, and that you are using a recent Praat (7.0.02 was tested).
  Keep a note of the message shown.
