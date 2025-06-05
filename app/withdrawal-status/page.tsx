"use client"

import { Header } from "@/components/layout/header"
import dynamic from "next/dynamic"
import { Suspense } from "react"

// Dynamically import WithdrawalStatusChecker with no SSR
const WithdrawalStatusChecker = dynamic(() => import("@/components/withdrawal-status-checker").then(mod => ({ default: mod.WithdrawalStatusChecker })), {
  ssr: false,
  loading: () => (
    <div className="text-center py-8 text-muted-foreground">
      <p>Loading withdrawal status checker...</p>
    </div>
  ),
})

export default function WithdrawalStatusPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <h1 className="text-3xl font-bold tracking-tight">Withdrawal Status Checker</h1>
          <p className="text-muted-foreground">
            Check the status of any withdrawal transaction and track its progress through the withdrawal process.
          </p>

          <WithdrawalStatusChecker />
        </div>
      </main>
    </div>
  )
}
