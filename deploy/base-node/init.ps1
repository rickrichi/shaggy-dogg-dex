$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (Test-Path .env.node) { throw '.env.node exists; refusing to overwrite.' }
$bytes = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$jwt = -join ($bytes | ForEach-Object { $_.ToString('x2') })
(Get-Content env.mainnet.example -Raw).Replace('__GENERATED__', $jwt) | Set-Content .env.node -NoNewline
Write-Output 'Created .env.node with a fresh engine JWT. Edit the two L1 endpoints and set HOST_DATA_DIR if needed.'
