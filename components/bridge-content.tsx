"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Info } from "lucide-react"
import { useAccount, useConnect, useBalance, useSwitchChain, useDisconnect } from "wagmi"
import {
  NEXT_PUBLIC_L1_CHAIN_ID,
  NEXT_PUBLIC_L2_CHAIN_ID,
  NEXT_PUBLIC_L1_CHAIN_NAME,
  NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
  NEXT_PUBLIC_L2_CHAIN_NAME,
} from "@/config/chains"
import { useChainConfigs } from "@/hooks/use-chain-configs"
import type { WithdrawState, WithdrawStatus } from "@/store/db"
import { SimpleTokenSelector } from "@/components/simple-token-selector"

export default function BridgeContent() {
  // React state
  const [amount, setAmount] = useState("")
  const [errorInput, setErrorInput] = useState("")
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("deposit")
  const [selectedToken, setSelectedToken] = useState(NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL)
  const [isLoading, setIsLoading] = useState(false)
  const [withdrawStatus, setWithdrawStatus] = useState<WithdrawStatus | null>(null)
  const [withdrawData, setWithdrawData] = useState<WithdrawState | null>(null)
  const [popupTitle, setPopupTitle] = useState("")
  const [popupDescription, setPopupDescription] = useState("")
  const [timeLeft, setTimeLeft] = useState<string>("")
  const [selectedPercentage, setSelectedPercentage] = useState<number | null>(null)

  // Wagmi hooks
  const { address, isConnected, connector, chainId } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain } = useSwitchChain()
  const { data: l1Balance, refetch: refetchl1Balance } = useBalance({
    address: address,
    chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID),
  })
  const { data: l2Balance, refetch: refetchl2Balance } = useBalance({
    address: address,
    chainId: Number(NEXT_PUBLIC_L2_CHAIN_ID),
  })
  const { publicClientL1, publicClientL2, walletClientL1, walletClientL2 } = useChainConfigs()

  // Calculate time left until finalization
  const calculateTimeLeft = (createdAt: Date) => {
    const now = new Date()
    const createdAtDate = new Date(createdAt)
    const finalizationTime = new Date(createdAtDate.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days in milliseconds
    const diff = finalizationTime.getTime() - now.getTime()

    if (diff <= 0) {
      return "Ready to finalize"
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    return `${days}d ${hours}h ${minutes}m ${seconds}s`
  }

  // Update time left every second when withdrawal is proved
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (withdrawStatus === "proved" && withdrawData?.createdAt) {
      // Update immediately
      setTimeLeft(calculateTimeLeft(withdrawData.createdAt))

      // Then update every second
      interval = setInterval(() => {
        setTimeLeft(calculateTimeLeft(withdrawData.createdAt))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [withdrawStatus, withdrawData])

  // Handlers
  const handleTabChange = (tab: string) => {
    console.log("Tab changed to:", tab)
    setActiveTab(tab)
    setAmount("")
    setSelectedPercentage(null)
    setIsLoading(false)
    setWithdrawStatus(null)
    setWithdrawData(null)
    setTimeLeft("")
    setErrorInput("")
  }

  const handleActionButton = () => {
    console.log("Action button clicked!", {
      amount,
      isConnected,
      isLoading,
      activeTab,
      selectedToken,
      withdrawStatus,
    })

    if (!amount) {
      console.log("No amount entered")
      setErrorInput("Please enter an amount")
      return
    }

    if (!isConnected) {
      console.log("Wallet not connected")
      setErrorInput("Please connect your wallet using the header")
      return
    }

    if (isLoading) {
      console.log("Already loading")
      return
    }

    if (activeTab === "deposit") {
      console.log("Opening confirmation dialog for deposit")
      setIsConfirmationOpen(true)
    }

    if (activeTab === "withdraw") {
      switch (withdrawStatus) {
        case "ready_to_prove":
          console.log("Handling withdraw prove")
          handleWithdrawProve()
          break
        case "proved":
          console.log("Handling withdraw finalize")
          handleWithdrawFinalize()
          break
        default:
          console.log("Opening confirmation dialog for withdraw")
          setIsConfirmationOpen(true)
      }
    }
  }

  const handleConfirm = () => {
    console.log("Confirmed action for:", activeTab)
    setIsConfirmationOpen(false)
    if (activeTab === "deposit") {
      handleDeposit()
    } else {
      handleWithdraw()
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    console.log("Amount changed to:", value)

    // Clear previous errors and selected percentage
    setErrorInput("")
    setSelectedPercentage(null)

    // Check if value is a valid number
    if (value && isNaN(Number(value))) {
      setErrorInput("Please enter a valid number")
      return
    }

    setAmount(value)
  }

  const handleSetPercentage = (percentage: number) => {
    console.log("Setting percentage:", percentage)
    if (!isConnected) return

    const balance =
      activeTab === "deposit"
        ? Number.parseFloat(l1Balance?.formatted || "0")
        : Number.parseFloat(l2Balance?.formatted || "0")

    const calculatedAmount = (balance * percentage).toFixed(6)
    console.log("Calculated amount:", calculatedAmount)

    setAmount(calculatedAmount)
    setSelectedPercentage(percentage)
    setErrorInput("")
  }

  const handleTokenChange = (token: string) => {
    console.log("Token changed to:", token)
    setSelectedToken(token)
    setAmount("")
    setErrorInput("")
  }

  // Placeholder functions for deposit/withdraw logic
  const handleDeposit = async () => {
    console.log("Deposit function called")
    setErrorInput("Deposit functionality will be implemented")
  }

  const handleWithdraw = async () => {
    console.log("Withdraw function called")
    setErrorInput("Withdraw functionality will be implemented")
  }

  const handleWithdrawProve = async () => {
    console.log("Withdraw prove function called")
    setErrorInput("Withdraw prove functionality will be implemented")
  }

  const handleWithdrawFinalize = async () => {
    console.log("Withdraw finalize function called")
    setErrorInput("Withdraw finalize functionality will be implemented")
  }

  // Use memo
  const expectedChainId = useMemo(() => {
    if (activeTab === "deposit") {
      return Number(NEXT_PUBLIC_L1_CHAIN_ID)
    } else if (activeTab === "withdraw") {
      if (
        withdrawStatus === "ready_to_prove" ||
        withdrawStatus === "proving" ||
        withdrawStatus === "proved" ||
        withdrawStatus === "finalizing" ||
        withdrawStatus === "finalized"
      ) {
        return Number(NEXT_PUBLIC_L1_CHAIN_ID)
      }
      return Number(NEXT_PUBLIC_L2_CHAIN_ID)
    } else {
      return undefined
    }
  }, [activeTab, withdrawStatus])

  const actionButtonText = useMemo(() => {
    if (!isConnected) {
      return "Connect wallet using the header"
    }

    if (isLoading) {
      return (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {activeTab === "deposit" ? "Depositing..." : "Withdrawing..."}
        </>
      )
    }
    if (activeTab === "deposit") {
      return "Deposit"
    }
    if (activeTab === "withdraw") {
      switch (withdrawStatus) {
        case "initiating":
          return "Withdrawing..."
        case "initiated":
          return "Withdrawing..."
        case "ready_to_prove":
          return "Prove withdrawal"
        case "proving":
          return "Proving withdrawal..."
        case "proved":
          return timeLeft === "Ready to finalize" ? "Finalize withdrawal" : `Waiting (${timeLeft})`
        case "finalizing":
          return "Finalizing withdrawal..."
        case "finalized":
          return "Finalizing withdrawal..."
        default:
          return "Withdraw"
      }
    }
    return activeTab === "deposit" ? "Deposit" : "Withdraw"
  }, [activeTab, withdrawStatus, isLoading, timeLeft, isConnected])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {isConnected && (
          <Badge variant="outline" className="font-mono text-xs">
            {chainId === Number(NEXT_PUBLIC_L1_CHAIN_ID) ? NEXT_PUBLIC_L1_CHAIN_NAME : NEXT_PUBLIC_L2_CHAIN_NAME}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-12">
          <TabsTrigger value="deposit" className="text-sm font-medium">
            Deposit
          </TabsTrigger>
          <TabsTrigger value="withdraw" className="text-sm font-medium">
            Withdraw
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposit" className="mt-6">
          <CardDescription className="text-center">
            Transfer {selectedToken} from {NEXT_PUBLIC_L1_CHAIN_NAME} to {NEXT_PUBLIC_L2_CHAIN_NAME}
          </CardDescription>
        </TabsContent>

        <TabsContent value="withdraw" className="mt-6">
          <div className="space-y-3">
            <CardDescription className="text-center">
              Transfer {selectedToken} from {NEXT_PUBLIC_L2_CHAIN_NAME} to {NEXT_PUBLIC_L1_CHAIN_NAME}
            </CardDescription>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
              <div className="flex items-start space-x-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Withdrawals require a 7-day challenge period before funds are available on {NEXT_PUBLIC_L1_CHAIN_NAME}
                  .
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Token Selection */}
      <div className="space-y-3">
        <Label htmlFor="token" className="text-sm font-medium">
          Token
        </Label>
        <SimpleTokenSelector value={selectedToken} onChange={handleTokenChange} />
      </div>

      {/* Amount Input */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Label htmlFor="amount" className="text-sm font-medium">
            Amount
          </Label>
          {isConnected && (
            <div className="text-xs text-muted-foreground">
              Balance: {activeTab === "deposit" ? (l1Balance?.formatted ?? "0") : (l2Balance?.formatted ?? "0")}{" "}
              {selectedToken}
            </div>
          )}
        </div>
        <div className="relative">
          <Input
            id="amount"
            placeholder="0.0"
            type="number"
            value={amount}
            onChange={handleAmountChange}
            className="h-12 text-lg font-mono pr-16"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Badge variant="secondary" className="font-mono text-xs">
              {selectedToken}
            </Badge>
          </div>
        </div>

        {/* Percentage Buttons */}
        <div className="flex gap-2 mt-2">
          <Button
            variant={selectedPercentage === 0.25 ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              console.log("25% button clicked")
              handleSetPercentage(0.25)
            }}
          >
            25%
          </Button>
          <Button
            variant={selectedPercentage === 0.5 ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              console.log("50% button clicked")
              handleSetPercentage(0.5)
            }}
          >
            50%
          </Button>
          <Button
            variant={selectedPercentage === 0.75 ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              console.log("75% button clicked")
              handleSetPercentage(0.75)
            }}
          >
            75%
          </Button>
          <Button
            variant={selectedPercentage === 1 ? "default" : "outline"}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => {
              console.log("Max button clicked")
              handleSetPercentage(1)
            }}
          >
            Max
          </Button>
        </div>
      </div>

      {/* Balance Display */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {activeTab === "deposit" ? "From" : "To"} • {NEXT_PUBLIC_L1_CHAIN_NAME}
            </div>
            <div className="font-mono text-sm font-medium">
              {l1Balance?.formatted ?? "0"} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {activeTab === "deposit" ? "To" : "From"} • {NEXT_PUBLIC_L2_CHAIN_NAME}
            </div>
            <div className="font-mono text-sm font-medium">
              {l2Balance?.formatted ?? "0"} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL}
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="space-y-3">
        <Button
          size="lg"
          className="w-full h-12"
          onClick={() => {
            console.log("Action button clicked")
            handleActionButton()
          }}
          disabled={!isConnected || isLoading || (withdrawStatus === "proved" && timeLeft !== "Ready to finalize")}
        >
          {actionButtonText}
        </Button>

        {errorInput && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
            <p className="text-sm text-red-800 dark:text-red-200">{errorInput}</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <Dialog open={isConfirmationOpen} onOpenChange={setIsConfirmationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {activeTab}</DialogTitle>
            <DialogDescription>
              You are about to {activeTab} {amount} {selectedToken} {activeTab === "deposit" ? "to" : "from"}{" "}
              {NEXT_PUBLIC_L2_CHAIN_NAME}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                console.log("Cancel confirmation")
                setIsConfirmationOpen(false)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                console.log("Confirm action")
                handleConfirm()
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!popupTitle} onOpenChange={() => setPopupTitle("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{popupTitle}</DialogTitle>
            <DialogDescription>{popupDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                console.log("Close popup")
                setPopupTitle("")
                setPopupDescription("")
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
