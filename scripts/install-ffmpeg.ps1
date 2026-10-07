$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'install-ffmpeg.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Project-local FFmpeg installation failed' }
