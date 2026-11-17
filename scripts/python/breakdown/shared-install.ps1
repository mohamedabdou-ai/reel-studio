param([string]$MainRoot = 'D:/Reel Studio', [switch]$CleanupCacheOnly, [string]$ArtifactDirectory)
$ErrorActionPreference = 'Stop'
$laneRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$mainPath = (Get-Item -LiteralPath $MainRoot).FullName.TrimEnd('\','/')
$artifactRoot = if ($ArtifactDirectory) { [IO.Path]::GetFullPath($ArtifactDirectory) } else { Join-Path $laneRoot 'state/tmp/breakdown-artifacts' }
# Staging is consumed only by this operation and is never recorded as a reinstall dependency.
$relativeFiles = @(
  'scripts/data/breakdown-pins.json',
  'scripts/lib/python-venv.mjs',
  'scripts/lib/breakdown-runtime.mjs',
  'scripts/python/breakdown/__init__.py',
  'scripts/python/breakdown/__main__.py',
  'scripts/python/breakdown/offline_pip.py'
)
$created = @()
$originalLocation = Get-Location
function Assert-MainPath([string]$Target) {
  $absolute = [IO.Path]::GetFullPath($Target)
  if (-not $absolute.StartsWith($mainPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes main checkout: $absolute" }
  & node --input-type=module -e "import {assertProjectOutput} from './scripts/lib/project-paths.mjs'; assertProjectOutput(process.argv[1]);" $absolute
  if ($LASTEXITCODE -ne 0) { throw "Main checkout path guard refused: $absolute" }
  return $absolute
}
try {
  # This deliberately stops before writing to main while licences remain unresolved.
  Set-Location -LiteralPath $laneRoot
  & node --input-type=module -e "import {loadPins} from './scripts/lib/breakdown-runtime.mjs'; loadPins();"
  if ($LASTEXITCODE -ne 0) { throw 'Pins are not approved. Resolve the recorded licence blockers before shared installation.' }
  Set-Location -LiteralPath $mainPath
  # Check every destination before creating any temporary code copy.
  foreach ($relative in $relativeFiles) {
    $target = Assert-MainPath (Join-Path $mainPath $relative)
    if (Test-Path -LiteralPath $target) { throw "Temporary code destination already exists; nothing is overwritten: $target" }
  }
  foreach ($relative in $relativeFiles) {
    $source = Join-Path $laneRoot $relative
    $target = Assert-MainPath (Join-Path $mainPath $relative)
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target
    $created += @{path=$target; sha256=(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash}
  }
  if ($CleanupCacheOnly) {
    & node --input-type=module -e "import {pruneBreakdownCache} from './scripts/lib/breakdown-runtime.mjs'; console.log(JSON.stringify(await pruneBreakdownCache(),null,2));"
    if ($LASTEXITCODE -ne 0) { throw 'Verified cache cleanup failed; no install was requested.' }
  } else {
    # The installer restores selected, verified artifacts locally, then prunes only
    # after installation, pip check and runtime inspection succeed.
    & node --input-type=module -e "import {installBreakdownRuntime} from './scripts/lib/breakdown-runtime.mjs'; console.log(JSON.stringify(await installBreakdownRuntime({python:'python',artifactDirectory:process.argv[1],log:line=>console.error(line)}),null,2));" $artifactRoot
    if ($LASTEXITCODE -ne 0) { throw 'Shared installation failed; retain artifacts and inspect Tools/breakdown/logs.' }
  }
  & node --input-type=module -e "import {inspectBreakdownRuntime} from './scripts/lib/breakdown-runtime.mjs'; const r=await inspectBreakdownRuntime(); console.log(JSON.stringify(r,null,2)); if(!r.ready)process.exitCode=1;"
  if ($LASTEXITCODE -ne 0) { throw 'Shared runtime inspection failed.' }
  # Default staging is disposable too; nothing retained outside the add-on is
  # excluded from its footprint. Explicit caller-supplied inputs are not deleted.
  $defaultStaging = [IO.Path]::GetFullPath((Join-Path $laneRoot 'state/tmp/breakdown-artifacts'))
  if ([IO.Path]::GetFullPath($artifactRoot).Equals($defaultStaging,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $defaultStaging)) {
    Set-Location -LiteralPath $laneRoot
    & node --input-type=module -e "import {promises as fs} from 'node:fs'; import {assertProjectOutput} from './scripts/lib/project-paths.mjs'; await fs.rm(assertProjectOutput(process.argv[1]),{recursive:true,force:true});" $defaultStaging
    if ($LASTEXITCODE -ne 0) { throw 'Runtime is ready but disposable lane staging cleanup failed.' }
    Set-Location -LiteralPath $mainPath
  }
} finally {
  Set-Location -LiteralPath $mainPath
  foreach ($record in $created) {
    $target = Assert-MainPath $record.path
    if (Test-Path -LiteralPath $target) {
      if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $record.sha256) { Remove-Item -LiteralPath $target }
      else { Write-Warning "Preserving concurrent changes in temporary code file: $target" }
    }
  }
  Set-Location -LiteralPath $originalLocation
}
