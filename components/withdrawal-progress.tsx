"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, Clock, Loader2, Zap, Circle, ExternalLink, RefreshCw } from "lucide-react"
import {
  NEXT_PUBLIC_L1_EXPLORER_URL,
  NEXT_PUBLIC_L2_EXPLORER_URL,
  NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY,
  NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
} from "@/config/chains"
import { useState, useEffect } from "react"
import type { WithdrawStatus } from "@/store/db"
import { parseAbiItem, formatEther } from "viem"
import { db } from "@/store/db"
import { useChainConfigs } from "@/hooks/use-chain-configs"

interface WithdrawalProgressProps {
  withdrawalData: any // Use the actual WithdrawState from database
  currentStatus: WithdrawStatus
  onCheckStatus?: () => void
  onProve?: () => void
  onFinalize?: () => void
  onUpdateStatus?: () => Promise<void>
  isLoading?: boolean
  timeLeft?: string
}

const statusConfig = {
  initiating: { step: 1, label: "Initiating" },
  initiated: { step: 2, label: "Initiated" },
  ready_to_prove: { step: 3, label: "Ready to Prove" },
  proving: { step: 3.5, label: "Proving" },
  proved: { step: 4, label: "Proved" },
  finalizing: { step: 5, label: "Finalizing" },
  finalized: { step: 6, label: "Finalized" },
}

const getWithdrawalAmount = (withdrawalData: any) => {
  try {
    if (withdrawalData?.args?.value) {
      return formatEther(withdrawalData.args.value)
    }
    if (withdrawalData?.withdrawal?.value) {
      return formatEther(withdrawalData.withdrawal.value)
    }
    return null
  } catch (error) {
    console.error("Error formatting withdrawal amount:", error)
    return null
  }
}

export function WithdrawalProgress({
  withdrawalData,
  currentStatus,
  onCheckStatus,
  onProve,
  onFinalize,
  onUpdateStatus,
  isLoading = false,
  timeLeft,
}: WithdrawalProgressProps) {
  const [challengeTimeLeft, setChallengeTimeLeft] = useState<string>("")
  const { publicClientL1 } = useChainConfigs()
  const [withdrawalDataState, setWithdrawalData] = useState(withdrawalData)

  // Calculate challenge period countdown
  useEffect(() => {
    if (currentStatus === "proved" && withdrawalDataState) {
      const calculateTimeLeft = () => {
        // Try to get the prove timestamp from different sources
        let proveTimestamp = null

        // First priority: use dedicated proveTimestamp if available
        if (withdrawalDataState.proveTimestamp) {
          proveTimestamp = new Date(withdrawalDataState.proveTimestamp).getTime()
        }
        // Second priority: if we have a proveHash but no timestamp, use the createdAt as fallback
        // (this assumes createdAt was updated when the withdrawal was proved)
        else if (withdrawalDataState.proveHash && withdrawalDataState.createdAt) {
          proveTimestamp = new Date(withdrawalDataState.createdAt).getTime()
          console.log("Using createdAt as fallback for prove time:", new Date(proveTimestamp).toISOString())
        }
        // Third priority: if we have no prove data but status is proved, use updatedAt
        else if (withdrawalDataState.updatedAt) {
          proveTimestamp = new Date(withdrawalDataState.updatedAt).getTime()
          console.log("Using updatedAt as fallback for prove time:", new Date(proveTimestamp).toISOString())
        }
        // Last resort: use current time minus 1 hour as a rough estimate
        else {
          proveTimestamp = Date.now() - 1 * 60 * 60 * 1000 // Current time minus 1 hour
          console.log("No prove timestamp found, using current time minus 1 hour as fallback")
        }

        const challengePeriod = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
        const finalizationTime = proveTimestamp + challengePeriod
        const now = Date.now()
        const timeRemaining = finalizationTime - now

        if (timeRemaining <= 0) {
          setChallengeTimeLeft("Ready to finalize")
          return
        }

        const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000))
        const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
        const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000))
        const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000)

        if (days > 0) {
          setChallengeTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`)
        } else if (hours > 0) {
          setChallengeTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
        } else if (minutes > 0) {
          setChallengeTimeLeft(`${minutes}m ${seconds}s`)
        } else {
          setChallengeTimeLeft(`${seconds}s`)
        }
      }

      // Calculate immediately
      calculateTimeLeft()

      // Update every second
      const interval = setInterval(calculateTimeLeft, 1000)

      return () => clearInterval(interval)
    } else {
      setChallengeTimeLeft("")
    }
  }, [currentStatus, withdrawalDataState])

  const fetchMissingProofData = async () => {
    if (!withdrawalDataState || !publicClientL1 || currentStatus !== "proved") {
      return
    }

    // Only fetch if we're missing proof data
    if (withdrawalDataState.proveHash && withdrawalDataState.proveTimestamp) {
      return // We already have the data
    }

    // Check if we have the OptimismPortal address
    if (!NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY) {
      console.error("OptimismPortal address not configured")
      return
    }

    try {
      console.log("Fetching missing proof data for withdrawal:", withdrawalDataState.withdrawalHash)

      // Try to find the proof transaction by searching for WithdrawalProven events
      const currentBlock = await publicClientL1.getBlockNumber()
      const searchFromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n

      console.log(`Searching for WithdrawalProven events from block ${searchFromBlock} to ${currentBlock}`)

      // Get WithdrawalProven events from the OptimismPortal contract
      const provenLogs = await publicClientL1.getLogs({
        address: NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`,
        event: parseAbiItem(
          "event WithdrawalProven(bytes32 indexed withdrawalHash, address indexed from, address indexed to)",
        ),
        args: {
          withdrawalHash: withdrawalDataState.withdrawalHash as `0x${string}`,
        },
        fromBlock: searchFromBlock,
        toBlock: currentBlock,
      })

      if (provenLogs.length > 0) {
        const log = provenLogs[0]
        const proveBlock = await publicClientL1.getBlock({ blockNumber: log.blockNumber })
        const proveTimestamp = new Date(Number(proveBlock.timestamp) * 1000)

        console.log("Found proof transaction:", {
          proveHash: log.transactionHash,
          proveTimestamp,
          blockNumber: log.blockNumber,
        })

        // Update the withdrawal data with the proof information
        const updatedWithdrawal = {
          ...withdrawalDataState,
          proveHash: log.transactionHash,
          proveTimestamp,
          updatedAt: new Date(),
        }

        // Update the database if we have an ID
        if (withdrawalDataState.id) {
          await db.withdraws.update(withdrawalDataState.id, {
            proveHash: log.transactionHash,
            proveTimestamp,
            updatedAt: new Date(),
          })
        }

        // Update the local state
        setWithdrawalData(updatedWithdrawal)

        console.log("Updated withdrawal with proof data:", updatedWithdrawal)
      } else {
        console.log("No WithdrawalProven events found for this withdrawal")
      }
    } catch (error) {
      console.error("Error fetching proof data:", error)
    }
  }

  useEffect(() => {
    if (
      currentStatus === "proved" &&
      withdrawalDataState &&
      (!withdrawalDataState.proveHash || !withdrawalDataState.proveTimestamp)
    ) {
      console.log("Missing proof data detected, fetching from blockchain...")
      fetchMissingProofData()
    }
  }, [currentStatus, withdrawalDataState])

  if (!withdrawalDataState) {
    return null
  }

  const currentStep = statusConfig[currentStatus]?.step || 1
  const statusLabel = statusConfig[currentStatus]?.label || currentStatus

  const steps = [
    {
      id: 1,
      title: "Requesting withdraw (L2)",
      description: "Transaction submitted to L2",
      status: "completed",
      txHash: withdrawalDataState.withdrawalHash,
      network: "L2",
    },
    {
      id: 2,
      title: "Withdraw initiated",
      description: "Withdrawal request confirmed",
      status: currentStep >= 2 ? "completed" : "pending",
      txHash: withdrawalDataState.withdrawalHash,
      network: "L2",
    },
    {
      id: 3,
      title: "Waiting until ready to prove (~1 hour)",
      description: "Waiting for state root to be published",
      status: currentStep > 3 ? "completed" : currentStep === 3 ? "loading" : "pending",
    },
    {
      id: 4,
      title: "Proving (L1)",
      description: "Submit proof transaction on L1",
      status: currentStep > 4 ? "completed" : currentStep === 4 ? "action" : "pending",
      txHash: withdrawalDataState.proveHash,
      network: "L1",
      action: currentStatus === "ready_to_prove" ? onProve : undefined,
    },
    {
      id: 5,
      title: "Waiting for proof",
      description: "7-day challenge period",
      status: currentStep > 5 ? "completed" : currentStep === 5 ? "waiting" : "pending",
      showTimer: currentStatus === "proved",
    },
    {
      id: 6,
      title: "Finalizing (L1)",
      description: "Complete withdrawal on L1",
      status: currentStep > 6 ? "completed" : currentStep === 6 ? "action" : "pending",
      txHash: withdrawalDataState.finalizeHash,
      network: "L1",
      action:
        currentStatus === "ready_to_finalize" ||
        (currentStatus === "proved" && challengeTimeLeft === "Ready to finalize")
          ? onFinalize
          : undefined,
    },
  ]

  const getStepIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "loading":
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      case "waiting":
        return <Clock className="h-5 w-5 text-yellow-500" />
      case "action":
        return <Zap className="h-5 w-5 text-orange-500" />
      default:
        return <Circle className="h-5 w-5 text-gray-300" />
    }
  }

  const getStatusColor = (status: WithdrawStatus) => {
    switch (status) {
      case "ready_to_prove":
        return "bg-orange-100 text-orange-800"
      case "proving":
        return "bg-orange-100 text-orange-800"
      case "proved":
        return "bg-blue-100 text-blue-800"
      case "finalizing":
        return "bg-purple-100 text-purple-800"
      case "finalized":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Withdrawal Progress
              {(() => {
                const amount = getWithdrawalAmount(withdrawalDataState)
                return amount ? (
                  <Badge variant="outline" className="font-mono text-sm">
                    {Number.parseFloat(amount).toFixed(6)} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL || "ETH"}
                  </Badge>
                ) : null
              })()}
            </CardTitle>
            {(() => {
              const amount = getWithdrawalAmount(withdrawalDataState)
              return amount ? (
                <p className="text-sm text-muted-foreground mt-1">
                  Withdrawing {Number.parseFloat(amount).toFixed(6)} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL || "PLS"} to L1
                </p>
              ) : null
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(currentStatus)}>Status: {statusLabel}</Badge>
            {onUpdateStatus && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onUpdateStatus}
                disabled={isLoading}
                title="Refresh withdrawal status"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Debug Info for timestamp issues */}
        {process.env.NODE_ENV !== "production" && withdrawalDataState && currentStatus === "proved" && (
          <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
            <div>Debug Info:</div>
            <div>
              createdAt:{" "}
              {withdrawalDataState.createdAt ? new Date(withdrawalDataState.createdAt).toISOString() : "null"}
            </div>
            <div>
              updatedAt:{" "}
              {withdrawalDataState.updatedAt ? new Date(withdrawalDataState.updatedAt).toISOString() : "null"}
            </div>
            <div>proveHash: {withdrawalDataState.proveHash || "null"}</div>
            <div>proveReceipt: {withdrawalDataState.proveReceipt ? "exists" : "null"}</div>
            <div>
              proveTimestamp:{" "}
              {withdrawalDataState.proveTimestamp ? new Date(withdrawalDataState.proveTimestamp).toISOString() : "null"}
            </div>
            <div>Current time: {new Date().toISOString()}</div>
            <div>Calculated time left: {challengeTimeLeft}</div>
            <div>OptimismPortal: {NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY || "not configured"}</div>
          </div>
        )}

        {/* Progress Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-start space-x-4">
              <div className="flex flex-col items-center">
                {getStepIcon(step.status)}
                {index < steps.length - 1 && (
                  <div className={`w-px h-8 mt-2 ${step.status === "completed" ? "bg-green-200" : "bg-gray-200"}`} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4
                    className={`text-sm font-medium ${
                      step.status === "completed"
                        ? "text-green-700"
                        : step.status === "action"
                          ? "text-orange-700"
                          : step.status === "loading"
                            ? "text-blue-700"
                            : "text-gray-500"
                    }`}
                  >
                    {step.title}
                  </h4>

                  {step.network && (
                    <Badge variant="outline" className="text-xs">
                      {step.network}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-gray-600">{step.description}</p>
                  {/* Transaction Link - External icon next to description */}
                  {step.txHash && (
                    <a
                      href={`${step.network === "L1" ? NEXT_PUBLIC_L1_EXPLORER_URL : NEXT_PUBLIC_L2_EXPLORER_URL}/tx/${step.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800"
                      title={`View transaction: ${step.txHash}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* Action Buttons */}
                {step.action && (
                  <div className="mt-2">
                    <Button onClick={step.action} disabled={isLoading} size="sm" className="text-xs">
                      {isLoading ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Processing...
                        </>
                      ) : step.id === 4 ? (
                        "Prove withdrawal"
                      ) : (
                        "Finalize withdrawal"
                      )}
                    </Button>
                  </div>
                )}

                {/* Countdown Timer for Challenge Period */}
                {step.showTimer && challengeTimeLeft && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <div className="text-sm font-medium text-yellow-700">
                        {challengeTimeLeft === "Ready to finalize" ? (
                          <span className="text-green-600">Ready to finalize!</span>
                        ) : (
                          <span>Time remaining: {challengeTimeLeft}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Challenge period ends when timer reaches zero</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Check Status Button */}
        {onCheckStatus && (
          <div className="pt-4 border-t">
            <Button onClick={onCheckStatus} disabled={isLoading} variant="outline" className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                "Check Status"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
