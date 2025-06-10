"use client"

import React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ExternalLink, RefreshCw, ArrowUpRight, ArrowDownLeft, AlertCircle, Clock } from "lucide-react"
import { useAccount } from "wagmi"
import { truncateAddress } from "@/lib/utils"
import { db } from "@/store/db"
import {
  NEXT_PUBLIC_L1_CHAIN_NAME,
  NEXT_PUBLIC_L2_CHAIN_NAME,
  NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
  NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY,
  NEXT_PUBLIC_L2_EXPLORER_URL,
} from "@/config/chains"
import { useBlockchainTransactions } from "@/hooks/use-blockchain-transactions"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { useRouter } from "next/navigation"

interface LocalTransaction {
  id: string
  hash: string
  type: "deposit" | "withdraw"
  amount: string
  status: "pending" | "completed" | "failed"
  timestamp: Date
  fromChain: string
  toChain: string
  explorerUrl: string
  source?: string
  withdrawStatus?: string
}

// Helper function to construct proper explorer URLs
const buildExplorerUrl = (baseUrl: string, txHash: string): string => {
  // Remove trailing slashes from base URL
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "")
  // Ensure we have a single slash before the path
  return `${cleanBaseUrl}/tx/${txHash}`
}

export function TransactionHistory() {
  const [localWithdrawals, setLocalWithdrawals] = useState<LocalTransaction[]>([])
  const [activeTab, setActiveTab] = useState("deposits")
  const { address, isConnected } = useAccount()
  const {
    depositTransactions,
    withdrawTransactions,
    isLoadingDeposits,
    isLoadingWithdraws,
    depositError,
    withdrawError,
    syncProgress,
    blockRanges,
    refetchDeposits,
    refetchWithdraws,
  } = useBlockchainTransactions()

  const router = useRouter()

  const fetchLocalWithdrawals = async () => {
    if (!address || !isConnected) return

    try {
      // Get stored withdrawals from local DB
      const withdrawals = await db.withdraws.where("address").equals(address.toLowerCase()).toArray()

      // Convert withdrawals to transaction format
      const localTxs = withdrawals.map((w) => ({
        id: w.withdrawalHash || "",
        hash: w.withdrawalHash || "",
        type: "withdraw" as const,
        amount: w.args?.request?.value ? (Number(w.args.request.value) / 1e18).toString() : "0",
        status: w.status === "finalized" ? "completed" : "pending",
        timestamp: w.createdAt,
        fromChain: NEXT_PUBLIC_L2_CHAIN_NAME,
        toChain: NEXT_PUBLIC_L1_CHAIN_NAME,
        explorerUrl: buildExplorerUrl(NEXT_PUBLIC_L2_EXPLORER_URL, w.withdrawalHash || ""),
        source: "local",
        withdrawStatus: w.status,
      }))

      setLocalWithdrawals(localTxs)
    } catch (error) {
      console.error("Error fetching local withdrawals:", error)
      setLocalWithdrawals([])
    }
  }

  useEffect(() => {
    if (isConnected && address) {
      fetchLocalWithdrawals()
    } else {
      setLocalWithdrawals([])
    }
  }, [address, isConnected])

  // Combine blockchain and local withdrawals, removing duplicates
  const combinedWithdrawals = React.useMemo(() => {
    try {
      const combined = [...withdrawTransactions]

      // Add local withdrawals that aren't already in blockchain withdrawals
      localWithdrawals.forEach((localTx) => {
        const exists = withdrawTransactions.some(
          (blockchainTx) => blockchainTx.hash.toLowerCase() === localTx.hash.toLowerCase(),
        )
        if (!exists && localTx.hash) {
          combined.push(localTx)
        }
      })

      return combined.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    } catch (error) {
      console.error("Error combining withdrawals:", error)
      return []
    }
  }, [withdrawTransactions, localWithdrawals])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
    }
  }

  const formatTimestamp = (timestamp: Date) => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(timestamp)
    } catch (error) {
      console.error("Error formatting timestamp:", error)
      return "Invalid date"
    }
  }

  const formatBlockCount = (blocks: bigint) => {
    const num = Number(blocks)
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`
    }
    return num.toString()
  }

  const handleRefresh = () => {
    try {
      if (activeTab === "deposits") {
        refetchDeposits()
      } else {
        refetchWithdraws()
        fetchLocalWithdrawals()
      }
    } catch (error) {
      console.error("Error refreshing transactions:", error)
    }
  }

  const renderSyncProgress = (progress: number) => {
    if (progress <= 0 || progress >= 100) return null

    return (
      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Syncing blockchain data...</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-1" />
      </div>
    )
  }

  const renderTransactionList = (
    transactions: LocalTransaction[],
    isLoading: boolean,
    error: string | null,
    progress: number,
  ) => {
    if (error) {
      return (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">Failed to load transactions</p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )
    }

    // Show progress bar if syncing
    if (progress > 0 && progress < 100) {
      return (
        <>
          {renderSyncProgress(progress)}
          <div className="text-center py-8 text-muted-foreground">
            <div className="space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
              <p>Syncing blockchain data... {Math.round(progress)}% complete</p>
              <p className="text-xs">Scanning the last 2 months of transactions</p>
              {transactions.length > 0 && (
                <p className="text-xs">Showing {transactions.length} transactions found so far</p>
              )}
            </div>
          </div>
          {transactions.length > 0 && renderTransactions(transactions)}
        </>
      )
    }

    if (transactions.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {isLoading ? (
            <div className="space-y-2">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
              <p>Loading transactions...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Clock className="h-6 w-6 mx-auto" />
              <p>No transactions found in the last 2 months</p>
              <p className="text-sm">Your {activeTab} will appear here</p>
            </div>
          )}
        </div>
      )
    }

    return renderTransactions(transactions)
  }

  const handleViewWithdrawalDetails = (txHash: string) => {
    router.push(`/withdrawal-status?hash=${txHash}`)
  }

  const renderTransactions = (transactions: LocalTransaction[]) => {
    return (
      <div className="space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-background border">
                {tx.type === "deposit" ? (
                  <ArrowDownLeft className="h-4 w-4 text-green-600" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-blue-600" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium capitalize">{tx.type}</span>
                  <Badge variant="secondary" className={`text-xs ${getStatusColor(tx.status)}`}>
                    {tx.withdrawStatus || tx.status}
                  </Badge>
                  {tx.source === "local" && (
                    <Badge variant="outline" className="text-xs">
                      Local
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {tx.fromChain} → {tx.toChain}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="font-mono font-medium">
                {Number.parseFloat(tx.amount).toFixed(4)} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL}
              </div>
              <div className="text-sm text-muted-foreground">{formatTimestamp(tx.timestamp)}</div>
            </div>

            <div className="flex items-center space-x-2 ml-4">
              {/* View Details button for withdrawals */}
              {tx.type === "withdraw" && tx.hash && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewWithdrawalDetails(tx.hash)}
                  className="h-7 px-2 text-xs"
                >
                  View Details
                </Button>
              )}

              {/* Explorer link */}
              {tx.hash && (
                <Link
                  href={tx.explorerUrl}
                  target="_blank"
                  className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="font-mono">{truncateAddress(tx.hash as `0x${string}`)}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
          <CardDescription>Connect your wallet to view transaction history</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Transaction History</CardTitle>
            <CardDescription>Last 2 months of bridge transactions</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingDeposits || isLoadingWithdraws}
            className="h-8"
          >
            {isLoadingDeposits || isLoadingWithdraws ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="deposits">Deposits ({depositTransactions.length})</TabsTrigger>
            <TabsTrigger value="withdrawals">Withdrawals ({combinedWithdrawals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="deposits" className="mt-4">
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Tracking:</strong> L1 Optimism Portal ({NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY})
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Event: TransactionDeposited - Native token deposits from L1 to L2
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                <strong>Range:</strong> Last 2 months (~{formatBlockCount(blockRanges.l1BlocksFor2Months)} blocks on L1,
                ~10s per block)
              </p>
            </div>
            {renderTransactionList(depositTransactions, isLoadingDeposits, depositError, syncProgress.deposits)}
          </TabsContent>

          <TabsContent value="withdrawals" className="mt-4">
            <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/50">
              <p className="text-sm text-purple-800 dark:text-purple-200">
                <strong>Tracking:</strong> L2ToL1MessagePasser (0x4200000000000000000000000000000000000016)
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                Event: MessagePassed - Native token withdrawals from L2 to L1 + Local Storage
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                <strong>Range:</strong> Last 2 months (~{formatBlockCount(blockRanges.l2BlocksFor2Months)} blocks on L2,
                ~2s per block)
              </p>
            </div>
            {renderTransactionList(combinedWithdrawals, isLoadingWithdraws, withdrawError, syncProgress.withdrawals)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
