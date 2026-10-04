import { createPublicClient, http, parseUnits, formatUnits } from 'viem';
import { base } from 'viem/chains';

const AERODROME_ROUTER = '0xcF664087A5Bb0237a0BAd6742852EC6C8D58504E';
const UNISWAP_V2_ROUTER = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24';

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

async function checkCrossDex() {
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const amountIn = parseUnits('25000', 6);

  console.log('--- Checking Aerodrome vs Uniswap V2 (25,000 USDC) ---');

  // Check 1: Aerodrome USDC -> WETH
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
    console.log('Aerodrome 25k USDC -> WETH:', formatUnits(aeroOut[1], 18), 'WETH');

    // Sell that WETH on Uniswap V2
    const uniOut = await client.readContract({
      address: UNISWAP_V2_ROUTER,
      abi: UNI_ABI,
      functionName: 'getAmountsOut',
      args: [aeroOut[1], [WETH, USDC]],
    });
    console.log('Uniswap V2 WETH -> USDC:', formatUnits(uniOut[1], 6), 'USDC');
    const net = Number(formatUnits(uniOut[1], 6)) - 25000;
    console.log('Net spread (Buy Aero, Sell Uni):', net.toFixed(2), 'USDC');
  } catch (err: any) {
    console.error('Aerodrome check error:', err.message);
  }

  // Check 2: Uniswap V2 USDC -> WETH
  try {
    const uniOut2 = await client.readContract({
      address: UNISWAP_V2_ROUTER,
      abi: UNI_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, [USDC, WETH]],
    });
    console.log('\nUniswap V2 25k USDC -> WETH:', formatUnits(uniOut2[1], 18), 'WETH');

    // Sell that WETH on Aerodrome
    const aeroOut2 = await client.readContract({
      address: AERODROME_ROUTER,
      abi: AERO_ABI,
      functionName: 'getAmountsOut',
      args: [
        uniOut2[1],
        [
          {
            from: WETH,
            to: USDC,
            stable: false,
            factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
          },
        ],
      ],
    });
    console.log('Aerodrome WETH -> USDC:', formatUnits(aeroOut2[1], 6), 'USDC');
    const net2 = Number(formatUnits(aeroOut2[1], 6)) - 25000;
    console.log('Net spread (Buy Uni, Sell Aero):', net2.toFixed(2), 'USDC');
  } catch (err: any) {
    console.error('Uni check error:', err.message);
  }
}

checkCrossDex();
