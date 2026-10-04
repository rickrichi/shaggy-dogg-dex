# Read-only health check of the local node; then of the gateway if SHAGGY_RPC_KEY_FILE is set.
$rpc = { param($u,$m,$h=@{}) (Invoke-RestMethod $u -Method Post -ContentType 'application/json' -Headers $h -Body (@{jsonrpc='2.0';id=1;method=$m;params=@()}|ConvertTo-Json)).result }
$u = 'http://127.0.0.1:8545'
$chain = & $rpc $u eth_chainId; if ($chain -ne '0x2105') { throw "Wrong chain: $chain" }
$sync = & $rpc $u eth_syncing
$blk = & $rpc $u eth_blockNumber
"chain=8453 block=$([Convert]::ToInt64($blk,16)) syncing=$(if ($sync) { 'YES - do not use as upstream yet' } else { 'no' })"
