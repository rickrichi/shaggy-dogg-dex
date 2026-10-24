import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  Activity,
  ArrowLeftRight,
  CandlestickChart,
  ChevronDown,
  Droplets,
  LineChart,
  Menu,
  PieChart,
  Radio,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { WalletConnect } from "@/components/WalletConnect";
import { getPageTitle } from "@/lib/page-titles";

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Trade",
    items: [
      { name: "Swap", href: "/swap", icon: ArrowLeftRight },
      { name: "Liquidity", href: "/liquidity", icon: Droplets },
      { name: "Stake", href: "/stake", icon: ShieldCheck },
    ],
  },
  {
    label: "Markets",
    items: [
      { name: "Markets", href: "/markets", icon: CandlestickChart },
      { name: "Market Data", href: "/market-data", icon: LineChart },
      { name: "Arbitrage", href: "/arbitrage/matrix", icon: Zap },
      { name: "Live Desk", href: "/arbitrage/live-desk", icon: Radio },
    ],
  },
  {
    label: "Build",
    items: [
      { name: "Token Studio", href: "/launchpad", icon: Rocket },
      { name: "Protocol Hub", href: "/protocol", icon: Sparkles },
    ],
  },
  {
    label: "Account",
    items: [
      { name: "Portfolio", href: "/portfolio", icon: PieChart },
      { name: "Activity", href: "/activity", icon: Activity },
      { name: "Admin", href: "/admin", icon: Settings },
    ],
  },
];

// Shown in the desktop bar; the rest sit under "More".
const PRIMARY = ["Swap", "Liquidity", "Stake", "Markets", "Portfolio"];

const NavButton = ({ item, active }: { item: NavItem; active: boolean }) => {
  const Icon = item.icon;
  return (
    <Link to={item.href}>
      <Button
        variant={active ? "default" : "ghost"}
        size="sm"
        className={active ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white" : "hover:bg-purple-100"}
      >
        <Icon className="mr-2 size-4" />
        {item.name}
      </Button>
    </Link>
  );
};

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = getPageTitle(location.pathname);
    const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
    iconLinks.forEach((link) => {
      const base = link.href.split("?")[0];
      link.href = `${base}?v=sd2026`;
    });
  }, [location.pathname]);

  const onLiveDesk = location.pathname.startsWith("/arbitrage/live");
  const isActive = (item: NavItem) =>
    location.pathname === item.href ||
    (item.name === "Token Studio" &&
      /^\/launchpad\/(identity|purpose|liquidity|review)\/?$/.test(location.pathname)) ||
    (item.name === "Live Desk" && onLiveDesk) ||
    (item.name === "Arbitrage" && location.pathname.startsWith("/arbitrage") && !onLiveDesk);
  const moreActive = NAV_GROUPS.flatMap((g) => g.items)
    .filter((item) => !PRIMARY.includes(item.name))
    .some(isActive);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
      <header className="sticky top-0 z-40 border-b border-purple-100/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6 lg:flex-nowrap lg:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <img src="/amutt-logo-256.png" alt="" width={36} height={36} className="size-9 rounded-full shadow-sm" />
            <span className="whitespace-nowrap bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent">
              Shaggy Mutt
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-1 lg:flex" aria-label="Main">
            {NAV_GROUPS.flatMap((g) => g.items)
              .filter((item) => PRIMARY.includes(item.name))
              .map((item) => (
                <NavButton key={item.name} item={item} active={isActive(item)} />
              ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={moreActive ? "bg-purple-100 text-purple-800" : "hover:bg-purple-100"}
                >
                  More
                  <ChevronDown className="ml-1 size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {NAV_GROUPS.map((group, i) => {
                  const rest = group.items.filter((item) => !PRIMARY.includes(item.name));
                  if (rest.length === 0) return null;
                  return (
                    <div key={group.label}>
                      {i > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuLabel className="text-xs uppercase tracking-wide text-gray-500">
                        {group.label}
                      </DropdownMenuLabel>
                      {rest.map((item) => {
                        const Icon = item.icon;
                        return (
                          <DropdownMenuItem key={item.name} asChild>
                            <Link to={item.href} className={isActive(item) ? "font-semibold text-purple-700" : ""}>
                              <Icon className="mr-2 size-4" />
                              {item.name}
                            </Link>
                          </DropdownMenuItem>
                        );
                      })}
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="ml-auto lg:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <img src="/amutt-logo-256.png" alt="" className="size-7 rounded-full" />
                  Shaggy Mutt DEX
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-4 space-y-5" aria-label="Main">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{group.label}</p>
                    <div className="space-y-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onClick={() => setMenuOpen(false)}
                            className={`flex items-center rounded-lg px-3 py-2 text-sm ${
                              isActive(item)
                                ? "bg-gradient-to-r from-purple-600 to-pink-600 font-semibold text-white"
                                : "text-gray-700 hover:bg-purple-50"
                            }`}
                          >
                            <Icon className="mr-2.5 size-4" />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="flex w-full justify-end lg:w-auto lg:shrink-0">
            <WalletConnect />
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
