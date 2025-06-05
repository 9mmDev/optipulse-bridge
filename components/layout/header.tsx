"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, WalletIcon, ArrowUpDown, ExternalLink, History, Search } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useTheme } from "next-themes"
import Link from "next/link"
import { NEXT_PUBLIC_L2_CHAIN_NAME } from "@/config/chains"
import dynamic from "next/dynamic"

// Dynamically import the wallet section with no SSR
const WalletSection = dynamic(() => import("./wallet-section"), {
  ssr: false,
  loading: () => (
    <Button disabled>
      <WalletIcon className="mr-2 h-4 w-4" />
      Loading...
    </Button>
  ),
})

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
              <ArrowUpDown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{NEXT_PUBLIC_L2_CHAIN_NAME} Bridge</h1>
              <p className="text-sm text-muted-foreground">Cross-chain asset transfer</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* App Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              {[
                { href: "/", label: "Bridge", icon: ArrowUpDown },
                { href: "/transactions", label: "Transactions", icon: History },
                { href: "/withdrawal-status", label: "Check Withdrawals", icon: Search },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center space-x-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <link.icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </nav>

            {/* External Links */}
            <nav className="hidden md:flex items-center space-x-6">
              {[
                {
                  href: process.env.NEXT_PUBLIC_L2_EXPLORER_URL || "https://testnet-explorer.optipulse.io",
                  label: "Explorer",
                  target: "_blank",
                },
                { href: "https://v3dev.9mm.pro/swap?chain=optipulse", label: "Dex", target: "_blank" },
              ].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  target={link.target}
                  className="flex items-center space-x-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{link.label}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ))}
            </nav>

            {/* Theme Toggle */}
            <div className="flex items-center space-x-2 rounded-lg border p-1">
              <SunIcon className="h-4 w-4 text-muted-foreground" />
              <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} size="sm" />
              <MoonIcon className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Wallet Section - Only render on client */}
            {mounted && <WalletSection />}
          </div>
        </div>
      </div>
    </header>
  )
}
