param([Parameter(Mandatory=$true)][string]$StagePath)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $repoPath
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
    # A new staging directory prevents accidentally including host keys or old build files.
    if (Test-Path -LiteralPath $StagePath) { throw 'Choose a new, empty staging path.' }
    New-Item -ItemType Directory -Path $StagePath | Out-Null
    Copy-Item -LiteralPath package.json,package-lock.json -Destination $StagePath
    Copy-Item -LiteralPath dist,policies -Destination $StagePath -Recurse
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Dockerfile') -Destination $StagePath
    & docker build -t aletheia-custody-drill:local $StagePath
    if ($LASTEXITCODE -ne 0) { throw 'Image build failed' }
} finally { Pop-Location }
