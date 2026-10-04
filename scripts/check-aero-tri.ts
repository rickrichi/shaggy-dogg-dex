import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';

const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const WETH = '0x4200000000000000000000000000000000000006';
const AERO = '0x940181A94A35a4569E4529A3cDfb74e48fD986cA';

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

async function checkTriangularAerodrome() {
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const amountIn = parseUnits('1000', 6); // 1,000 USDC
  const factory = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';

  console.log('Checking Aerodrome triangular: USDC -> WETH -> AERO -> USDC (1,000 USDC)...');
  try {
    const res = await client.readContract({
      address: AERODROME_ROUTER,
      abi: AERO_ABI,
      functionName: 'getAmountsOut',
      args: [
        amountIn,
        [
          { from: USDC, to: WETH, stable: false, factory },
          { from: WETH, to: AERO, stable: false, factory },
          { from: AERO, to: USDC, stable: false, factory },
        ],
      ],
    });
    console.log('Output for 1,000 USDC in:', formatUnits(res[3], 6), 'USDC');
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
checkTriangularAerodrome();
