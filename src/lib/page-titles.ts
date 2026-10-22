const pageNames: Record<string, string> = {
  "/": "Home",
  "/classic": "Classic Swap",
  "/swap/compare": "Compare Swaps",
  "/swap": "Swap",
  "/liquidity": "Liquidity",
  "/dex/setup": "DEX Setup",
  "/legacy/liquidity": "Legacy Liquidity",
  "/stake": "VIP Staking",
  "/launchpad": "Token Studio",
  "/launchpad/identity": "Token Identity · Token Studio",
  "/launchpad/purpose": "Purpose & Lending · Token Studio",
  "/launchpad/liquidity": "Multi-DEX Seeder · Token Studio",
  "/launchpad/review": "Review & Deploy · Token Studio",
  "/create-token": "Token Studio",
  "/launchpad/explore": "Explore Launches",
  "/launchpad/my-tokens": "My Tokens",
  "/protocol": "Protocol Hub",
  "/launchpad/manage": "Protocol Hub",
  "/markets": "Markets",
  "/market-data": "Market Data",
  "/portfolio": "Portfolio",
  "/activity": "Activity",
  "/admin": "Admin",
};

const arbitrageNames: Record<string, string> = {
  matrix: "Arbitrage Matrix",
  cedefi: "CeDeFi Arbitrage",
  autopilot: "Arbitrage Autopilot",
  triangular: "Triangular Arbitrage",
  dualpool: "Dual Pool Arbitrage",
  flashloan: "Flash Loan Arbitrage",
  live: "Live Desk",
  "live-desk": "Live Desk",
  console: "Arbitrage Console",
};

export function getPageTitle(pathname: string): string {
  const path = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  const arbitrage = path.match(/^\/(?:launchpad\/)?arbitrage(?:\/([^/]+))?(?:\/([^/]+))?$/);
  let name = pageNames[path] || "Page Not Found";
  if (arbitrage) {
    name = arbitrageNames[arbitrage[1] || "matrix"] || "Arbitrage";
    if (arbitrage[2]) name += ` · ${arbitrage[2].toUpperCase()}`;
  }
  return `${name} | Shaggy Mutt DEX`;
}
