import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

async function checkCode() {
  const client = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') });
  const code1 = await client.getBytecode({ address: '0xcF664087A5Bb0237a0BAd6742852EC6C8D58504E' });
  const code2 = await client.getBytecode({ address: '0xCf77a3bA9A5ca399b7c97c749545344273801A9B' });
  console.log('Code length 0xcF66...:', code1 ? code1.length : 0);
  console.log('Code length 0xCf77...:', code2 ? code2.length : 0);
}
checkCode();
