"use client"

import { Header } from "@/components/layout/header"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

// Dynamically import WithdrawalStatusChecker with no SSR
const WithdrawalStatusChecker = dynamic(
  () => import("@/components/withdrawal-status-checker").then((mod) => ({ default: mod.WithdrawalStatusChecker })),
  {
    ssr: false,
    loading: () => (
      <div className="text-center py-8 text-muted-foreground">
        <p>Loading withdrawal status checker...</p>
      </div>
    ),
  },
)

export default function WithdrawalStatusPage() {
  const searchParams = useSearchParams()
  const [txHash, setTxHash] = useState<string | null>(null)
  const [key, setKey] = useState(0) // Add a key to force re-render

  useEffect(() => {
    // Get the hash from URL query parameter
    const hash = searchParams.get("hash")
    if (hash && hash !== txHash) {
      setTxHash(hash)
    }
  }, [searchParams, txHash])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-8">
          <h1 className="text-3xl font-bold tracking-tight">Withdrawal Status Checker</h1>
          <p className="text-muted-foreground">
            Check the status of any withdrawal transaction and track its progress through the withdrawal process.
          </p>

          {/* Use key to force re-render when hash changes */}
          <WithdrawalStatusChecker key={key} initialHash={txHash} />
        </div>
      </main>
    </div>
  )
}
