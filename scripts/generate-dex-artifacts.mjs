import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { keccak256 } from 'viem';

const sources = { factory: ['core', 'UniswapV2Factory'], router: ['periphery', 'UniswapV2Router02'], pair: ['core', 'UniswapV2Pair'] };
const artifacts = {};
for (const [key, [pkg, name]] of Object.entries(sources)) {
  const artifact = JSON.parse(readFileSync(`node_modules/@uniswap/v2-${pkg}/build/${name}.json`, 'utf8'));
  artifacts[key] = { abi: artifact.abi, bytecode: `0x${artifact.bytecode}`, runtime: `0x${artifact.evm.deployedBytecode.object}`,
    immutableRanges: Object.values(artifact.evm.deployedBytecode.immutableReferences ?? {}).flat() };
}
const hash = keccak256(artifacts.pair.bytecode);
if (hash !== '0x96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f') throw new Error('Router/Pair init-code mismatch');
mkdirSync('src/config/dex', { recursive: true });
writeFileSync('src/config/dex/artifacts.json', JSON.stringify(artifacts) + '\n');
mkdirSync('contracts/vendor', { recursive: true });
for (const pkg of ['core', 'periphery']) copyFileSync(`node_modules/@uniswap/v2-${pkg}/LICENSE`, `contracts/vendor/UNISWAP-V2-${pkg.toUpperCase()}-LICENSE`);
console.log('Generated pinned V2 artifacts. Pair init code:', hash);
