"use client"

import { Header } from "@/components/layout/header"
import dynamic from "next/dynamic"

// Dynamically import TransactionHistory with no SSR
const TransactionHistory = dynamic(
  () => import("@/components/transaction-history").then((mod) => ({ default: mod.TransactionHistory })),
  {
    ssr: false,
    loading: () => (
      <div className="text-center py-8 text-muted-foreground">
        <p>Loading transaction history...</p>
      </div>
    ),
  },
)

export default function TransactionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <h1 className="text-3xl font-bold tracking-tight">Transaction History</h1>
          <p className="text-muted-foreground">View your bridge transaction history across L1 and L2 networks.</p>

          <TransactionHistory />
        </div>
      </main>
    </div>
  )
}
