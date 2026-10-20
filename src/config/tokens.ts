// src/config/tokens.ts
import { getV2WrappedNative } from "./contracts";

import type { Address } from "viem";

/** ————— Core token model (discriminated union) ————— */
export type NativeSentinel = "native";

export interface BaseToken {
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly logoURI?: string;
  readonly chainId: number;
}

export interface NativeToken extends BaseToken {
  readonly kind: "native";
  readonly address: NativeSentinel; // 'native'
}

export interface Erc20Token extends BaseToken {
  readonly kind: "erc20";
  readonly address: Address; // 0x-prefixed checksummed address
}

export type Token = NativeToken | Erc20Token;

/** ————— Type guards ————— */
export function isNativeToken(token: Token): token is NativeToken {
  return token.kind === "native";
}

export function isErc20Token(token: Token): token is Erc20Token {
  return token.kind === "erc20";
}

/** ————— Ethereum mainnet tokens —————
 * Tuple guarantees: at least two tokens so MAINNET_TOKENS[0..1] are Token (not Token | undefined)
 */
export const MAINNET_TOKENS = [
  {
    kind: "native",
    address: "native",
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, // USDC
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, // USDT
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, // DAI
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, // WBTC
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, // WETH
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    // Canonical Ethereum-mainnet deployment recorded by LUMIORO_MAINNET_RELEASE.
    address: "0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E" as Address,
    symbol: "LUMIORO",
    name: "LUMIORO Token",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x051c758521971f5c5a84edaf18eea12854375469" as Address,
    symbol: "SD",
    name: "Shaggy Dogg",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x051c758521971f5c5a84edaf18eea12854375469.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7" as Address,
    symbol: "AMUTT",
    name: "Astro Mutt",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    logoURI: "https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xD31a59c85aE9D8edEFeC411D448f90841571b89c" as Address,
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoURI: "https://assets.coingecko.com/coins/images/22876/thumb/SOL_wh_small.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x418D75f65a02b3D53B2418FB8E1fe493759c7605" as Address,
    symbol: "BNB",
    name: "Wrapped BNB",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/22884/thumb/BNB_wh_small.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x50327c6c5a14DCaDE707ABad2E27eB517df87AB5" as Address,
    symbol: "TRX",
    name: "TRON",
    decimals: 6,
    logoURI: "https://ethereum-optimism.github.io/data/TRX/logo.svg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x85F17Cf997934a597031b2E18a9aB6ebD4B9f6a4" as Address,
    symbol: "NEAR",
    name: "NEAR Protocol",
    decimals: 24,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA" as Address,
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x00f3C42833C3170159af4E92dbb451Fb3F708917" as Address,
    symbol: "ICP",
    name: "Internet Computer",
    decimals: 8,
    logoURI: "https://assets.coingecko.com/coins/images/14495/thumb/Internet_Computer_logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30" as Address,
    symbol: "INJ",
    name: "Injective",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12882/thumb/Secondary_Symbol.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x4E15361FD6b4BB609Fa63C81A2be19d873717870" as Address,
    symbol: "FTM",
    name: "Fantom",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/4001/thumb/Fantom.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address,
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
    logoURI: "https://ethereum-optimism.github.io/data/UNI/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9" as Address,
    symbol: "AAVE",
    name: "Aave",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2" as Address,
    symbol: "MKR",
    name: "Maker",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" as Address,
    symbol: "LDO",
    name: "Lido DAO",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13573/thumb/Lido_DAO.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xD533a949740bb3306d119CC777fa900bA034cd52" as Address,
    symbol: "CRV",
    name: "Curve DAO",
    decimals: 18,
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xc00e94Cb662C3520282E6f5717214004A7f26888" as Address,
    symbol: "COMP",
    name: "Compound",
    decimals: 18,
    logoURI: "https://ethereum-optimism.github.io/data/COMP/logo.svg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F" as Address,
    symbol: "SNX",
    name: "Synthetix",
    decimals: 18,
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x3155BA85D5F96b2d030a4966AF206230e46849cb" as Address,
    symbol: "RUNE",
    name: "THORChain",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898" as Address,
    symbol: "CAKE",
    name: "PancakeSwap",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x57e114B691Db790C35207b2e685D4A43181e6061" as Address,
    symbol: "ENA",
    name: "Ethena",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/36530/standard/ethena.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x56072C95FAA701256059aa122697B133aDEd9279" as Address,
    symbol: "SKY",
    name: "Sky",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/39925/large/sky.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x54D2252757e1672EEaD234D27B1270728fF90581" as Address,
    symbol: "BGB",
    name: "Bitget Token",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/11610/thumb/Bitget_logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x75231F58b43240C9718Dd58B4967c5114342a86c" as Address,
    symbol: "OKB",
    name: "OKB",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xf34960d9d60be18cC1D5Afc1A6F012A723a28811" as Address,
    symbol: "KCS",
    name: "KuCoin Token",
    decimals: 6,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e" as Address,
    symbol: "YFI",
    name: "yearn.finance",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/11849/thumb/yfi-192x192.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x111111111117dC0aa78b770fA6A738034120C302" as Address,
    symbol: "1INCH",
    name: "1inch Network",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13469/thumb/1inch-token.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0" as Address,
    symbol: "FXS",
    name: "Frax Share",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13423/thumb/frax_share.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x92D6C1e31e14520e676a687F0a93788B716BEff5" as Address,
    symbol: "DYDX",
    name: "dYdX",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/17500/thumb/hjnIm9bV.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xD33526068D116cE69F19A9ee46F0bd304F21A51f" as Address,
    symbol: "RPL",
    name: "Rocket Pool",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1" as Address,
    symbol: "ARB",
    name: "Arbitrum",
    decimals: 18,
    logoURI: "https://arbitrum.foundation/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0" as Address,
    symbol: "MATIC",
    name: "Polygon (MATIC)",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/4713/thumb/matic-token-icon.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6" as Address,
    symbol: "POL",
    name: "Polygon (POL)",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x3c3a81e81dc49A522A592e7622A7E711c06bf354" as Address,
    symbol: "MNT",
    name: "Mantle",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF" as Address,
    symbol: "IMX",
    name: "Immutable",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/17233/thumb/imx.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766" as Address,
    symbol: "STRK",
    name: "Starknet",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/26433/standard/starknet.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x9E32b13ce7f2E80A01932B42553652E053D6ed8e" as Address,
    symbol: "METIS",
    name: "Metis",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/15595/thumb/metis.jpeg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD" as Address,
    symbol: "LRC",
    name: "Loopring",
    decimals: 18,
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD/logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7" as Address,
    symbol: "GRT",
    name: "The Graph",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13397/thumb/Graph_Token.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x4a220E6096B25EADb88358cb44068A3248254675" as Address,
    symbol: "QNT",
    name: "Quant",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/3370/thumb/5ZOu7brX_400x400.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4" as Address,
    symbol: "ANKR",
    name: "Ankr",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/4324/thumb/U85xTl2.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x58b6A8A3302369DAEc383334672404Ee733aB239" as Address,
    symbol: "LPT",
    name: "Livepeer",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/7137/thumb/logo-circle-green.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x163f8C2467924be0ae7B5347228CABF260318753" as Address,
    symbol: "WLD",
    name: "Worldcoin",
    decimals: 18,
    logoURI: "https://ethereum-optimism.github.io/data/WLD/logo.svg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x77E06c9eCCf2E797fd462A92B6D7642EF85b0A44" as Address,
    symbol: "TAO",
    name: "Wrapped TAO (Bittensor)",
    decimals: 9,
    logoURI: "https://assets.coingecko.com/coins/images/29087/thumb/wtao.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85" as Address,
    symbol: "FET",
    name: "Artificial Superintelligence Alliance",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/5681/thumb/Fetch.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24" as Address,
    symbol: "RNDR",
    name: "Render Network",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/11636/thumb/rndr.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429" as Address,
    symbol: "GLM",
    name: "Golem",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/542/thumb/Golem_Submark_Positive_RGB.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3" as Address,
    symbol: "ONDO",
    name: "Ondo Finance",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/26580/standard/ONDO.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x68749665FF8D2d112Fa859AA293F07A622782F38" as Address,
    symbol: "XAUT",
    name: "Tether Gold",
    decimals: 6,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address,
    symbol: "PAXG",
    name: "PAX Gold",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/9519/thumb/paxg.PNG",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xdA5e1988097297dCdc1f90D4dFE7909e847CBeF6" as Address,
    symbol: "WLFI",
    name: "World Liberty Financial",
    decimals: 18,
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x62D0A8458eD7719FDAF978fe5929C6D342B0bFcE" as Address,
    symbol: "BEAM",
    name: "Beam",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/32417/standard/chain-logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0" as Address,
    symbol: "SAND",
    name: "The Sandbox",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12129/thumb/sandbox_logo.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942" as Address,
    symbol: "MANA",
    name: "Decentraland",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/878/thumb/decentraland-mana.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xd1d2Eb1B1e90B638588728b4130137D262C87cae" as Address,
    symbol: "GALA",
    name: "Gala Games",
    decimals: 8,
    logoURI: "https://assets.coingecko.com/coins/images/12493/standard/GALA-COINGECKO.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b" as Address,
    symbol: "AXS",
    name: "Axie Infinity",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13029/thumb/axie_infinity_logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381" as Address,
    symbol: "APE",
    name: "ApeCoin",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/24383/small/apecoin.jpg",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c" as Address,
    symbol: "ENJ",
    name: "Enjin Coin",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/1102/thumb/enjin-coin-logo.png",
    chainId: 1,
  },
  {
    kind: "erc20",
    address: "0x3506424F91fD33084466F402d5D97f05F8e3b4AF" as Address,
    symbol: "CHZ",
    name: "Chiliz",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/8834/thumb/Chiliz.png",
    chainId: 1,
  },
] as const satisfies readonly [Token, Token, ...Token[]];

export const BASE_MAINNET_TOKENS = [
  {
    kind: "native",
    address: "native",
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7" as Address,
    symbol: "AMUTT",
    name: "Astro Mutt",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x051c758521971f5c5a84edaf18eea12854375469" as Address,
    symbol: "SD",
    name: "Shaggy Dogg",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x4200000000000000000000000000000000000006" as Address,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as Address,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address,
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    logoURI: "https://tokens.1inch.io/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb" as Address,
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    logoURI: "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as Address,
    symbol: "AERO",
    name: "Aerodrome",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x532f27101965dd16442E59d40670FaF5eBB142E4" as Address,
    symbol: "BRETT",
    name: "Brett",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed" as Address,
    symbol: "DEGEN",
    name: "Degen",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4" as Address,
    symbol: "TOSHI",
    name: "Toshi",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b" as Address,
    symbol: "VIRTUAL",
    name: "Virtual Protocol",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196" as Address,
    symbol: "LINK",
    name: "ChainLink Token",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x22e6966B799c4D5B13BE962E1D117b56327FDa66" as Address,
    symbol: "SNX",
    name: "Synthetix Network Token",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xb8f3d5143ffddb99688bb31e7c2c3894a1e17263" as Address,
    symbol: "FBA",
    name: "FBA Token",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55" as Address,
    symbol: "uSOL",
    name: "Solana (Universal)",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/39987/thumb/UA-SOL_1.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xcb585250f852C6c6bf90434AB21A00f02833a4af" as Address,
    symbol: "cbXRP",
    name: "Coinbase Wrapped XRP",
    decimals: 6,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xcbADA732173e39521CDBE8bf59a6Dc85A9fc7b8c" as Address,
    symbol: "cbADA",
    name: "Coinbase Wrapped ADA",
    decimals: 6,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xd6a34b430C05ac78c24985f8abEE2616BC1788Cb" as Address,
    symbol: "uAVAX",
    name: "Avalanche (Universal)",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/66473/thumb/UA-AVAX.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x5ed25E305E08F58AFD7995EaC72563E6BE65A617" as Address,
    symbol: "uNEAR",
    name: "NEAR (Universal)",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/50645/thumb/UA-NEAR_1.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x6e934283DaE5D5D1831cbE8d557c44c9B83F30Ee" as Address,
    symbol: "uATOM",
    name: "Cosmos (Universal)",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/54702/thumb/UA-ATOM.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x00f3C42833C3170159af4E92dbb451Fb3F708917" as Address,
    symbol: "ICP",
    name: "Internet Computer",
    decimals: 8,
    logoURI: "https://assets.coingecko.com/coins/images/14495/thumb/Internet_Computer_logo.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x2416092f143378750bb29b79eD961ab195CcEea5" as Address,
    symbol: "uZEC",
    name: "Zcash (Universal)",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83" as Address,
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
    logoURI: "https://ethereum-optimism.github.io/data/UNI/logo.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x63706e401c06ac8513145b7687A14804d17f814b" as Address,
    symbol: "AAVE",
    name: "Aave",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/12645/thumb/AAVE.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x8Ee73c484A26e0A5df2Ee2a4960B789967dd0415" as Address,
    symbol: "CRV",
    name: "Curve DAO",
    decimals: 18,
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0x9e1028F5F1D5eDE59748FFceE5532509976840E0" as Address,
    symbol: "COMP",
    name: "Compound",
    decimals: 18,
    logoURI: "https://ethereum-optimism.github.io/data/COMP/logo.svg",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE" as Address,
    symbol: "1INCH",
    name: "1inch Network",
    decimals: 18,
    logoURI: "https://assets.coingecko.com/coins/images/13469/thumb/1inch-token.png",
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xf3081494B87e8D5fb7960f066E931D1D0e6E3d67" as Address,
    symbol: "TAO",
    name: "Bittensor",
    decimals: 18,
    chainId: 8453,
  },
  {
    kind: "erc20",
    address: "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf" as Address,
    symbol: "VVV",
    name: "Venice Token",
    decimals: 18,
    chainId: 8453,
  },
] as const satisfies readonly [Token, Token, ...Token[]];

/* ————— Arbitrum, Optimism, Polygon and Sepolia —————
 * Addresses from Circle's USDC list, Uniswap's default token list and the
 * chains' Uniswap V2 routers (WETH()), checked 2026-10-20.
 */
const ETH_LOGO = "https://tokens.1inch.io/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.png";
const WETH_LOGO = "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png";
const USDC_LOGO = "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png";
const USDT_LOGO = "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png";

export const ARBITRUM_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 42161 },
  { kind: "erc20", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 42161 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const OPTIMISM_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 10 },
  { kind: "erc20", address: "0x4200000000000000000000000000000000000006" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 10 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const POLYGON_TOKENS = [
  { kind: "native", address: "native", symbol: "POL", name: "POL", decimals: 18, chainId: 137 },
  { kind: "erc20", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address, symbol: "USDC", name: "USD Coin", decimals: 6, logoURI: USDC_LOGO, chainId: 137 },
  { kind: "erc20", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as Address, symbol: "USDT", name: "Tether USD", decimals: 6, logoURI: USDT_LOGO, chainId: 137 },
  { kind: "erc20", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" as Address, symbol: "WPOL", name: "Wrapped POL", decimals: 18, chainId: 137 },
] as const satisfies readonly [Token, Token, ...Token[]];

export const SEPOLIA_TOKENS = [
  { kind: "native", address: "native", symbol: "ETH", name: "Sepolia Ether", decimals: 18, logoURI: ETH_LOGO, chainId: 11155111 },
  { kind: "erc20", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address, symbol: "USDC", name: "USD Coin (test)", decimals: 6, logoURI: USDC_LOGO, chainId: 11155111 },
  { kind: "erc20", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address, symbol: "WETH", name: "Wrapped Ether", decimals: 18, logoURI: WETH_LOGO, chainId: 11155111 },
] as const satisfies readonly [Token, Token, ...Token[]];

export function getTokensForChain(chainId?: number): readonly [Token, Token, ...Token[]] {
  switch (chainId) {
    case 8453:
      return BASE_MAINNET_TOKENS;
    case 42161:
      return ARBITRUM_TOKENS;
    case 10:
      return OPTIMISM_TOKENS;
    case 137:
      return POLYGON_TOKENS;
    case 11155111:
      return SEPOLIA_TOKENS;
    default:
      return MAINNET_TOKENS;
  }
}

/** Literal union of known symbols inferred from MAINNET_TOKENS */
export type TokenSymbol = (typeof MAINNET_TOKENS)[number]["symbol"];

/** ————— Helpers (type-safe, no `any`) ————— */
export function getTokenByAddress(address: Address | NativeSentinel): Token | undefined {
  if (address === "native") {
    // Single equality branch avoids unsafe toString() on discriminated data
    return MAINNET_TOKENS.find((t) => t.kind === "native" && t.address === "native");
  }
  const needle = address.toLowerCase();
  return MAINNET_TOKENS.find((t) => t.kind === "erc20" && t.address.toLowerCase() === needle);
}

export function getTokenBySymbol(symbol: string): Token | undefined {
  const needle = symbol.toUpperCase();
  return MAINNET_TOKENS.find((t) => t.symbol.toUpperCase() === needle);
}

/** Overload for stricter callers who know the symbol is from our list */
export function getTokenByKnownSymbol<S extends TokenSymbol>(
  symbol: S
): Extract<Token, { symbol: S }> {
  const token = MAINNET_TOKENS.find((t) => t.symbol === symbol);
  if (!token) {
    // This should be unreachable if S is constrained to TokenSymbol
    throw new Error(`Unknown token symbol: ${symbol as string}`);
  }
  return token as Extract<Token, { symbol: S }>;
}

/** ————— Default token pairs (fully typed from known symbols) ————— */
export const DEFAULT_TOKEN_PAIRS: ReadonlyArray<{
  readonly from: TokenSymbol;
  readonly to: TokenSymbol;
}> = [
  { from: "ETH", to: "USDC" },
  { from: "ETH", to: "USDT" },
  { from: "USDC", to: "DAI" },
  { from: "WBTC", to: "ETH" },
  { from: "ETH", to: "LUMIORO" },
  { from: "ETH", to: "SD" },
  { from: "ETH", to: "AMUTT" },
] as const;

/** ————— Canonical wrapped native (WETH) ————— */
const wrappedNative = MAINNET_TOKENS.find(
  (token) => token.symbol === "WETH" && token.kind === "erc20"
);

if (!wrappedNative || wrappedNative.kind !== "erc20") {
  throw new Error("WETH token configuration is required for swap routing.");
}

export const WRAPPED_NATIVE_ADDRESS: Address = wrappedNative.address;

/** The chain's wrapped native token, as its Uniswap V2 router uses it. */
export function getWrappedNativeAddress(chainId?: number): Address {
  return getV2WrappedNative(chainId);
}
