import { getContractAddress } from "viem";

const deployer = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";
const tokenAddress = getContractAddress({ from: deployer, nonce: 0n });
const stakingAddress = getContractAddress({ from: deployer, nonce: 1n });

console.log(`DEPLOYER_ADDRESS=${  deployer}`);
console.log(`SD_TOKEN_EXPECTED_ADDRESS=${  tokenAddress}`);
console.log(`STAKING_EXPECTED_ADDRESS=${  stakingAddress}`);
