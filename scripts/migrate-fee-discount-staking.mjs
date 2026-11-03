import fs from "node:fs";
import path from "node:path";

import {
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  formatEther,
  getAddress,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const LEGACY_STAKING = [
  { ecosystem: "SD", address: "0x42134ccc6c41149cf71c7b4994e33ee66758af20" },
  { ecosystem: "AMUTT", address: "0x055BB4eD8d5464C25D71391E940ce53CA30845fC" },
];

const legacyAbi = parseAbi([
  "function admin() view returns (address)",
  "function tierAdmin() view returns (address)",
  "function token() view returns (address)",
  "function minimumStakePeriod() view returns (uint256)",
  "function withdrawalFeeBps() view returns (uint16)",
  "function tiers(uint256) view returns (uint256 stakeRequired, uint16 discountBps)",
  "function stakedBalance(address) view returns (uint256)",
  "function setMinimumStakePeriod(uint256 period)",
  "function unstake(uint256 amount)",
  "function stake(uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

function privateKey() {
  const raw = process.env.PRIVATE_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!raw) throw new Error("PRIVATE_KEY is required to identify the migration signer.");
  return /** @type {`0x${string}`} */ (raw.startsWith("0x") ? raw : `0x${raw}`);
}

function artifact() {
  const file = path.resolve("contracts/out/FeeDiscountStaking.sol/FeeDiscountStaking.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const bytecode = parsed.bytecode?.object;
  if (!bytecode) throw new Error(`Missing deployable bytecode in ${file}`);
  return { abi: parsed.abi, bytecode: /** @type {`0x${string}`} */ (bytecode) };
}

async function readTiers(client, address) {
  const tiers = [];
  for (let index = 0n; index < 64n; index += 1n) {
    try {
      const [stakeRequired, discountBps] = await client.readContract({
        address,
        abi: legacyAbi,
        functionName: "tiers",
        args: [index],
      });
      tiers.push({ stakeRequired, discountBps });
    } catch {
      break;
    }
  }
  return tiers;
}

async function snapshot(client, item, signer) {
  const address = getAddress(item.address);
  const [admin, tierAdmin, token, minimumStakePeriod, withdrawalFeeBps, tiers] =
    await Promise.all([
      client.readContract({ address, abi: legacyAbi, functionName: "admin" }),
      client.readContract({ address, abi: legacyAbi, functionName: "tierAdmin" }),
      client.readContract({ address, abi: legacyAbi, functionName: "token" }),
      client.readContract({ address, abi: legacyAbi, functionName: "minimumStakePeriod" }),
      client.readContract({ address, abi: legacyAbi, functionName: "withdrawalFeeBps" }),
      readTiers(client, address),
    ]);
  const stakedTokenBalance = await client.readContract({
    address: token,
    abi: legacyAbi,
    functionName: "balanceOf",
    args: [address],
  });
  const signerStakedBalance = await client.readContract({
    address,
    abi: legacyAbi,
    functionName: "stakedBalance",
    args: [signer],
  });
  return {
    ...item,
    address,
    admin: getAddress(admin),
    tierAdmin: getAddress(tierAdmin),
    token: getAddress(token),
    minimumStakePeriod,
    withdrawalFeeBps,
    tiers,
    stakedTokenBalance,
    signerStakedBalance,
  };
}

async function main() {
  const broadcast = process.argv.includes("--broadcast");
  const moveSignerPosition = process.argv.includes("--move-signer-position");
  const rpcUrl = process.env.BASE_RPC_URL || process.env.RPC_URL || "https://mainnet.base.org";
  const account = privateKeyToAccount(privateKey());
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const balance = await client.getBalance({ address: account.address });
  const snapshots = await Promise.all(
    LEGACY_STAKING.map((item) => snapshot(client, item, account.address))
  );

  if (moveSignerPosition) {
    const recordFile = path.resolve("deployments/base-mainnet-staking-migration.json");
    const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
    const wallet = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
    for (const current of snapshots) {
      if (current.signerStakedBalance === 0n) continue;
      const migrated = record.contracts.find((entry) => entry.ecosystem === current.ecosystem);
      if (!migrated?.replacement) throw new Error(`No replacement recorded for ${current.ecosystem}.`);
      const replacement = getAddress(migrated.replacement);
      const unstakeHash = await wallet.writeContract({
        address: current.address,
        abi: legacyAbi,
        functionName: "unstake",
        args: [current.signerStakedBalance],
      });
      await client.waitForTransactionReceipt({ hash: unstakeHash });
      const approveHash = await wallet.writeContract({
        address: current.token,
        abi: legacyAbi,
        functionName: "approve",
        args: [replacement, current.signerStakedBalance],
      });
      await client.waitForTransactionReceipt({ hash: approveHash });
      const stakeHash = await wallet.writeContract({
        address: replacement,
        abi: legacyAbi,
        functionName: "stake",
        args: [current.signerStakedBalance],
      });
      await client.waitForTransactionReceipt({ hash: stakeHash });
      migrated.positionMigration = {
        amount: current.signerStakedBalance.toString(),
        unstakeHash,
        approveHash,
        stakeHash,
      };
    }
    fs.writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`Signer positions migrated; record updated: ${recordFile}`);
    return;
  }
  const { abi, bytecode } = artifact();
  const gasPrice = await client.getGasPrice();
  const deploymentGas = await Promise.all(
    snapshots.map((current) =>
      client.estimateGas({
        account,
        data: encodeDeployData({
          abi,
          bytecode,
          args: [current.token, account.address, account.address],
        }),
      })
    )
  );
  const deploymentGasFloor = deploymentGas.reduce((total, gas) => total + gas, 0n) * gasPrice;

  console.log(`Mode: ${broadcast ? "BROADCAST" : "DRY RUN"}`);
  console.log(`Signer: ${account.address} (${formatEther(balance)} ETH)`);
  console.log(
    `Deployment-only gas floor: ${formatEther(deploymentGasFloor)} ETH (configuration and L1 data fees excluded)`
  );
  for (const current of snapshots) {
    console.log(
      JSON.stringify(
        {
          ecosystem: current.ecosystem,
          legacy: current.address,
          token: current.token,
          admin: current.admin,
          tierAdmin: current.tierAdmin,
          signerIsAdmin: current.admin === account.address,
          lockSeconds: current.minimumStakePeriod.toString(),
          withdrawalFeeBps: Number(current.withdrawalFeeBps),
          stakedTokenBalance: current.stakedTokenBalance.toString(),
          signerStakedBalance: current.signerStakedBalance.toString(),
          tiers: current.tiers.map(({ stakeRequired, discountBps }) => ({
            stakeRequired: stakeRequired.toString(),
            discountBps: Number(discountBps),
          })),
        },
        null,
        2
      )
    );
  }

  if (!broadcast) return;
  if (snapshots.some(({ admin }) => admin !== account.address)) {
    throw new Error("The configured signer is not administrator of both legacy contracts.");
  }

  const wallet = createWalletClient({ account, chain: base, transport: http(rpcUrl) });
  const result = [];
  for (const current of snapshots) {
    const deployHash = await wallet.deployContract({
      abi,
      bytecode,
      args: [current.token, account.address, account.address],
    });
    const receipt = await client.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) throw new Error(`${current.ecosystem} deployment returned no address.`);
    const replacement = receipt.contractAddress;

    const writes = [
      ["setTiers", [current.tiers.map(({ stakeRequired, discountBps }) => ({ stakeRequired, discountBps }))]],
      ["setMinimumStakePeriod", [current.minimumStakePeriod]],
      ["setWithdrawalFee", [current.withdrawalFeeBps]],
      ["setTierAdmin", [current.tierAdmin]],
      ["setAdmin", [current.admin]],
    ];
    for (const [functionName, args] of writes) {
      const hash = await wallet.writeContract({ address: replacement, abi, functionName, args });
      await client.waitForTransactionReceipt({ hash });
    }

    // Open the legacy exit path only after its replacement is fully configured.
    const unlockHash = await wallet.writeContract({
      address: current.address,
      abi: legacyAbi,
      functionName: "setMinimumStakePeriod",
      args: [0n],
    });
    await client.waitForTransactionReceipt({ hash: unlockHash });
    result.push({ ecosystem: current.ecosystem, legacy: current.address, replacement, deployHash, unlockHash });
  }

  const output = path.resolve("deployments/base-mainnet-staking-migration.json");
  fs.writeFileSync(
    output,
    `${JSON.stringify({ chainId: base.id, migratedAt: new Date().toISOString(), signer: account.address, contracts: result }, null, 2)}\n`
  );
  console.log(`Migration record: ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
