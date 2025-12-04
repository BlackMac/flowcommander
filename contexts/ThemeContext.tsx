"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type AppTheme = "light" | "dark" | "solarized-light" | "solarized-dark";

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  editorTheme: string;
  daisyTheme: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Map app themes to Monaco editor themes
const editorThemeMap: Record<AppTheme, string> = {
  light: "vs",
  dark: "vs-dark",
  "solarized-light": "solarized-light",
  "solarized-dark": "solarized-dark",
};

// Map app themes to DaisyUI themes
const daisyThemeMap: Record<AppTheme, string> = {
  light: "light",
  dark: "dark",
  "solarized-light": "light",
  "solarized-dark": "dark",
};

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<AppTheme>("light");
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("flowcommander-theme") as AppTheme | null;
    if (savedTheme && Object.keys(editorThemeMap).includes(savedTheme)) {
      setThemeState(savedTheme);
    }
    setMounted(true);
  }, []);

  // Save theme to localStorage when it changes
  const setTheme = (newTheme: AppTheme) => {
    setThemeState(newTheme);
    localStorage.setItem("flowcommander-theme", newTheme);
  };

  // Apply DaisyUI theme to document
  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute("data-theme", daisyThemeMap[theme]);
    }
  }, [theme, mounted]);

  const value: ThemeContextType = {
    theme,
    setTheme,
    editorTheme: editorThemeMap[theme],
    daisyTheme: daisyThemeMap[theme],
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
