import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Aerodrome official router on Base is known as:
// Universal Router or SwapRouter or Aerodrome Router
// Aerodrome Router: 0xcF664087a5bB0237a0BAd6742852ec6c8d58504e ? Wait! Let's check why code length was 0!
// Let's test checking known Base contracts!

async function findRouters() {
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });

  const candidates = [
    { name: 'Aerodrome Router v1', addr: '0xcF664087a5bB0237a0BAd6742852ec6c8d58504e' },
    { name: 'Aerodrome Router (official)', addr: '0xcF77a3bA9A5ca399b7c97c749545344273801A9B' },
    { name: 'Aerodrome Universal Router', addr: '0x6cD6121098670A99778D4a1801C7aC0113c19e8D' },
    { name: 'Uniswap V2 Router in code', addr: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' },
    { name: 'Uniswap V3 SwapRouter02', addr: '0x2626664c2603336E57B271c5C0b26F421741e481' },
    { name: 'Uniswap Universal Router', addr: '0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD' },
    { name: 'SushiSwap v2 Router Base', addr: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891' },
    { name: 'PancakeSwap v2 Router Base', addr: '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb' },
    { name: 'PancakeSwap v3 Router Base', addr: '0x1b81D678ffb9C0263b24A97847620C99d213eB14' },
  ];

  for (const c of candidates) {
    try {
      const code = await client.getBytecode({ address: c.addr as any });
      console.log(`${c.name} (${c.addr}): length = ${code ? code.length : 0}`);
    } catch (e: any) {
      console.log(`${c.name} error: ${e.message}`);
    }
  }
}
findRouters();
