#!/usr/bin/env bash
# Dry run of the Mutt Rewards launch (script/LaunchMrwd.s.sol) on a local Anvil fork of Base
# mainnet. Uses an impersonated local address given FORK_BALANCE wei of ETH (default 10 ETH), so no
# key is needed and nothing is sent to the real network. Requires Foundry (anvil, cast, forge).
#   [FORK_BALANCE=<wei>] [LAUNCH_WETH=<wei>] bash contracts/script/launch-local-fork.sh [BASE_RPC_URL]
set -u
cd "$(dirname "$0")/.."
RPC_IN=${1:-https://base-rpc.publicnode.com}
L=http://127.0.0.1:8549
anvil --fork-url "$RPC_IN" --port 8549 --silent &
APID=$!
trap 'kill $APID' EXIT
for i in $(seq 1 40); do cast chain-id --rpc-url $L >/dev/null 2>&1 && break; sleep 1; done
ME=0x00000000000000000000000000000000000be7e1
cast rpc anvil_setBalance $ME "$(cast to-hex "${FORK_BALANCE:-10000000000000000000}")" --rpc-url $L >/dev/null
cast rpc anvil_impersonateAccount $ME --rpc-url $L >/dev/null
OUT=$(forge script script/LaunchMrwd.s.sol --rpc-url $L --unlocked --sender $ME --broadcast --slow 2>&1)
echo "$OUT" | sed -n '/== Logs ==/,/Setting up/p' | grep -vE "Setting up"
echo "$OUT" | grep -E "Error|revert|COMPLETE"
M=$(echo "$OUT" | grep -E "^ +MRWD 0x" | grep -oE "0x[0-9a-fA-F]{40}")
S=$(echo "$OUT" | grep -E "^ +SCHEDULER 0x" | grep -oE "0x[0-9a-fA-F]{40}")
T=$(echo "$OUT" | grep -E "^ +TREASURY_VESTING 0x" | grep -oE "0x[0-9a-fA-F]{40}")
V=$(echo "$OUT" | grep -E "^ +TEAM_VESTING 0x" | grep -oE "0x[0-9a-fA-F]{40}")
P=$(echo "$OUT" | grep -E "^ +POOL 0x" | grep -oE "0x[0-9a-fA-F]{40}")
for a in "signer $ME" "0xdEaD 0x000000000000000000000000000000000000dEaD" "scheduler $S" \
    "staker 0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1" "pool $P" "treasury-vesting $T" "team-vesting $V"; do
  set -- $a; echo "MRWD held by $1: $(cast call "$M" 'balanceOf(address)(uint256)' "$2" --rpc-url $L)"
done
echo "ETH left with the signer: $(cast balance $ME --rpc-url $L)"
