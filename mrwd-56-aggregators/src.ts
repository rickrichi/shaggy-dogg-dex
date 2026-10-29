/**
 * Base MRWD/WETH aggregator audit. READ-ONLY.
 * No signing, swaps, approvals, staking, or API registration.
 * Target names are candidates, NOT 56 verified integrations.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { createPublicClient, fallback, formatUnits, http, getAddress, parseAbi, parseUnits } from 'viem';
import { base } from 'viem/chains';

const CHAIN = 8453;
const POOL = getAddress('0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5');
const WETH = getAddress('0x4200000000000000000000000000000000000006');
const MRWD = getAddress('0xC17227AAa33C54634B6cE7AD0bf33A156563c179');
const FACTORY = getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD');
const QUOTER_V2 = getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a');
const FROM = getAddress(process.env.QUOTE_ADDRESS || '0x0000000000000000000000000000000000000001');
const ABI = parseAbi([
 'function token0() view returns (address)', 'function token1() view returns (address)',
 'function fee() view returns (uint24)', 'function factory() view returns (address)',
 'function liquidity() view returns (uint128)',
 'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
]);
const tokenAbi = parseAbi(['function decimals() view returns (uint8)']);
const factoryAbi = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const quoterAbi = parseAbi([
 'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);
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

type Result = {name:string; status:'quote_returned'|'no_quote'|'api_error'|'requires_key'|'manual_review'; direction?:string; output?:string; detail?:string; exactPoolMatched?:boolean; testedAt:string};
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
async function quoteKyberSwap(sell:string,buy:string,amount:string) {
 const q = new URLSearchParams({tokenIn:sell,tokenOut:buy,amountIn:amount});
 const data = await fetchJson('https://aggregator-api.kyberswap.com/base/api/v1/routes?'+q.toString(),{headers:{'x-client-id':'shaggy-dogg-dex'}});
 const summary = data?.data?.routeSummary;
 const output = summary?.amountOut;
 if (!output || BigInt(output) === 0n) return {status:'no_quote',detail:'No KyberSwap routeSummary.amountOut'};
 const hop = summary?.route?.[0]?.[0];
 const routePool = String(hop?.pool || '');
 const exactPoolMatched = routePool.toLowerCase() === POOL.toLowerCase();
 return {
  status:'quote_returned',
  output:String(output),
  exactPoolMatched,
  detail:`KyberSwap exchange=${String(hop?.exchange||'unknown')} pool=${routePool||'unknown'}${exactPoolMatched?' (EXACT POOL MATCH)':''}`,
 };
}
async function quoteVelora(sell:string,buy:string,amount:string) {
 const q = new URLSearchParams({srcToken:sell,destToken:buy,amount,srcDecimals:'18',destDecimals:'18',side:'SELL',network:String(CHAIN)});
 const data = await fetchJson('https://api.paraswap.io/prices/?'+q.toString());
 const route = data?.priceRoute;
 const output = route?.destAmount;
 if (!output || BigInt(output) === 0n) return {status:'no_quote',detail:'No Velora/ParaSwap priceRoute.destAmount'};
 const swapEx = route?.bestRoute?.[0]?.swaps?.[0]?.swapExchanges?.[0];
 const pools:string[] = Array.isArray(swapEx?.poolAddresses) ? swapEx.poolAddresses : [];
 const exactPoolMatched = pools.some(p => String(p).toLowerCase() === POOL.toLowerCase());
 return {
  status:'quote_returned',
  output:String(output),
  exactPoolMatched,
  detail:`Velora/ParaSwap exchange=${String(swapEx?.exchange||'unknown')} pool=${pools[0]||'unknown'}${exactPoolMatched?' (EXACT POOL MATCH)':''}`,
 };
}
async function quoteUniswapAutoRouter(sell:string,buy:string,amount:string) {
 const { result } = await client.simulateContract({
  address: QUOTER_V2,
  abi: quoterAbi,
  functionName: 'quoteExactInputSingle',
  args: [{ tokenIn: getAddress(sell), tokenOut: getAddress(buy), amountIn: BigInt(amount), fee: 3000, sqrtPriceLimitX96: 0n }],
 });
 const amountOut = result[0];
 if (amountOut === 0n) return {status:'no_quote',detail:'Uniswap V3 QuoterV2 returned 0'};
 return {
  status:'quote_returned',
  output:amountOut.toString(),
  exactPoolMatched:true,
  detail:`Canonical Base Uniswap V3 QuoterV2 (${QUOTER_V2}) exact pool ${POOL} (EXACT POOL MATCH)`,
 };
}
async function quoteLifi(sell:string,buy:string,amount:string) {
 const q=new URLSearchParams({fromChain:String(CHAIN),toChain:String(CHAIN),fromToken:sell,toToken:buy,fromAmount:amount,fromAddress:FROM});
 const data=await fetchJson('https://li.quest/v1/quote?'+q.toString());
 const output=data.estimate?.toAmount;
 if (!output) return {status:'no_quote',detail:'No LI.FI estimate.toAmount'};
 return {status:'quote_returned',output:String(output),detail:`LI.FI tool=${String(data.tool||'unknown')}; quote does not establish selected pool`};
}
async function quoteRubic(sell:string,buy:string,amount:string) {
 const humanAmount = formatUnits(BigInt(amount), 18);
 const data = await fetchJson('https://api-v2.rubic.exchange/api/routes/quoteBest', {
  method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({srcTokenAddress:sell,srcTokenBlockchain:'BASE',srcTokenAmount:humanAmount,dstTokenAddress:buy,dstTokenBlockchain:'BASE',referrer:'rubic.exchange'}),
 });
 const dstTokenAmount = data?.estimate?.destinationTokenAmount;
 const dstWei = data?.estimate?.destinationWeiAmount;
 if (!dstWei && !dstTokenAmount) return {status:'no_quote',detail:'No Rubic destination amount'};
 const outStr = dstWei ? String(dstWei) : parseUnits(String(dstTokenAmount), 18).toString();
 if (BigInt(outStr) === 0n) return {status:'no_quote',detail:'Rubic returned 0 output'};
 return {status:'quote_returned',output:outStr,detail:`Rubic providerType=${String(data?.providerType||'unknown')}`};
}
async function quoteOdos(sell:string,buy:string,amount:string) {
 const data=await fetchJson('https://api.odos.xyz/sor/quote/v2', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chainId:CHAIN,inputTokens:[{tokenAddress:sell,amount}],outputTokens:[{tokenAddress:buy,proportion:1}],slippageLimitPercent:0.5,userAddr:FROM,compact:true})});
 const output=data.outAmounts?.[0];
 if (!output) return {status:'no_quote',detail:'No Odos outAmounts[0]'};
 return {status:'quote_returned',output:String(output),detail:'Odos route quote; not proof specific pool used'};
}
const adapters: Record<string, ((sell:string,buy:string,amount:string)=>Promise<any>) | undefined> = {
 '0x': quote0x,
 'KyberSwap': quoteKyberSwap,
 'Uniswap Auto Router': quoteUniswapAutoRouter,
 'Odos': quoteOdos,
 'LI.FI': quoteLifi,
 'Velora': quoteVelora,
 'Rubic': quoteRubic,
};
async function main() {
 const verification=await verify();
 console.log('Verified pool:',verification);
 console.log('The 56-target registry is a research/audit queue, not 56 connected routers.');
 const results:Result[]=[];
 const amountWeth=parseUnits(process.env.WETH_AMOUNT||'0.001',18).toString();
 const amountMrwd=parseUnits(process.env.MRWD_AMOUNT||'1',verification.mrwdDecimals).toString();
 for(const name of targets) {
  const adapter=adapters[name] ?? null;
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
 const report={generatedAt:now(),chainId:CHAIN,lpNftId:'6367926',verification,methodology:'7 active quote adapters (KyberSwap, Velora/ParaSwap, Uniswap Auto Router via QuoterV2, LI.FI, Rubic, 0x, Odos). KyberSwap, Velora/ParaSwap, and Uniswap QuoterV2 explicitly verify routing through pool 0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5.',results};
 await writeFile('report.json',JSON.stringify(report,null,2));
 const csv=['name,direction,status,output,exactPoolMatched,detail',...results.map(r=>[r.name,r.direction||'',r.status,r.output||'',r.exactPoolMatched===undefined?'':String(r.exactPoolMatched),r.detail||''].map(s=>'"'+s.replaceAll('"','""')+'"').join(','))].join('\n');
 await writeFile('report.csv',csv);
 console.table(results.map(({name,direction,status,output,exactPoolMatched})=>({name,direction,status,output,exactPoolMatched})));
 console.log('Saved report.json and report.csv');
}
main().catch(e=>{console.error('Audit stopped:',e);process.exitCode=1;});
