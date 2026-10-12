import { type ReactNode, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  Activity,
  ArrowLeftRight,
  CandlestickChart,
  Droplets,
  LineChart,
  PieChart,
  Radio,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { WalletConnect } from "@/components/WalletConnect";
import { getPageTitle } from "@/lib/page-titles";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  useEffect(() => {
    document.title = getPageTitle(location.pathname);
    const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
    iconLinks.forEach((link) => {
      const base = link.href.split("?")[0];
      link.href = `${base}?v=sd2026`;
    });
  }, [location.pathname]);

  const navigation = [
    { name: "Swap", href: "/swap", icon: ArrowLeftRight },
    { name: "Liquidity", href: "/liquidity", icon: Droplets },
    { name: "Stake", href: "/stake", icon: ShieldCheck },
    { name: "Arbitrage", href: "/arbitrage/matrix", icon: Zap },
    { name: "Live Desk", href: "/arbitrage/live-desk", icon: Radio },
    { name: "Markets", href: "/markets", icon: CandlestickChart },
    { name: "Market Data", href: "/market-data", icon: LineChart },
    { name: "Token Studio", href: "/launchpad", icon: Rocket },
    { name: "Protocol Hub", href: "/protocol", icon: Sparkles },
    { name: "Portfolio", href: "/portfolio", icon: PieChart },
    { name: "Activity", href: "/activity", icon: Activity },
    { name: "Admin", href: "/admin", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      <header className="border-b border-white/20 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center space-x-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 to-pink-600">
                <span className="text-lg font-bold text-white">🐕</span>
              </div>
              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-xl font-bold text-transparent">
                Shaggy Mutt
              </span>
            </Link>

            <nav className="hidden space-x-1 md:flex">
              {navigation.map((item) => {
                const Icon = item.icon;
                const onLiveDesk = location.pathname.startsWith("/arbitrage/live");
                const isActive =
                  location.pathname === item.href ||
                  (item.name === "Token Studio" &&
                    /^\/launchpad\/(identity|purpose|liquidity|review)\/?$/.test(location.pathname)) ||
                  (item.name === "Live Desk" && onLiveDesk) ||
                  (item.name === "Arbitrage" &&
                    location.pathname.startsWith("/arbitrage") &&
                    !onLiveDesk);
                return (
                  <Link key={item.name} to={item.href}>
                    <Button
                      variant={isActive ? "default" : "ghost"}
                      size="sm"
                      className={
                        isActive
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                          : "hover:bg-purple-100"
                      }
                    >
                      <Icon className="mr-2 size-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </nav>

            <div className="min-w-[340px]">
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <footer className="mt-auto border-t border-purple-200/50 bg-white/75 py-6 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <div className="flex items-center space-x-2">
              <span className="text-lg">🐕</span>
              <span className="text-sm font-semibold text-gray-800">Shaggy Mutt DEX</span>
              <span className="text-xs text-gray-400">· Base Mainnet</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-gray-500">
              <a
                href="https://base.blockscout.com/token/0x051c758521971f5c5a84edaf18eea12854375469"
                target="_blank"
                rel="noreferrer"
                className="hover:text-purple-600 hover:underline"
              >
                SD Contract
              </a>
              <span>·</span>
              <a
                href="https://base.blockscout.com/token/0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7"
                target="_blank"
                rel="noreferrer"
                className="hover:text-purple-600 hover:underline"
              >
                AMUTT Contract
              </a>
              <span>·</span>
              <a
                href="https://basescan.org"
                target="_blank"
                rel="noreferrer"
                className="hover:text-purple-600 hover:underline"
              >
                BaseScan
              </a>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/80 p-3.5 text-xs leading-relaxed text-amber-900 shadow-xs">
            <p className="font-semibold text-amber-950">
              ⚠️ Disclaimer &amp; Risk Disclosure:
            </p>
            <p className="mt-1 text-[11px] text-amber-900/90">
              Shaggy Mutt DEX is an open-source, experimental decentralized interface for interacting
              with smart contracts on Base. Smart contracts are provided on an &ldquo;AS-IS&rdquo;
              basis without warranties of any kind and have not received an independent third-party audit.
              Trading, swapping, staking, and liquidity provision involve inherent financial risks,
              including impermanent loss, smart contract vulnerabilities, and total loss of capital.
              Token allocations and protocol rewards are variable, non-binding, and never guaranteed.
              Users assume full responsibility for all wallet interactions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
