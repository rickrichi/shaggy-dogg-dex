$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$backendRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot '../crypto-arb/backend'))
$pythonExe = Join-Path $backendRoot '.venv/Scripts/python.exe'
$stage = Join-Path $repoRoot '.desktop-build'
New-Item -ItemType Directory -Force -Path $stage | Out-Null
# Install build tooling inside this workspace; never copy backend .env or data.
uv pip install --python $pythonExe --target (Join-Path $stage 'tools') pyinstaller
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller installation failed' }
$previousPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = Join-Path $stage 'tools'
  & $pythonExe -m PyInstaller --noconfirm --name shaggy-arb --onedir --console --paths $backendRoot --paths (Join-Path $repoRoot 'scripts') --collect-submodules app --collect-all ccxt --collect-all uvicorn --collect-all websockets --distpath (Join-Path $stage 'dist') --workpath (Join-Path $stage 'work') --specpath $stage (Join-Path $PSScriptRoot 'backend-entry.py')
  if ($LASTEXITCODE -ne 0) { throw 'Backend packaging failed' }
} finally { $env:PYTHONPATH = $previousPythonPath }
