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
import Link from "next/link"
import { Loader2, Info, ExternalLink } from "lucide-react"
import { useAccount, useConnect, useBalance, useSwitchChain, useDisconnect } from "wagmi"
import {
  NEXT_PUBLIC_L1_CHAIN_ID,
  NEXT_PUBLIC_L2_CHAIN_ID,
  NEXT_PUBLIC_L1_CHAIN_NAME,
  NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
  NEXT_PUBLIC_L2_CHAIN_NAME,
  NEXT_PUBLIC_L1_EXPLORER_URL,
  NEXT_PUBLIC_L2_EXPLORER_URL,
} from "@/config/chains"
import { useChainConfigs } from "@/hooks/use-chain-configs"
import type { WithdrawState, WithdrawStatus } from "@/store/db"
import { SimpleTokenSelector } from "@/components/simple-token-selector"
import { parseEther } from "viem"
import { getL2TransactionHashes } from "viem/op-stack"
import { truncateAddress } from "@/lib/utils"
import { db } from "@/store/db"
import { WithdrawalProgress } from "@/components/withdrawal-progress"

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
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null)
  const [depositL2TxHash, setDepositL2TxHash] = useState<string | null>(null)
  const [depositStatus, setDepositStatus] = useState<"idle" | "pending_l1" | "pending_l2" | "completed" | "failed">(
    "idle",
  )
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  // Save withdrawal state to database
  const saveWithdrawalToDb = async (withdrawal: WithdrawState) => {
    try {
      const existingWithdrawal = await db.withdraws.where("withdrawalHash").equals(withdrawal.withdrawalHash).first()

      if (existingWithdrawal) {
        await db.withdraws.update(existingWithdrawal.id!, {
          ...withdrawal,
          updatedAt: new Date(),
        })
      } else {
        await db.withdraws.add(withdrawal)
      }
      console.log("Withdrawal state saved to database:", withdrawal)
    } catch (error) {
      console.error("Error saving withdrawal to database:", error)
    }
  }


  // Update the loadWithdrawalFromDb function to include proof data refresh:
  const loadWithdrawalFromDb = async (userAddress: string) => {
    try {
      const withdrawals = await db.withdraws
        .where("address")
        .equals(userAddress.toLowerCase())
        .and((withdrawal) => withdrawal.status !== "finalized" && withdrawal.status !== "failed")
        .reverse()
        .sortBy("createdAt")

      if (withdrawals.length > 0) {
        let latestWithdrawal = withdrawals[0]
        console.log("Loaded withdrawal from database:", latestWithdrawal)
        setWithdrawData(latestWithdrawal)
        setWithdrawStatus(latestWithdrawal.status)

        // If withdrawal is proved, start the countdown timer
        if (latestWithdrawal.status === "proved" && latestWithdrawal.proveTimestamp) {
          setTimeLeft(calculateTimeLeft(latestWithdrawal.proveTimestamp))
        }

        return latestWithdrawal
      }
    } catch (error) {
      console.error("Error loading withdrawal from database:", error)
    }
    return null
  }

  // Add this new function after loadWithdrawalFromDb
  const checkWithdrawalStatus = async () => {
    if (!withdrawData || !withdrawData.withdrawalHash || !withdrawData.withdrawalReceipt) {
      setErrorInput("Missing withdrawal data required for status check")
      return
    }

    try {
      setIsLoading(true)
      setErrorInput("")

      console.log("Checking withdrawal status for:", withdrawData.withdrawalHash)

      // Check if the withdrawal is ready to prove
      try {
        console.log("Waiting for withdrawal to be ready to prove...")

        const { output, withdrawal } = await publicClientL1.waitToProve({
          receipt: withdrawData.withdrawalReceipt,
          targetChain: l2Chain,
        })

        console.log("Withdrawal ready to prove:", { output, withdrawal })

        // Update withdrawal data
        const readyToProveWithdrawal = {
          ...withdrawData,
          status: "ready_to_prove" as WithdrawStatus,
          output,
          withdrawal,
          updatedAt: new Date(),
        }

        // Save ready to prove state to database
        await saveWithdrawalToDb(readyToProveWithdrawal)

        setWithdrawData(readyToProveWithdrawal)
        setWithdrawStatus("ready_to_prove")

        // Show info message
        setPopupTitle("Withdrawal Ready to Prove")
        setPopupDescription(
          `Your withdrawal is now ready to be proven on L1. Click the "Prove withdrawal" button to continue.`,
        )
      } catch (error) {
        console.error("Error checking withdrawal status:", error)

        // If the withdrawal is not ready yet, show a message
        setPopupTitle("Withdrawal Status")
        setPopupDescription(
          `Your withdrawal is not yet ready to be proven. This typically takes about 1 hour. Please check back later.`,
        )
      }
    } catch (error) {
      console.error("Error checking withdrawal status:", error)
      setErrorInput("Failed to check withdrawal status")
    } finally {
      setIsLoading(false)
    }
  }

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
  const l2Chain = {
    id: Number(NEXT_PUBLIC_L2_CHAIN_ID),
  }

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

  // Load withdrawal state from database when address changes
  useEffect(() => {
      setWithdrawData(null)
      setWithdrawStatus(null)
      setTimeLeft("")

  }, [address, isConnected])

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

    // Reset deposit status
    setDepositStatus("idle")
    setDepositTxHash(null)
    setDepositL2TxHash(null)
  }

  const handleActionButton = () => {
    console.log("Action button clicked!", {
      amount,
      isConnected,
      isLoading,
      activeTab,
      selectedToken,
      withdrawStatus,
      chainId,
      expectedChainId,
    })

    if (!isConnected) {
      console.log("Opening wallet connection modal")
      setIsWalletModalOpen(true)
      return
    }

    if (isLoading) {
      console.log("Already loading")
      return
    }

    // Check if we're on the correct network and auto-switch if needed
    if (expectedChainId && chainId !== expectedChainId) {
      console.log("Wrong network, auto-switching...", { currentChainId: chainId, expectedChainId })
      handleAutoNetworkSwitch()
      return
    }

    // Only validate amount after we're on the correct network
    if (!amount) {
      console.log("No amount entered")
      setErrorInput("Please enter an amount")
      return
    }

    if (activeTab === "deposit" && !validateDepositAmount(amount)) {
      // Error is already set in validateDepositAmount
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

  const validateDepositAmount = (value: string): boolean => {
    if (!value || isNaN(Number(value)) || Number(value) <= 0) {
      return false
    }

    if (activeTab === "deposit" && l1Balance) {
      const depositAmount = Number.parseFloat(value)
      const l1BalanceValue = Number.parseFloat(l1Balance.formatted)

      // Check if amount exceeds balance
      if (depositAmount > l1BalanceValue) {
        setErrorInput("Insufficient balance")
        return false
      }

      // Check if amount is too close to total balance (no gas left)
      if (depositAmount > l1BalanceValue - 0.005) {
        setErrorInput("Leave some ETH for gas fees")
        return false
      }
    }

    return true
  }

  const handleSetPercentage = (percentage: number) => {
    console.log("Setting percentage:", percentage)
    if (!isConnected) return

    const balance =
      activeTab === "deposit"
        ? Number.parseFloat(l1Balance?.formatted || "0")
        : Number.parseFloat(l2Balance?.formatted || "0")

    // For deposits, leave some ETH for gas
    if (activeTab === "deposit" && percentage === 1) {
      // Leave approximately 0.01 ETH for gas if balance is greater than 0.02
      if (balance > 0.02) {
        const adjustedAmount = (balance - 0.01).toFixed(6)
        console.log("Adjusted max amount (leaving gas):", adjustedAmount)
        setAmount(adjustedAmount)
      } else {
        // If balance is small, use 90% to ensure gas is available
        const adjustedAmount = (balance * 0.9).toFixed(6)
        console.log("Small balance, using 90%:", adjustedAmount)
        setAmount(adjustedAmount)
      }
    } else {
      const calculatedAmount = (balance * percentage).toFixed(6)
      console.log("Calculated amount:", calculatedAmount)
      setAmount(calculatedAmount)
    }

    setSelectedPercentage(percentage)
    setErrorInput("")
  }

  const handleTokenChange = (token: string) => {
    console.log("Token changed to:", token)
    setSelectedToken(token)
    setAmount("")
    setErrorInput("")
  }

  const handleAutoNetworkSwitch = async () => {
    if (!expectedChainId) {
      console.log("No expected chain ID")
      return
    }

    try {
      setIsLoading(true)
      setErrorInput("")

      console.log("Attempting to switch to chain:", expectedChainId)

      await switchChain({ chainId: expectedChainId })

      console.log("Network switch successful")

      // Small delay to ensure the network switch is complete
      setTimeout(() => {
        setIsLoading(false)
        // After successful switch, don't auto-execute anything
        // Let the user enter an amount and click the button again
      }, 1000)
    } catch (error) {
      console.error("Network switch failed:", error)
      setIsLoading(false)

      if (error instanceof Error) {
        if (error.message.includes("User rejected") || error.message.includes("User denied")) {
          setErrorInput("Network switch was cancelled by user")
        } else {
          const networkName =
            expectedChainId === Number(NEXT_PUBLIC_L1_CHAIN_ID) ? NEXT_PUBLIC_L1_CHAIN_NAME : NEXT_PUBLIC_L2_CHAIN_NAME
          setErrorInput(`Failed to switch to ${networkName}. Please switch manually.`)
        }
      } else {
        setErrorInput("Failed to switch network")
      }
    }
  }

  // Placeholder functions for deposit/withdraw logic
  const handleDeposit = async () => {
    try {
      if (!amount || Number.parseFloat(amount) <= 0) {
        setErrorInput("Please enter a valid amount")
        return
      }

      if (!address || !isConnected) {
        setErrorInput("Please connect your wallet")
        return
      }

      if (chainId !== Number(NEXT_PUBLIC_L1_CHAIN_ID)) {
        setErrorInput(`Please switch to ${NEXT_PUBLIC_L1_CHAIN_NAME} network`)
        return
      }

      if (!publicClientL1 || !publicClientL2 || !walletClientL1) {
        setErrorInput("Bridge clients not initialized")
        return
      }

      setIsLoading(true)
      setErrorInput("")
      setDepositStatus("idle")
      setDepositTxHash(null)
      setDepositL2TxHash(null)

      // Parse the amount to BigInt
      const amountInWei = parseEther(amount)

      console.log("Starting deposit process...", {
        address,
        amount,
        amountInWei: amountInWei.toString(),
        chainId,
      })

      try {
        // Build deposit transaction parameters using L2 client
        const args = await publicClientL2.buildDepositTransaction({
          account: address,
          mint: amountInWei,
          to: address,
        })

        console.log("Built deposit transaction:", args)

        // Execute the deposit transaction
        const hash = await walletClientL1.depositTransaction(args)
        console.log("Deposit transaction submitted:", hash)

        // Update deposit status
        setDepositTxHash(hash)
        setDepositStatus("pending_l1")

        // Wait for the transaction to be processed
        const receipt = await publicClientL1.waitForTransactionReceipt({
          hash,
        })

        console.log("Deposit transaction confirmed on L1:", receipt)

        // Get L2 transaction hash from L1 receipt
        const l2Hashes = getL2TransactionHashes(receipt)

        if (l2Hashes.length === 0) {
          throw new Error("No L2 transaction hash found in receipt")
        }

        const l2Hash = l2Hashes[0]
        console.log("L2 transaction hash:", l2Hash)

        // Update deposit status
        setDepositL2TxHash(l2Hash)
        setDepositStatus("pending_l2")

        // Wait for the L2 transaction to be processed
        const l2Receipt = await publicClientL2.waitForTransactionReceipt({
          hash: l2Hash,
        })

        console.log("Deposit confirmed on L2:", l2Receipt)

        // Update UI state
        setDepositStatus("completed")
        setIsLoading(false)

        // Clear form
        setAmount("")
        setSelectedPercentage(null)

        // Refresh balances with a small delay to ensure blockchain state is updated
        setTimeout(() => {
          refetchl1Balance()
          refetchl2Balance()
        }, 2000)

        // Show success message
        setPopupTitle("Deposit Successful")
        setPopupDescription(
          `Your deposit of ${amount} ${NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL} has been successfully processed on both L1 and L2. Balances will update shortly.`,
        )
      } catch (error) {
        console.error("Deposit error:", error)
        setDepositStatus("failed")
        setIsLoading(false)

        if (error instanceof Error) {
          if (error.message.includes("User rejected") || error.message.includes("User denied")) {
            setErrorInput("Transaction was cancelled by user")
          } else {
            setErrorInput(`Deposit failed: ${error.message}`)
          }
        } else {
          setErrorInput("Deposit failed with unknown error")
        }
      }
    } catch (error) {
      console.error("Deposit preparation error:", error)
      setDepositStatus("failed")
      setIsLoading(false)

      if (error instanceof Error) {
        setErrorInput(`Deposit preparation failed: ${error.message}`)
      } else {
        setErrorInput("Deposit preparation failed with unknown error")
      }
    }
  }

  const handleWithdraw = async () => {
    try {
      if (!amount || Number.parseFloat(amount) <= 0) {
        setErrorInput("Please enter a valid amount")
        return
      }

      if (!address || !isConnected) {
        setErrorInput("Please connect your wallet")
        return
      }

      if (chainId !== Number(NEXT_PUBLIC_L2_CHAIN_ID)) {
        setErrorInput(`Please switch to ${NEXT_PUBLIC_L2_CHAIN_NAME} network`)
        return
      }

      if (!publicClientL1 || !publicClientL2 || !walletClientL2) {
        setErrorInput("Bridge clients not initialized")
        return
      }

      setIsLoading(true)
      setErrorInput("")
      setWithdrawStatus("initiating")

      // Parse the amount to BigInt
      const amountInWei = parseEther(amount)

      console.log("Starting withdrawal process...", {
        address,
        amount,
        amountInWei: amountInWei.toString(),
        chainId,
      })

      try {
        // Build withdrawal transaction parameters using L1 client
        const args = await publicClientL1.buildInitiateWithdrawal({
          account: address,
          to: address,
          value: amountInWei,
        })

        console.log("Built withdrawal transaction:", args)

        // Execute the withdrawal transaction
        const hash = await walletClientL2.initiateWithdrawal(args)
        console.log("Withdrawal transaction submitted:", hash)

        // Create withdrawal data object
        const withdrawalData = {
          withdrawalHash: hash, // This should be the L2 transaction hash
          address: address,
          status: "initiating" as WithdrawStatus,
          args,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        // Save initial withdrawal state to database
        await saveWithdrawalToDb(withdrawalData)

        // Store withdrawal data
        setWithdrawData(withdrawalData)

        // Wait for the transaction to be processed
        const receipt = await publicClientL2.waitForTransactionReceipt({
          hash,
        })

        console.log("Withdrawal transaction confirmed on L2:", receipt)

        // Update withdrawal data with receipt
        const updatedWithdrawal = {
          ...withdrawalData,
          status: "initiated" as WithdrawStatus,
          withdrawalReceipt: receipt,
          updatedAt: new Date(),
        }

        // Save updated withdrawal state to database
        await saveWithdrawalToDb(updatedWithdrawal)

        setWithdrawData(updatedWithdrawal)
        setWithdrawStatus("initiated")

        // Show info message
        setPopupTitle("Withdrawal Initiated")
        setPopupDescription(
          `Your withdrawal of ${amount} ${NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL} has been initiated. You'll need to wait for the transaction to be included in an L2 block before you can prove it on L1.`,
        )

        // Wait for the withdrawal to be ready to prove
        try {
          setWithdrawStatus("initiated")
          console.log("Waiting for withdrawal to be ready to prove...")

          const { output, withdrawal } = await publicClientL1.waitToProve({
            receipt,
            targetChain: l2Chain,
          })

          console.log("Withdrawal ready to prove:", { output, withdrawal })

          // Update withdrawal data
          const readyToProveWithdrawal = {
            ...updatedWithdrawal,
            status: "ready_to_prove" as WithdrawStatus,
            output,
            withdrawal,
            updatedAt: new Date(),
          }

          // Save ready to prove state to database
          await saveWithdrawalToDb(readyToProveWithdrawal)

          setWithdrawData(readyToProveWithdrawal)
          setWithdrawStatus("ready_to_prove")

          // Show info message
          setPopupTitle("Withdrawal Ready to Prove")
          setPopupDescription(
            `Your withdrawal is now ready to be proven on L1. Click the "Prove withdrawal" button to continue.`,
          )
        } catch (error) {
          console.error("Error waiting for withdrawal to be ready to prove:", error)
          setErrorInput("Failed to prepare withdrawal for proving. Please try again later.")
        }

        // Refresh balances
        refetchl2Balance()
      } catch (error) {
        console.error("Withdrawal error:", error)
        setWithdrawStatus(null)
        setIsLoading(false)

        if (error instanceof Error) {
          if (error.message.includes("User rejected") || error.message.includes("User denied")) {
            setErrorInput("Transaction was cancelled by user")
          } else {
            setErrorInput(`Withdrawal failed: ${error.message}`)
          }
        } else {
          setErrorInput("Withdrawal failed with unknown error")
        }
      }
    } catch (error) {
      console.error("Withdrawal preparation error:", error)
      setWithdrawStatus(null)
      setIsLoading(false)

      if (error instanceof Error) {
        setErrorInput(`Withdrawal preparation failed: ${error.message}`)
      } else {
        setErrorInput("Withdrawal preparation failed with unknown error")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleWithdrawProve = async () => {
    if (!withdrawData || !withdrawData.output || !withdrawData.withdrawal) {
      setErrorInput("Missing withdrawal data required for proving")
      return
    }

    try {
      setIsLoading(true)
      setErrorInput("")
      setWithdrawStatus("proving")

      console.log("Starting withdrawal proof process...")

      // Build prove withdrawal arguments
      const proveArgs = await publicClientL2.buildProveWithdrawal({
        output: withdrawData.output,
        withdrawal: withdrawData.withdrawal,
      })

      console.log("Built prove withdrawal arguments:", proveArgs)

      // Switch to L1 chain
      await switchChain({
        chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID),
      })

      // Execute prove withdrawal transaction
      const proveHash = await walletClientL1.proveWithdrawal({
        ...proveArgs,
        authorizationList: [],
        account: address,
      })

      console.log("Prove withdrawal transaction submitted:", proveHash)

      // Update withdrawal data
      const provingWithdrawal = {
        ...withdrawData,
        status: "proving" as WithdrawStatus,
        proveHash, // Make sure this is saved
        proveArgs,
        updatedAt: new Date(),
      }

      // Save proving state to database
      await saveWithdrawalToDb(provingWithdrawal)

      setWithdrawData(provingWithdrawal)

      // Wait for the transaction to be processed
      const proveReceipt = await publicClientL1.waitForTransactionReceipt({
        hash: proveHash,
      })

      console.log("Prove withdrawal transaction confirmed on L1:", proveReceipt)

      // Update withdrawal data
      const provedWithdrawal = {
        ...provingWithdrawal,
        status: "proved" as WithdrawStatus,
        proveReceipt,
        proveTimestamp: new Date(), // Add this line to store the current time as the prove timestamp
        updatedAt: new Date(),
      }

      // Save proved state to database
      await saveWithdrawalToDb(provedWithdrawal)

      setWithdrawData(provedWithdrawal)
      setWithdrawStatus("proved")
      setTimeLeft(calculateTimeLeft(new Date()))

      // Show info message
      setPopupTitle("Withdrawal Proven")
      setPopupDescription(
        `Your withdrawal has been proven on L1. You'll need to wait for a 7-day challenge period before you can finalize the withdrawal.`,
      )

      // Refresh balances
      refetchl1Balance()
    } catch (error) {
      console.error("Prove withdrawal error:", error)
      setWithdrawStatus("ready_to_prove") // Revert to ready_to_prove state
      setIsLoading(false)

      if (error instanceof Error) {
        if (error.message.includes("User rejected") || error.message.includes("User denied")) {
          setErrorInput("Transaction was cancelled by user")
        } else {
          setErrorInput(`Prove withdrawal failed: ${error.message}`)
        }
      } else {
        setErrorInput("Prove withdrawal failed with unknown error")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleWithdrawFinalize = async () => {
    if (!withdrawData || !withdrawData.withdrawal) {
      setErrorInput("Missing withdrawal data required for finalization")
      return
    }

    try {
      setIsLoading(true)
      setErrorInput("")
      setWithdrawStatus("finalizing")

      console.log("Starting withdrawal finalization process...")

      // Check if 7 days have passed
      const now = new Date()
      const createdAt = new Date(withdrawData.createdAt)
      const finalizationTime = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000)

      if (now < finalizationTime) {
        setErrorInput("7-day challenge period has not passed yet")
        setWithdrawStatus("proved")
        setIsLoading(false)
        return
      }

      // Ensure we're on L1
      if (chainId !== Number(NEXT_PUBLIC_L1_CHAIN_ID)) {
        await switchChain({
          chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID),
        })
      }

      // Execute finalize withdrawal transaction
      const finalizeHash = await walletClientL1.finalizeWithdrawal({
        targetChain: l2Chain,
        withdrawal: withdrawData.withdrawal,
        authorizationList: [],
        account: address,
      })

      console.log("Finalize withdrawal transaction submitted:", finalizeHash)

      // Update withdrawal data
      const finalizingWithdrawal = {
        ...withdrawData,
        status: "finalizing" as WithdrawStatus,
        finalizeHash, // Make sure this is saved
        updatedAt: new Date(),
      }

      // Save finalizing state to database
      await saveWithdrawalToDb(finalizingWithdrawal)

      setWithdrawData(finalizingWithdrawal)

      // Wait for the transaction to be processed
      const finalizeReceipt = await publicClientL1.waitForTransactionReceipt({
        hash: finalizeHash,
      })

      console.log("Finalize withdrawal transaction confirmed on L1:", finalizeReceipt)

      // Update withdrawal data
      const finalizedWithdrawal = {
        ...finalizingWithdrawal,
        status: "finalized" as WithdrawStatus,
        finalizeReceipt,
        updatedAt: new Date(),
      }

      // Save finalized state to database
      await saveWithdrawalToDb(finalizedWithdrawal)

      setWithdrawData(finalizedWithdrawal)
      setWithdrawStatus("finalized")

      // Show success message
      setPopupTitle("Withdrawal Finalized")
      setPopupDescription(
        `Your withdrawal of ${amount} ${NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL} has been successfully finalized. The funds are now available in your L1 wallet.`,
      )

      // Clear form and reset state after a delay
      setTimeout(() => {
        setAmount("")
        setSelectedPercentage(null)
        setWithdrawStatus(null)
        setWithdrawData(null)
        setTimeLeft("")
      }, 5000)

      // Refresh balances
      refetchl1Balance()
    } catch (error) {
      console.error("Finalize withdrawal error:", error)
      setWithdrawStatus("proved") // Revert to proved state
      setIsLoading(false)

      if (error instanceof Error) {
        if (error.message.includes("User rejected") || error.message.includes("User denied")) {
          setErrorInput("Transaction was cancelled by user")
        } else {
          setErrorInput(`Finalize withdrawal failed: ${error.message}`)
        }
      } else {
        setErrorInput("Finalize withdrawal failed with unknown error")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnectWallet = (connector: any) => {
    console.log("Connecting with:", connector.name)
    connect({ connector })
    setIsWalletModalOpen(false)
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
      return "Connect Wallet"
    }

    // Check if we need to switch networks
    if (expectedChainId && chainId !== expectedChainId) {
      const networkName =
        expectedChainId === Number(NEXT_PUBLIC_L1_CHAIN_ID) ? NEXT_PUBLIC_L1_CHAIN_NAME : NEXT_PUBLIC_L2_CHAIN_NAME

      if (isLoading) {
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Switching to {networkName}...
          </>
        )
      }

      return `Switch to ${networkName}`
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
  }, [activeTab, withdrawStatus, isLoading, timeLeft, isConnected, chainId, expectedChainId])

  // Auto-refresh balances when deposit completes
  useEffect(() => {
    if (depositStatus === "completed") {
      const refreshInterval = setInterval(() => {
        refetchl1Balance()
        refetchl2Balance()
      }, 3000)

      // Stop refreshing after 30 seconds
      const stopRefresh = setTimeout(() => {
        clearInterval(refreshInterval)
      }, 30000)

      return () => {
        clearInterval(refreshInterval)
        clearTimeout(stopRefresh)
      }
    }
  }, [depositStatus, refetchl1Balance, refetchl2Balance])

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
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground">
                {activeTab === "deposit" ? "From" : "To"} • {NEXT_PUBLIC_L1_CHAIN_NAME}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => {
                  console.log("Refreshing L1 balance")
                  refetchl1Balance()
                }}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </Button>
            </div>
            <div className="font-mono text-sm font-medium">
              {l1Balance?.formatted ?? "0"} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-muted-foreground">
                {activeTab === "deposit" ? "To" : "From"} • {NEXT_PUBLIC_L2_CHAIN_NAME}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => {
                  console.log("Refreshing L2 balance")
                  refetchl2Balance()
                }}
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </Button>
            </div>
            <div className="font-mono text-sm font-medium">
              {l2Balance?.formatted ?? "0"} {NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL}
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Deposit Status */}
      {activeTab === "deposit" && depositStatus !== "idle" && (
        <div className="rounded-lg border bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 shadow-sm">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="flex h-6 w-6 items-center justify-center">
                  {depositStatus === "completed" && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                      <svg
                        className="h-4 w-4 text-green-600 dark:text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {depositStatus === "failed" && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                      <svg
                        className="h-3 w-3 text-red-600 dark:text-red-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  )}
                  {depositStatus.startsWith("pending") && (
                    <div className="flex h-6 w-6 items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Deposit Status</span>
              </div>
              <Badge
                variant="outline"
                className={`
                  ${depositStatus === "completed" ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/50 dark:text-green-200 dark:border-green-800" : ""}
                  ${depositStatus === "failed" ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-200 dark:border-red-800" : ""}
                  ${depositStatus.startsWith("pending") ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-800" : ""}
                `}
              >
                {depositStatus === "pending_l1" && (
                  <div className="flex items-center space-x-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Confirming on L1</span>
                  </div>
                )}
                {depositStatus === "pending_l2" && (
                  <div className="flex items-center space-x-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Confirming on L2</span>
                  </div>
                )}
                {depositStatus === "completed" && "✅ Completed"}
                {depositStatus === "failed" && (
                  <span className="flex items-center space-x-1">
                    <span>Failed</span>
                  </span>
                )}
              </Badge>
            </div>

            {/* Progress Steps */}
            <div className="space-y-2">
              <div className="flex items-center space-x-3">
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-full ${
                    depositTxHash ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  {depositTxHash ? (
                    <svg
                      className="h-2.5 w-2.5 text-green-600 dark:text-green-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                  )}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">L1 Transaction Submitted</span>
              </div>

              <div className="flex items-center space-x-3">
                <div
                  className={`flex h-4 w-4 items-center justify-center rounded-full ${
                    depositL2TxHash ? "bg-green-100 dark:bg-green-900/50" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  {depositL2TxHash ? (
                    <svg
                      className="h-2.5 w-2.5 text-green-600 dark:text-green-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                  )}
                </div>
                <span className="text-xs text-gray-600 dark:text-gray-400">L2 Transaction Confirmed</span>
              </div>
            </div>

            {/* Transaction Links */}
            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              {depositTxHash && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">L1 Transaction</span>
                  <Link
                    href={`${NEXT_PUBLIC_L1_EXPLORER_URL}/#/tx/${depositTxHash}`}
                    target="_blank"
                    className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
                  >
                    <span className="font-mono">{truncateAddress(depositTxHash as `0x${string}`)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}

              {depositL2TxHash && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">L2 Transaction</span>
                  <Link
                    href={`${NEXT_PUBLIC_L2_EXPLORER_URL}/tx/${depositL2TxHash}`}
                    target="_blank"
                    className="flex items-center space-x-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors"
                  >
                    <span className="font-mono">{truncateAddress(depositL2TxHash as `0x${string}`)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Progress */}
      {activeTab === "withdraw" && withdrawData && withdrawStatus && (
        <WithdrawalProgress
          withdrawalData={withdrawData}
          currentStatus={withdrawStatus}
          isLoading={isLoading}
          timeLeft={timeLeft}
          onProve={handleWithdrawProve}
          onFinalize={handleWithdrawFinalize}
          onUpdateStatus={checkWithdrawalStatus}
        />
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
          disabled={
            isConnected &&
            ((isLoading && chainId === expectedChainId) || // Only disable if loading and on correct network
              (withdrawStatus === "proved" && timeLeft !== "Ready to finalize"))
          }
        >
          {actionButtonText} {withdrawStatus} {timeLeft}
        </Button>

        {/* Error Display - More Attractive */}
        {errorInput && (
          <div className="rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-red-100 p-4 dark:border-red-800 dark:from-red-950/50 dark:to-red-900/30 shadow-sm">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                  <svg
                    className="h-4 w-4 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Transaction Error</h3>
                <p className="mt-1 text-sm text-red-700 dark:text-red-300">{errorInput}</p>
                {(errorInput.includes("switch") || errorInput.includes("network")) && (
                  <div className="mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
                      onClick={() => setErrorInput("")}
                    >
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-300"
                  onClick={() => setErrorInput("")}
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>
            </div>
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

      {/* Enhanced Success/Info Dialog */}
      <Dialog open={!!popupTitle} onOpenChange={() => setPopupTitle("")}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50 mb-4">
              {popupTitle.toLowerCase().includes("success") ? (
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg
                  className="h-6 w-6 text-blue-600 dark:text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">{popupTitle}</DialogTitle>
            <DialogDescription className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {popupDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button
              onClick={() => {
                console.log("Close popup")
                setPopupTitle("")
                setPopupDescription("")
              }}
              className="w-full"
            >
              {popupTitle.toLowerCase().includes("success") ? "Great!" : "Got it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Connection Modal */}
      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>Choose a wallet provider to connect to the bridge.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {connectors.map((connector: any) => (
              <Button
                key={connector.name}
                variant="outline"
                className="h-12 justify-start"
                onClick={() => {
                  console.log("Connector clicked:", connector.name)
                  handleConnectWallet(connector)
                }}
              >
                {connector.icon && (
                  <img
                    src={connector.icon || "/placeholder.svg"}
                    alt={connector.name}
                    width={20}
                    height={20}
                    className="mr-3"
                  />
                )}
                <span>{connector.name}</span>
              </Button>
            ))}
            {!connectors.length && (
              <p className="text-sm text-muted-foreground text-center py-4">No wallet connectors found.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
