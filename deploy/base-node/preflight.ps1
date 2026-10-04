param([Parameter(Mandatory)][int]$RequiredFreeGB, [string]$DataDir)
$ErrorActionPreference = 'Stop'; $fail = @()
if (-not $DataDir) { $DataDir = Join-Path $PSScriptRoot 'reth-data' }
$drive = (Split-Path (Resolve-Path -LiteralPath (Split-Path $DataDir -Parent)).Path -Qualifier)
$free = [int]((Get-PSDrive ($drive.TrimEnd(':'))).Free / 1GB)
if ($free -lt $RequiredFreeGB) { $fail += "Disk $drive has $free GB free; need $RequiredFreeGB GB." }
$envFile = Join-Path $PSScriptRoot '.env.node'
if (-not (Test-Path $envFile)) { $fail += 'Run init.ps1 first.' } else {
  $e = @{}; Get-Content $envFile | Where-Object { $_ -match '^[A-Z_0-9]+=' } | ForEach-Object { $k,$v = $_ -split '=',2; $e[$k]=$v.Trim('"') }
  foreach ($k in 'BASE_NODE_L1_ETH_RPC','BASE_NODE_L1_BEACON') { if (-not $e[$k] -or $e[$k] -like '<*') { $fail += "$k not set." } }
  if ($e['BASE_NODE_L2_ENGINE_AUTH_RAW'] -notmatch '^[0-9a-f]{64}$') { $fail += 'Engine JWT missing/invalid.' }
  if ($e['BASE_NODE_L1_ETH_RPC'] -and $e['BASE_NODE_L1_ETH_RPC'] -notlike '<*') {
    try { $r = Invoke-RestMethod $e['BASE_NODE_L1_ETH_RPC'] -Method Post -ContentType 'application/json' -TimeoutSec 15 -Body '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
      if ($r.result -ne '0x1') { $fail += 'L1 execution RPC is not Ethereum mainnet.' } } catch { $fail += 'L1 execution RPC unreachable.' }
  }
}
docker info *> $null; if ($LASTEXITCODE) { $fail += 'Docker daemon not running.' }
if ($fail) { $fail | ForEach-Object { Write-Error $_ -ErrorAction Continue }; exit 1 }
"Preflight OK: $free GB free."
