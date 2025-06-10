"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CheckCircle, Clock, Loader2, ExternalLink } from "lucide-react"
import { truncateAddress } from "@/lib/utils"
import { NEXT_PUBLIC_L2_EXPLORER_URL, NEXT_PUBLIC_L1_EXPLORER_URL } from "@/config/chains"
import Link from "next/link"
import type { WithdrawStatus } from "@/store/db"

// Update the WithdrawTxStatusProps interface to include an onProve callback
interface WithdrawTxStatusProps {
  currentStep: WithdrawStatus
  withdrawalHash?: string
  proveHash?: string
  finalizeHash?: string
  isLoading: boolean
  timeLeft: string
  onProve?: () => void
  onUpdateStatus?: () => void
}

// Update the component to accept and use the onProve prop
export function WithdrawTxStatus({
  currentStep,
  withdrawalHash,
  proveHash,
  finalizeHash,
  isLoading,
  timeLeft,
  onProve,
  onUpdateStatus,
}: WithdrawTxStatusProps) {
  const steps = [
    {
      key: "initiating",
      label: "Requesting withdraw (L2)",
      hash: withdrawalHash,
      explorerUrl: withdrawalHash ? `${NEXT_PUBLIC_L2_EXPLORER_URL}/tx/${withdrawalHash}` : undefined,
    },
    {
      key: "initiated",
      label: "Withdraw initiated",
      hash: withdrawalHash,
      explorerUrl: withdrawalHash ? `${NEXT_PUBLIC_L2_EXPLORER_URL}/tx/${withdrawalHash}` : undefined,
      action: onUpdateStatus ? (
        <Button size="sm" onClick={onUpdateStatus} disabled={isLoading} className="ml-2">
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Update Status"}
        </Button>
      ) : null,
    },
    {
      key: "ready_to_prove",
      label: "Ready to prove",
      hash: null,
      explorerUrl: undefined,
      action:
        onProve && !proveHash ? (
          <Button size="sm" onClick={onProve} disabled={isLoading} className="ml-2">
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Prove"}
          </Button>
        ) : null,
    },
    {
      key: "proving",
      label: "Proving (L1)",
      hash: proveHash,
      explorerUrl: proveHash ? `${NEXT_PUBLIC_L1_EXPLORER_URL}/#/tx/${proveHash}` : undefined,
    },
    {
      key: "proved",
      label: "Proved - waiting for challenge period",
      hash: proveHash,
      explorerUrl: proveHash ? `${NEXT_PUBLIC_L1_EXPLORER_URL}/#/tx/${proveHash}` : undefined,
    },
    {
      key: "finalizing",
      label: "Finalizing (L1)",
      hash: finalizeHash,
      explorerUrl: finalizeHash ? `${NEXT_PUBLIC_L1_EXPLORER_URL}/#/tx/${finalizeHash}` : undefined,
    },
    {
      key: "finalized",
      label: "Finalized",
      hash: finalizeHash,
      explorerUrl: finalizeHash ? `${NEXT_PUBLIC_L1_EXPLORER_URL}/#/tx/${finalizeHash}` : undefined,
    },
  ]

  const getStepStatus = (stepKey: string) => {
    const stepIndex = steps.findIndex((step) => step.key === stepKey)
    const currentIndex = steps.findIndex((step) => step.key === currentStep)

    if (stepIndex < currentIndex) return "completed"
    if (stepIndex === currentIndex) return "current"
    return "pending"
  }

  const getStepIcon = (stepKey: string) => {
    const status = getStepStatus(stepKey)

    if (status === "completed") {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }
    if (status === "current" && isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    }
    if (status === "current") {
      return <Clock className="h-4 w-4 text-blue-500" />
    }
    return <Clock className="h-4 w-4 text-muted-foreground" />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Withdrawal Progress</h3>
        {currentStep === "proved" && timeLeft && (
          <Badge variant="outline" className="text-xs">
            {timeLeft}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => {
          const status = getStepStatus(step.key)
          const isVisible = status !== "pending" || index <= steps.findIndex((s) => s.key === currentStep) + 1

          if (!isVisible) return null

          return (
            <div key={step.key} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getStepIcon(step.key)}
                <span
                  className={`text-sm ${
                    status === "completed"
                      ? "text-green-600 dark:text-green-400"
                      : status === "current"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
                {step.action && status === "current" && step.action}
              </div>

              {/* Only show hash link if the step has a hash and it's not a future step */}
              {step.hash && status !== "pending" && step.explorerUrl && (
                <Link
                  href={step.explorerUrl}
                  target="_blank"
                  className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <span className="font-mono">{truncateAddress(step.hash as `0x${string}`)}</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
