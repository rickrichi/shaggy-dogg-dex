// Run against a disposable Anvil fork only:
// anvil --fork-url https://mainnet.base.org --fork-block-number 52528062 --chain-id 31337 --port 18545
// node scripts/test-v3-timelock-fork.mjs
// Never reads a private key from environment or disk. All signing keys are generated in memory.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData,
  recoverTransactionAddress, verifyMessage, parseEventLogs, formatUnits, toHex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

const rpc = 'http://127.0.0.1:18545';
const client = createPublicClient({ chain: foundry, transport: http(rpc), pollingInterval: 50 });
assert.equal(await client.getChainId(), 31337, 'Refuse any chain other than the local test chain');
const metadata = await client.request({ method: 'anvil_metadata' });
assert.ok(metadata.forkedNetwork, 'Anvil must be a fork');
assert.equal(Number(metadata.forkedNetwork.chainId), 8453, 'Fork must originate from Base');
const locker = '0xb5c9bedb57f4e348e40a5e6326c90de474072e25';
const manager = '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1';
const originalOwner = '0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98';
const weth = '0x4200000000000000000000000000000000000006';
const router = '0x2626664c2603336E57B271c5C0b26F421741e481';
const tokenId = 6245990n;
const { abi } = JSON.parse(fs.readFileSync(new URL('../contracts/out/V3PositionTimelock.sol/V3PositionTimelock.json', import.meta.url)));
const nftAbi = parseAbi([
  'function ownerOf(uint256) view returns(address)',
  'function getApproved(uint256) view returns(address)',
  'function approve(address,uint256)',
  'function transferFrom(address,address,uint256)',
  'function positions(uint256) view returns(uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)',
]);
const tokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)', 'function approve(address,uint256) returns(bool)', 'function deposit() payable']);
const routerAbi = parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)']);
const owner = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const wallet = (account) => createWalletClient({ account, chain: foundry, transport: http(rpc) });
const checks = [];
const signedTransactions = [];
const check = (name) => { checks.push(name); console.log(`PASS ${name}`); };
const read = (address, contractAbi, functionName, args = []) => client.readContract({ address, abi: contractAbi, functionName, args });
const position = () => read(manager, nftAbi, 'positions', [tokenId]);
const lock = () => read(locker, abi, 'getLock', [tokenId]);
const balance = (token, address) => read(token, tokenAbi, 'balanceOf', [address]);
async function signed(account, address, contractAbi, functionName, args = [], expected = 'success', value = 0n) {
  // Fixed gas also lets reverted transactions be mined and inspected rather than failing at estimation.
  const request = await wallet(account).prepareTransactionRequest({
    to: address, data: encodeFunctionData({ abi: contractAbi, functionName, args }), value, gas: 1500000n,
  });
  assert.equal(request.chainId, 31337);
  const serializedTransaction = await wallet(account).signTransaction(request);
  assert.equal((await recoverTransactionAddress({ serializedTransaction })).toLowerCase(), account.address.toLowerCase());
  const hash = await client.sendRawTransaction({ serializedTransaction });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, expected, `${functionName} receipt status`);
  assert.equal(receipt.from.toLowerCase(), account.address.toLowerCase());
  signedTransactions.push({ functionName, hash, status: receipt.status });
  return receipt;
}
const baseline = await client.request({ method: 'evm_snapshot' });
let feeResult;
try {
  assert.equal((await read(manager, nftAbi, 'ownerOf', [tokenId])).toLowerCase(), originalOwner.toLowerCase());
  assert.equal((await lock())[1], 0n);
  for (const account of [owner, stranger, { address: originalOwner }]) {
    await client.request({ method: 'anvil_setBalance', params: [account.address, toHex(10n ** 20n)] });
  }
  // Move only the fork's copy to a disposable signer. The real wallet is never accessed.
  await client.request({ method: 'anvil_impersonateAccount', params: [originalOwner] });
  const transferHash = await wallet(originalOwner).writeContract({ address: manager, abi: nftAbi, functionName: 'transferFrom', args: [originalOwner, owner.address, tokenId] });
  assert.equal((await client.waitForTransactionReceipt({ hash: transferHash })).status, 'success');
  await client.request({ method: 'anvil_stopImpersonatingAccount', params: [originalOwner] });
  const message = 'Disposable local Base fork signing test; no mainnet authorization.';
  const signature = await wallet(owner).signMessage({ message });
  assert.equal(await verifyMessage({ address: owner.address, message, signature }), true);
  check('Wallet message signature recovers the disposable signer');

  const start = await client.getBlock();
  const unlock = start.timestamp + 90n * 86400n;
  await signed(owner, locker, abi, 'lockPosition', [tokenId, unlock], 'reverted');
  assert.equal((await lock())[1], 0n);
  check('Missing NFT approval rejects deposit and rolls back the lock record');
  await signed(owner, manager, nftAbi, 'approve', [locker, tokenId]);
  assert.equal((await read(manager, nftAbi, 'getApproved', [tokenId])).toLowerCase(), locker);
  check('Signed NFT approval is mined and authorizes the locker');
  await signed(owner, locker, abi, 'lockPosition', [tokenId, unlock]);
  assert.equal((await read(manager, nftAbi, 'ownerOf', [tokenId])).toLowerCase(), locker);
  assert.equal((await lock())[0], owner.address);
  assert.equal((await lock())[1], unlock);
  check('Signed 90-day deposit transfers the real Uniswap NFT into the deployed locker');
  const principal = (await position())[7];
  await signed(owner, locker, abi, 'withdraw', [tokenId], 'reverted');
  await signed(stranger, locker, abi, 'harvestTradingFees', [tokenId], 'reverted');
  await signed(stranger, locker, abi, 'withdraw', [tokenId], 'reverted');
  check('Early withdrawal and non-owner harvest/withdrawal revert');

  // Generate fees in both tokens through the fork's actual Uniswap router and pool.
  const info = await position();
  const sd = info[2];
  assert.equal(info[3].toLowerCase(), weth);
  await signed(stranger, weth, tokenAbi, 'deposit', [], 'success', 10000000000000n);
  await signed(stranger, weth, tokenAbi, 'approve', [router, 10000000000000n]);
  await signed(stranger, router, routerAbi, 'exactInputSingle', [{ tokenIn: weth, tokenOut: sd, fee: 10000, recipient: stranger.address, amountIn: 10000000000000n, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }]);
  const sdBought = await balance(sd, stranger.address);
  assert.ok(sdBought > 0n);
  await signed(stranger, sd, tokenAbi, 'approve', [router, sdBought / 2n]);
  await signed(stranger, router, routerAbi, 'exactInputSingle', [{ tokenIn: sd, tokenOut: weth, fee: 10000, recipient: stranger.address, amountIn: sdBought / 2n, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }]);
  const stored = await position();
  const expectedFees = (await client.simulateContract({ account: owner.address, address: locker, abi, functionName: 'harvestTradingFees', args: [tokenId] })).result;
  assert.ok(expectedFees[0] > 0n && expectedFees[1] > 0n, 'Require nonzero real swap fees in both tokens');
  const before = [await balance(sd, owner.address), await balance(weth, owner.address)];
  const receipt = await signed(owner, locker, abi, 'harvestTradingFees', [tokenId]);
  const event = parseEventLogs({ abi, logs: receipt.logs, eventName: 'FeesHarvested' })[0].args;
  assert.deepEqual([event.amount0, event.amount1], expectedFees);
  assert.equal(event.recipient, owner.address);
  assert.equal(await balance(sd, owner.address) - before[0], expectedFees[0]);
  assert.equal(await balance(weth, owner.address) - before[1], expectedFees[1]);
  assert.equal(await balance(sd, locker), 0n);
  assert.equal(await balance(weth, locker), 0n);
  assert.equal((await position())[7], principal);
  assert.equal((await read(manager, nftAbi, 'ownerOf', [tokenId])).toLowerCase(), locker);
  check('Signed harvest pays all SD and WETH fees to owner; NFT custody and liquidity stay unchanged');
  feeResult = { sd: formatUnits(expectedFees[0], 18), weth: formatUnits(expectedFees[1], 18), storedOwedBeforeHarvest: [stored[10].toString(), stored[11].toString()] };
  const empty = await signed(owner, locker, abi, 'harvestTradingFees', [tokenId]);
  const emptyEvent = parseEventLogs({ abi, logs: empty.logs, eventName: 'FeesHarvested' })[0].args;
  assert.equal(emptyEvent.amount0, 0n);
  assert.equal(emptyEvent.amount1, 0n);
  check('Second harvest succeeds with zero fees and does not double-pay');

  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(unlock - 1n)] });
  await signed(owner, locker, abi, 'withdraw', [tokenId], 'reverted');
  check('Withdrawal still reverts exactly one second before expiry');
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(unlock)] });
  await signed(stranger, locker, abi, 'withdraw', [tokenId], 'reverted');
  check('Non-owner withdrawal still reverts at expiry');
  await signed(owner, locker, abi, 'withdraw', [tokenId]);
  assert.equal(await read(manager, nftAbi, 'ownerOf', [tokenId]), owner.address);
  assert.equal((await lock())[0], '0x0000000000000000000000000000000000000000');
  assert.equal((await position())[7], principal);
  check('Signed withdrawal after expiry returns NFT and clears lock without changing liquidity');
  await signed(owner, locker, abi, 'withdraw', [tokenId], 'reverted');
  check('Repeated withdrawal fails');

  const annualUnlock = (await client.getBlock()).timestamp + 365n * 86400n;
  await signed(owner, manager, nftAbi, 'approve', [locker, tokenId]);
  await signed(owner, locker, abi, 'lockPosition', [tokenId, annualUnlock]);
  await client.request({ method: 'evm_setNextBlockTimestamp', params: [Number(annualUnlock)] });
  const annualReceipt = await signed(owner, locker, abi, 'withdraw', [tokenId]);
  assert.equal((await client.getBlock({ blockNumber: annualReceipt.blockNumber })).timestamp, annualUnlock);
  assert.equal(await read(manager, nftAbi, 'ownerOf', [tokenId]), owner.address);
  check('365-day lock withdraws successfully at the exact unlock timestamp');
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/v3-timelock-fork.json', JSON.stringify({ checkedAt: new Date().toISOString(), fork: metadata.forkedNetwork, signingChainId: 31337, checks, feeResult, signedTransactions }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, signedTransactions: signedTransactions.length, feeResult }, null, 2));
} finally {
  assert.equal(await client.request({ method: 'evm_revert', params: [baseline] }), true);
}
