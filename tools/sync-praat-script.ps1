# sync-praat-script.ps1 (developer tool; not needed to run the app)
#
# Browsers cannot read praat/cape_acoustics.praat when index.html is opened
# from file:// (no fetch of local files), so the app embeds a copy of the
# script in js/praat_script.js. Run this after every change to the .praat
# file:
#
#   powershell -ExecutionPolicy Bypass -File tools\sync-praat-script.ps1
#
# praat/cape_acoustics.praat is the master copy; never edit
# js/praat_script.js by hand.

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'praat\cape_acoustics.praat'
$dst = Join-Path $root 'js\praat_script.js'

$text = [IO.File]::ReadAllText($src)

$m = [regex]::Match($text, 'scriptVersion\$\s*=\s*"([^"]+)"')
if (-not $m.Success) { throw 'Could not find scriptVersion$ in cape_acoustics.praat' }
$version = $m.Groups[1].Value

# CRLF so the exported script opens cleanly in Praat on Windows; macOS Praat
# reads CRLF too.
$text = $text -replace "`r?`n", "`r`n"

# ConvertTo-Json produces a correctly escaped JavaScript string literal.
$escaped = ConvertTo-Json $text -Compress

$js = @"
/*
 * praat_script.js: GENERATED FILE. Do not edit by hand.
 * Copy of praat/cape_acoustics.praat, made by tools/sync-praat-script.ps1
 * on $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'). The app puts this text into
 * the Praat package.
 */
window.CAPE_PRAAT_SCRIPT = {
  version: "$version",
  text: $escaped
};
"@

[IO.File]::WriteAllText($dst, $js, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Wrote $dst (Praat script version $version, $($text.Length) characters)"
