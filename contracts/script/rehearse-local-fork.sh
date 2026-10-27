#!/usr/bin/env bash
# Dry run of the Mutt Rewards rehearsal (script/RehearseMrwd.s.sol) on a local Anvil fork of Base
# Sepolia, advancing time between phases. Uses an impersonated, freshly funded local address, so no
# key is needed and nothing is sent to the real network. Requires Foundry (anvil, cast, forge).
#   bash contracts/script/rehearse-local-fork.sh [BASE_SEPOLIA_RPC_URL]
set -u
cd "$(dirname "$0")/.."
RPC_IN=${1:-https://base-sepolia-rpc.publicnode.com}
L=http://127.0.0.1:8547
anvil --fork-url "$RPC_IN" --port 8547 --silent &
APID=$!
trap 'kill $APID' EXIT
for i in $(seq 1 30); do cast chain-id --rpc-url $L >/dev/null 2>&1 && break; sleep 1; done
ME=0x00000000000000000000000000000000000be7e1
cast rpc anvil_setBalance $ME 0x8AC7230489E80000 --rpc-url $L >/dev/null
cast rpc anvil_impersonateAccount $ME --rpc-url $L >/dev/null
run() { forge script script/RehearseMrwd.s.sol --sig "$1()" --rpc-url $L --unlocked --sender $ME --broadcast --slow 2>&1; }
adv() { cast rpc evm_increaseTime "$1" --rpc-url $L >/dev/null; cast rpc evm_mine --rpc-url $L >/dev/null; }
dead() { cast call "$MRWD" "balanceOf(address)(uint256)" 0x000000000000000000000000000000000000dEaD --rpc-url $L; }

OUT=$(run phase1); echo "$OUT" | grep -E "export|POOL|LOCKER|launch|PRO_|VESTING|period 0|Error|revert"
eval "$(echo "$OUT" | grep -oE 'export [A-Z_]+= 0x[0-9a-fA-F]{40}' | sed 's/= /=/')"
adv 1300
OUT=$(run phase2); echo "$OUT" | grep -E "export|Error|revert"
eval "$(echo "$OUT" | grep -oE 'export TOKEN_ID= [0-9]+' | sed 's/= /=/')"
adv 7300
OUT=$(run phase3); echo "$OUT" | grep -E "MRWD|Error|revert"
echo "MRWD at 0xdEaD after phase 3 (on chain): $(dead)"
adv 14500
OUT=$(run phase4); echo "$OUT" | grep -E "period 2|scheduler|Error|revert"
echo "MRWD at 0xdEaD after phase 4 (on chain): $(dead)"
