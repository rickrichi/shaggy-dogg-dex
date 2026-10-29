/**
 * Base MRWD/WETH aggregator audit. READ-ONLY.
 * No signing, swaps, approvals, staking, or API registration.
 * Target names are candidates, NOT 56 verified integrations.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createPublicClient, fallback, http, getAddress, parseAbi, parseUnits } from 'viem';
import { base } from 'viem/chains';

const CHAIN = 8453;
const POOL = getAddress('0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5');
const WETH = getAddress('0x4200000000000000000000000000000000000006');
const MRWD = getAddress('0xC17227AAa33C54634B6cE7AD0bf33A156563c179');
const FACTORY = getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD');
const FROM = getAddress(process.env.QUOTE_ADDRESS || '0x0000000000000000000000000000000000000001');
const ABI = parseAbi([
 'function token0() view returns (address)', 'function token1() view returns (address)',
 'function fee() view returns (uint24)', 'function factory() view returns (address)',
 'function liquidity() view returns (uint128)',
 'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
]);
const tokenAbi = parseAbi(['function decimals() view returns (uint8)']);
const factoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const rpcUrls = [
 process.env.BASE_RPC_URL,
 'https://base-rpc.publicnode.com',
 'https://1rpc.io/base',
 'https://mainnet.base.org',
].filter((url,index,urls):url is string => Boolean(url) && urls.indexOf(url)===index);
const client = createPublicClient({
 chain:base,
 transport:fallback(rpcUrls.map(url=>http(url,{timeout:12000,retryCount:1})),{rank:false}),
});

type Result = {name:string; status:'quote_returned'|'no_quote'|'api_error'|'requires_key'|'manual_review'; direction?:string; output?:string; detail?:string; testedAt:string};
const targets = [
 '0x','1inch','KyberSwap','OKX DEX','Uniswap Auto Router','Odos','LI.FI','CoW Swap','Velora','Bebop',
 'Sushi','DODO X','OpenOcean','Rango','Jumper','Matcha','LlamaSwap','Rubic','Symbiosis','Transit Swap',
 'RocketX','Fibrous Finance','DZap','ShapeShift','Swoop Exchange','Interport','Chainspot','ButterSwap','SwapBox','Nordstern Finance',
 'OneKey Swap','Bitget Wallet Swap','Ave.ai','Portal Swaps','SODA Exchange','Kana Labs','Onchain.cc','Instadapp','DeFi App','Bungee',
 'Enso','MetaMask Swaps','Zerion','Binance Wallet','PancakeSwap Router','Oku','vfat','Gate DEX','Alien Base','Unizen',
 'Houdini Swap','Swing','Haiku','GlueX','Aperture Finance','Jeton'
] as const;
if (targets.length !== 56 || new Set(targets).size !== 56) throw Error('Registry must contain 56 distinct candidates');
const now = () => new Date().toISOString();
const pause = (ms:number) => new Promise(r => setTimeout(r,ms));
async function fetchJson(url:string, options:RequestInit = {}) {
 const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
 const body = await res.text();
 let parsed:unknown;
 try {parsed = JSON.parse(body);} catch {parsed = {message:body.slice(0,160)};}
 if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(parsed).slice(0,200)}`);
 return parsed as Record<string,any>;
}
async function verify() {
 const code = await client.getCode({address:POOL});
 if (!code || code === '0x') throw Error('Pool address has no contract code');
 const blockNumber = await client.getBlockNumber();
 const opts = {address:POOL,abi:ABI,blockNumber} as const;
 const [t0,t1,fee,factory,liquidity,slot0,decimals] = await Promise.all([
  client.readContract({...opts,functionName:'token0'}), client.readContract({...opts,functionName:'token1'}),
  client.readContract({...opts,functionName:'fee'}), client.readContract({...opts,functionName:'factory'}),
  client.readContract({...opts,functionName:'liquidity'}), client.readContract({...opts,functionName:'slot0'}),
  client.readContract({address:MRWD,abi:tokenAbi,functionName:'decimals',blockNumber})
 ]);
 if(getAddress(t0)!==WETH || getAddress(t1)!==MRWD || fee!==3000) throw Error('Pool token or fee mismatch — stopping');
 let canonical = false;
 if(getAddress(factory)===FACTORY) {
  const lookup = await client.readContract({address:FACTORY,abi:factoryAbi,functionName:'getPool',args:[WETH,MRWD,3000],blockNumber});
  canonical = getAddress(lookup)===POOL;
 }
 return {blockNumber:blockNumber.toString(), pool:POOL, weth:WETH,mrwd:MRWD,fee, factory,canonicalUniswapV3:canonical,activeLiquidityRaw:liquidity.toString(),tick:slot0[1],mrwdDecimals:decimals};
}
async function quote0x(sell:string,buy:string,amount:string) {
 const key=process.env.ZEROX_API_KEY;
 if (!key) return {status:'requires_key',detail:'Set ZEROX_API_KEY; API key required'};
 const q = new URLSearchParams({chainId:String(CHAIN),sellToken:sell,buyToken:buy,sellAmount:amount});
 const data=await fetchJson('https://api.0x.org/swap/allowance-holder/price?'+q.toString(),{headers:{'0x-api-key':key,'0x-version':'v2'}});
 if (!data.buyAmount || data.liquidityAvailable === false) return {status:'no_quote',detail:'No usable buyAmount/liquidity'};
 return {status:'quote_returned',output:String(data.buyAmount),detail:'Indicative 0x quote; not proof this specific pool was used'};
}
async function quoteLifi(sell:string,buy:string,amount:string) {
 const q=new URLSearchParams({fromChain:String(CHAIN),toChain:String(CHAIN),fromToken:sell,toToken:buy,fromAmount:amount,fromAddress:FROM});
 const data=await fetchJson('https://li.quest/v1/quote?'+q.toString());
 const output=data.estimate?.toAmount;
 if (!output) return {status:'no_quote',detail:'No LI.FI estimate.toAmount'};
 return {status:'quote_returned',output:String(output),detail:`LI.FI tool=${String(data.tool||'unknown')}; quote does not establish selected pool`};
}
async function quoteOdos(sell:string,buy:string,amount:string) {
 const data=await fetchJson('https://api.odos.xyz/sor/quote/v2', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chainId:CHAIN,inputTokens:[{tokenAddress:sell,amount}],outputTokens:[{tokenAddress:buy,proportion:1}],slippageLimitPercent:0.5,userAddr:FROM,compact:true})});
 const output=data.outAmounts?.[0];
 if (!output) return {status:'no_quote',detail:'No Odos outAmounts[0]'};
 return {status:'quote_returned',output:String(output),detail:'Odos route quote; not proof specific pool used'};
}
async function main() {
 const verification=await verify();
 console.log('Verified pool:',verification);
 console.log('The 56-target registry is a research/audit queue, not 56 connected routers.');
 const results:Result[]=[];
 const amountWeth=parseUnits(process.env.WETH_AMOUNT||'0.001',18).toString();
 const amountMrwd=parseUnits(process.env.MRWD_AMOUNT||'1',verification.mrwdDecimals).toString();
 for(const name of targets) {
  const adapter=name==='0x'?quote0x:name==='LI.FI'?quoteLifi:name==='Odos'?quoteOdos:null;
  if(!adapter) {results.push({name,status:'manual_review',detail:'No implemented, verified public quote/registration adapter; research provider API/partner terms',testedAt:now()});continue;}
  for(const [direction,sell,buy,amount] of [['WETH->MRWD',WETH,MRWD,amountWeth],['MRWD->WETH',MRWD,WETH,amountMrwd]] as const) {
   try {
    const r=await adapter(sell,buy,amount);
    results.push({name,direction,...r,testedAt:now()} as Result);
   } catch(e) {
    results.push({name,direction,status:'api_error',detail:String(e).slice(0,350),testedAt:now()});
   }
   await pause(400);
  }
 }
 const report={generatedAt:now(),chainId:CHAIN,lpNftId:'6367926',verification,methodology:'Only 0x, LI.FI, Odos have active API adapters. Other entries are prospects requiring independent verification. Quote != pool routing or registration.',results};
 await writeFile('report.json',JSON.stringify(report,null,2));
 const csv=['name,direction,status,output,detail',...results.map(r=>[r.name,r.direction||'',r.status,r.output||'',r.detail||''].map(s=>'"'+s.replaceAll('"','""')+'"').join(','))].join('\n');
 await writeFile('report.csv',csv);
 console.table(results.map(({name,direction,status,output})=>({name,direction,status,output})));
 console.log('Saved report.json and report.csv');
}
main().catch(e=>{console.error('Audit stopped:',e);process.exitCode=1;});
