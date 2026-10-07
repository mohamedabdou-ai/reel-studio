# Ensures a Node.js 22.20+ x64 for this folder without admin rights.
# Prints one JSON line: {"ok":true,"node":"<path>","source":"portable|system|downloaded"} or {"ok":false,"error":"..."}.
# ASCII only on purpose: Windows PowerShell 5.1 reads BOM-less scripts in the ANSI code page.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$portable = Join-Path $root 'Tools\node\node.exe'

function Test-Node([string]$exe) {
  if (-not $exe -or -not (Test-Path -LiteralPath $exe)) { return $false }
  $info = & $exe -p "process.versions.node + ' ' + process.arch" 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $info) { return $false }
  $parts = "$info".Trim().Split(' ')
  return ($parts.Length -eq 2 -and $parts[1] -eq 'x64' -and ([version]$parts[0]) -ge ([version]'22.20.0'))
}

function Write-Result([hashtable]$result, [int]$code) {
  Write-Output ($result | ConvertTo-Json -Compress)
  exit $code
}

try {
  if (Test-Node $portable) { Write-Result @{ ok = $true; node = $portable; source = 'portable' } 0 }
  $system = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($system -and (Test-Node $system.Source)) { Write-Result @{ ok = $true; node = $system.Source; source = 'system' } 0 }

  $lock = Get-Content -LiteralPath (Join-Path $root 'versions.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $version = $lock.node.version
  $downloads = Join-Path $root 'state\downloads'
  New-Item -ItemType Directory -Force -Path $downloads | Out-Null
  $zip = Join-Path $downloads ("node-v$version-win-x64.zip")
  $partial = "$zip.partial"
  if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -UseBasicParsing -Uri $lock.node.url -OutFile $partial -TimeoutSec 900
  $hash = (Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $lock.node.sha256) {
    Remove-Item -LiteralPath $partial -Force
    throw "Node download failed its SHA-256 hash check (got $hash). Nothing was installed."
  }
  Move-Item -LiteralPath $partial -Destination $zip -Force
  $stage = Join-Path $downloads ('node-stage-' + [guid]::NewGuid().ToString('N'))
  Expand-Archive -LiteralPath $zip -DestinationPath $stage
  $extracted = Join-Path $stage "node-v$version-win-x64"
  if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe'))) { throw 'The Node archive did not contain node.exe.' }
  $target = Join-Path $root 'Tools\node'
  if (Test-Path -LiteralPath $target) {
    if ((Get-Item -LiteralPath $target -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Tools\node is a link; remove it by hand and retry.' }
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $root 'Tools') | Out-Null
  Move-Item -LiteralPath $extracted -Destination $target
  Remove-Item -LiteralPath $stage -Recurse -Force
  Remove-Item -LiteralPath $zip -Force
  if (-not (Test-Node $portable)) { throw 'Portable Node was installed but does not run.' }
  Write-Result @{ ok = $true; node = $portable; source = 'downloaded' } 0
} catch {
  Write-Result @{ ok = $false; error = $_.Exception.Message } 1
}
