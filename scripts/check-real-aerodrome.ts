import { createPublicClient, formatUnits,http, parseUnits } from 'viem';
import { base } from 'viem/chains';

const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const UNISWAP_V2_ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';
const PANCAKE_V2_ROUTER = '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';

const AERO_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'stable', type: 'bool' },
          { name: 'factory', type: 'address' },
        ],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

const UNI_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

async function testReal() {
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const amountIn = parseUnits('25000', 6);

  console.log('Testing 25k USDC on real Aerodrome Router...');

  try {
    const aeroOut = await client.readContract({
      address: AERODROME_ROUTER,
      abi: AERO_ABI,
      functionName: 'getAmountsOut',
      args: [
        amountIn,
        [
          {
            from: USDC,
            to: WETH,
            stable: false,
            factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
          },
        ],
      ],
    });
    const wethReceived = aeroOut[1];
    console.log('Aerodrome 25k USDC -> WETH:', formatUnits(wethReceived, 18), 'WETH');

    // Sell back on PancakeSwap V2 or Uniswap V2
    const uniOut = await client.readContract({
      address: UNISWAP_V2_ROUTER,
      abi: UNI_ABI,
      functionName: 'getAmountsOut',
      args: [wethReceived, [WETH, USDC]],
    });
    console.log('Uniswap V2 WETH -> USDC:', formatUnits(uniOut[1], 6), 'USDC');
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
testReal();
