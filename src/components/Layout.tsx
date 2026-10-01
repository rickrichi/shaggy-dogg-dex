import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { Activity, ArrowLeftRight, Droplets, PieChart, Rocket, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { WalletConnect } from "@/components/WalletConnect";

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const location = useLocation();

  const navigation = [
    { name: "Swap", href: "/swap", icon: ArrowLeftRight },
    { name: "Liquidity", href: "/liquidity", icon: Droplets },
    { name: "Launchpad", href: "/launchpad", icon: Rocket },
    { name: "Portfolio", href: "/portfolio", icon: PieChart },
    { name: "Activity", href: "/activity", icon: Activity },
    { name: "Admin", href: "/admin", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
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
                const isActive = location.pathname === item.href;
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
};
