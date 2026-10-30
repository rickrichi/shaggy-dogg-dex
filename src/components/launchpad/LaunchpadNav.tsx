// src/components/launchpad/LaunchpadNav.tsx
import { Link, useLocation } from "react-router-dom";

import { Coins, Compass, Fuel, Rocket, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

export const LaunchpadNav = () => {
  const location = useLocation();

  const navItems = [
    {
      name: "Create Token",
      href: "/launchpad",
      icon: Rocket,
      description: "Deploy new tokens & lending vaults",
    },
    {
      name: "Explore Launches",
      href: "/launchpad/explore",
      icon: Compass,
      description: "Browse deployed ecosystem assets",
    },
    {
      name: "My Tokens",
      href: "/launchpad/my-tokens",
      icon: Coins,
      description: "Tokens created by your wallet",
    },
    {
      name: "Gas Paymaster",
      href: "/paymaster",
      icon: Fuel,
      description: "Sponsored Base portfolio operations and MRWD rewards",
    },
    {
      name: "Protocol Hub",
      href: "/protocol",
      icon: Sparkles,
      description: "Live contract custody & pool seeding",
      mobileOnly: true,
    },
    {
      name: "VIP Staking",
      href: "/stake",
      icon: ShieldCheck,
      description: "Fee discounts & single-sided staking",
      mobileOnly: true,
    },
    {
      name: "Arbitrage Studio",
      href: "/arbitrage/matrix",
      icon: Zap,
      description: "Triangular & Flash Loan Arbitrage",
      mobileOnly: true,
    },
  ];

  return (
    <nav
      aria-label="Token Studio"
      className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-purple-100 bg-white/70 p-2 shadow-sm backdrop-blur-md"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          location.pathname === item.href ||
          (item.href === "/launchpad" && location.pathname === "/create-token") ||
          (item.href === "/launchpad" &&
            /^\/launchpad\/(identity|purpose|liquidity|review)\/?$/.test(location.pathname)) ||
          (item.href === "/paymaster" &&
            (location.pathname === "/paymaster" || location.pathname === "/launchpad/paymaster")) ||
          (item.href.startsWith("/arbitrage") && location.pathname.startsWith("/arbitrage"));

        return (
          <Button
            key={item.name}
            asChild
            variant={isActive ? "default" : "ghost"}
            size="sm"
            className={
              (item.mobileOnly ? "md:hidden " : "") +
              (isActive
                ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 font-bold text-white shadow-sm hover:from-purple-700 hover:to-pink-700"
                : "font-semibold text-slate-600 hover:bg-purple-50 hover:text-purple-700")
            }
          >
            <Link to={item.href} aria-current={isActive ? "page" : undefined}>
              <Icon className="mr-1.5 size-4" />
              {item.name}
            </Link>
          </Button>
        );
      })}
    </nav>
  );
};
