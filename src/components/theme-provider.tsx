// src/components/theme-provider.tsx
import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";

export type Theme = "light" | "dark" | "system";
export type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

/** Compatibility hook: exposes { theme, setTheme } with your Theme union */
export const useTheme = (): { theme: Theme; setTheme: (t: Theme) => void } => {
  const { theme, setTheme } = useNextTheme();
  return {
    theme: (theme as Theme) ?? "system",
    setTheme: setTheme as (t: Theme) => void,
  };
};

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme" // matches your previous localStorage key
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
