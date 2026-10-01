// src/components/launchpad/LaunchpadNav.tsx
import { Link, useLocation } from "react-router-dom";

import { Coins, Compass, Rocket, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

export const LaunchpadNav = () => {
  const location = useLocation();

  const navItems = [
    {
      name: "Token Studio",
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
      name: "Protocol Hub",
      href: "/protocol",
      icon: Sparkles,
      description: "Live contract custody & pool seeding",
    },
    {
      name: "VIP Staking",
      href: "/stake",
      icon: ShieldCheck,
      description: "Fee discounts & single-sided staking",
    },
    {
      name: "Arbitrage Studio",
      href: "/arbitrage",
      icon: Zap,
      description: "Triangular & Flash Loan Arbitrage",
    },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-purple-100 bg-white/70 p-2 shadow-sm backdrop-blur-md">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          location.pathname === item.href ||
          (item.href === "/launchpad" && location.pathname === "/create-token");

        return (
          <Link key={item.name} to={item.href}>
            <Button
              variant={isActive ? "default" : "ghost"}
              size="sm"
              className={
                isActive
                  ? "bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 font-bold text-white shadow-sm hover:from-purple-700 hover:to-pink-700"
                  : "font-semibold text-slate-600 hover:bg-purple-50 hover:text-purple-700"
              }
            >
              <Icon className="mr-1.5 size-4" />
              {item.name}
            </Button>
          </Link>
        );
      })}
    </div>
  );
};
