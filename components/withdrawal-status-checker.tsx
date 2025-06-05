"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, ExternalLink, AlertCircle, Info } from "lucide-react"
import { useChainConfigs } from "@/hooks/use-chain-configs"
import { db, type WithdrawState } from "@/store/db"
import { WithdrawTxStatus } from "@/components/withdraw-tx-status"
import { truncateAddress } from "@/lib/utils"
import {
  NEXT_PUBLIC_L2_EXPLORER_URL,
  l2Chain,
  NEXT_PUBLIC_L1_CHAIN_ID,
  NEXT_PUBLIC_L1_EXPLORER_URL,
  NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY,
} from "@/config/chains"
import Link from "next/link"
import { useAccount, useSwitchChain } from "wagmi"
import { parseAbiItem, keccak256, serializeTransaction } from "viem"
import { getWithdrawalStatus } from "viem/op-stack"

interface TransactionAnalysis {
  isWithdrawal: boolean
  contractInteractions: string[]
  eventTypes: string[]
  bridgeInteraction: boolean
  messagePasser: boolean
  details: string
  withdrawalHash?: string
}

interface WithdrawalStatusCheckerProps {
  initialHash?: string | null
}

export function WithdrawalStatusChecker({ initialHash }: WithdrawalStatusCheckerProps = {}) {
  const [txHash, setTxHash] = useState(initialHash || "")
  const [isLoading, setIsLoading] = useState(false)
  const [withdrawalData, setWithdrawalData] = useState<WithdrawState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState<string>("")
  const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null)
  const [isCheckingProofStatus, setIsCheckingProofStatus] = useState(false)
  const [debugInfo, setDebugInfo] = useState<any>(null)
  const { publicClientL2, publicClientL1, walletClientL1 } = useChainConfigs()
  const { address, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  const calculateTimeLeft = (timestamp: number) => {
    try {
      const now = Math.floor(Date.now() / 1000)
      const finalizationTime = timestamp + 7 * 24 * 60 * 60 // 7 days in seconds
      const diff = finalizationTime - now

      if (diff <= 0) {
        return "Ready to finalize"
      }

      const days = Math.floor(diff / (24 * 60 * 60))
      const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60))
      const minutes = Math.floor((diff % (60 * 60)) / 60)

      return `${days}d ${hours}h ${minutes}m`
    } catch (error) {
      console.error("Error calculating time left:", error)
      return ""
    }
  }

  // Extract withdrawal hash from MessagePassed event
  const extractWithdrawalHashFromLogs = (receipt: any): string | null => {
    const l2ToL1MessagePasserAddress = "0x4200000000000000000000000000000000000016"
    const messagePassedTopic = "0x02a52367d10742d8032712c1bb8e0144ff1ec5ffda1ed7d70bb05a2744955054"

    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() === l2ToL1MessagePasserAddress.toLowerCase() &&
        log.topics &&
        log.topics[0] === messagePassedTopic
      ) {
        try {
          if (log.data && log.data !== "0x") {
            const dataHex = log.data.slice(2)
            if (dataHex.length >= 64) {
              const withdrawalHash = "0x" + dataHex.slice(-64)
              if (withdrawalHash !== "0x000000000000000000000000000000000000000000000000000000000000000") {
                return withdrawalHash
              }
            }
          }
        } catch (error) {
          console.error("Error decoding withdrawal hash:", error)
        }
      }
    }
    return null
  }

  const analyzeTransaction = (tx: any, receipt: any): TransactionAnalysis => {
    const l2BridgeAddress = "0x4200000000000000000000000000000000000010"

    // L2ToL1MessagePasser contract address - used for ETH withdrawals
    const l2ToL1MessagePasserAddress = "0x4200000000000000000000000000000000000016"

    // Get all contract interactions
    const contractInteractions = receipt.logs.map((log: any) => log.address.toLowerCase())
    const uniqueContracts = [...new Set(contractInteractions)]

    // Check for bridge interaction
    const bridgeInteraction = contractInteractions.includes(l2BridgeAddress)

    // Check for message passer interaction (direct ETH withdrawals)
    const messagePasserInteraction = contractInteractions.includes(l2ToL1MessagePasserAddress)

    // Get event types
    const eventTypes: string[] = []

    // Check for withdrawal-related events
    let hasWithdrawalEvent = false
    let withdrawalHash: string | undefined

    // Check for WithdrawalInitiated event from bridge
    const bridgeWithdrawalEvent = receipt.logs.some((log: any) => {
      if (log.address.toLowerCase() === l2BridgeAddress) {
        const withdrawalEventTopic = "0x73d170910aba9e6d50b102db522b1dbcd796216f5128b445aa2135272886497e"
        if (log.topics && log.topics[0] === withdrawalEventTopic) {
          eventTypes.push("WithdrawalInitiated")
          return true
        }
      }
      return false
    })

    // Check for MessagePassed event from L2ToL1MessagePasser
    const messagePasserEvent = receipt.logs.some((log: any) => {
      if (log.address.toLowerCase() === l2ToL1MessagePasserAddress) {
        const messagePassedTopic = "0x02a52367d10742d8032712c1bb8e0144ff1ec5ffda1ed7d70bb05a2744955054"
        if (log.topics && log.topics[0] === messagePassedTopic) {
          eventTypes.push("MessagePassed")
          return true
        }
      }
      return false
    })

    // Extract withdrawal hash if this is a MessagePassed event
    if (messagePasserEvent) {
      withdrawalHash = extractWithdrawalHashFromLogs(receipt) || undefined
    }

    // A transaction is a withdrawal if it either:
    // 1. Has a WithdrawalInitiated event from the bridge, OR
    // 2. Has a MessagePassed event from the L2ToL1MessagePasser
    hasWithdrawalEvent = bridgeWithdrawalEvent || messagePasserEvent

    let details = ""
    if (!bridgeInteraction && !messagePasserInteraction) {
      details = `Transaction did not interact with L2 Standard Bridge (${l2BridgeAddress}) or L2ToL1MessagePasser (${l2ToL1MessagePasserAddress}). Interacted with: ${uniqueContracts.join(", ")}`
    } else if (!hasWithdrawalEvent) {
      details = `Transaction interacted with bridge or message passer but no withdrawal events found. This might be a deposit or other operation.`
    } else if (messagePasserEvent) {
      details = "Valid ETH withdrawal transaction found! (via L2ToL1MessagePasser)"
    } else {
      details = "Valid token withdrawal transaction found! (via L2StandardBridge)"
    }

    return {
      isWithdrawal: hasWithdrawalEvent,
      contractInteractions: uniqueContracts,
      eventTypes,
      bridgeInteraction,
      messagePasser: messagePasserInteraction,
      details,
      withdrawalHash,
    }
  }

  // Function to get withdrawal status using viem's getWithdrawalStatus
  const getViemWithdrawalStatus = async (receipt: any) => {
    if (!publicClientL1) {
      console.error("L1 client not available")
      return {
        status: null,
        isProven: false,
        isFinalized: false,
        provenTimestamp: 0,
        error: "L1 client not available",
      }
    }

    try {
      console.log("Getting withdrawal status using viem's getWithdrawalStatus")
      console.log("receipt--->",receipt)

      
      const status = await getWithdrawalStatus(publicClientL1, {
        receipt,
        targetChain: l2Chain,
      })

      console.log("Viem withdrawal status:", status)

      return {
        status,
        isProven: status === "ready-to-finalize" || status === "finalized" || status ==="waiting-to-finalize",
        isFinalized: status === "finalized",
        provenTimestamp: 0, // viem doesn't provide timestamp directly
        error: null,
      }
    } catch (error) {
      console.error("Error in getWithdrawalStatus:", error)
      return {
        status: null,
        isProven: false,
        isFinalized: false,
        provenTimestamp: 0,
        error: error instanceof Error ? error.message : "Unknown error getting withdrawal status",
      }
    }
  }

  // Function to find the proof transaction for a withdrawal
  const findProofTransactionForWithdrawal = async (withdrawalHash: `0x${string}`) => {
    if (!publicClientL1) {
      console.log("Missing L1 client")
      return null
    }

    try {
      console.log("Looking for proof transaction for withdrawal:", withdrawalHash)

      // Get current block
      const currentBlock = await publicClientL1.getBlockNumber()
      // Search a smaller range to avoid RPC limits - only last 5000 blocks for fallback
      const searchFromBlock = currentBlock > 5000n ? currentBlock - 5000n : 0n

      console.log(`Searching for WithdrawalProven events from block ${searchFromBlock} to ${currentBlock}`)

      // Try the most common event signature first
      const eventSignature =
        "event WithdrawalProven(bytes32 indexed withdrawalHash, address indexed from, address indexed to)"

      try {
        console.log(`Searching with event signature: ${eventSignature}`)

        // Get WithdrawalProven events from the OptimismPortal contract
        const provenLogs = await publicClientL1.getLogs({
          address: NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`,
          event: parseAbiItem(eventSignature),
          args: {
            withdrawalHash,
          },
          fromBlock: searchFromBlock,
          toBlock: currentBlock,
        })

        console.log(`Found ${provenLogs.length} WithdrawalProven events for this withdrawal hash`)

        if (provenLogs.length > 0) {
          const log = provenLogs[0]
          const proveBlock = await publicClientL1.getBlock({ blockNumber: log.blockNumber })

          return {
            proveHash: log.transactionHash,
            proveTime: Number(proveBlock.timestamp),
          }
        }
      } catch (error) {
        console.error(`Error searching with event signature:`, error)
      }

      return null
    } catch (error) {
      console.error("Error finding proof transaction:", error)
      return null
    }
  }

  // Simplified function to check withdrawal status without using viem's getWithdrawalStatus
  const checkWithdrawalStatus = async (withdrawalHash: `0x${string}`, receipt?: any) => {
    if (!publicClientL1) {
      console.error("L1 client not available")
      return {
        isProven: false,
        isFinalized: false,
        provenTimestamp: 0,
        error: "L1 client not available",
      }
    }

    try {
      console.log("Checking withdrawal status for hash:", withdrawalHash)

      // Skip viem's getWithdrawalStatus and go directly to event-based checking
      console.log("Using event-based withdrawal status checking")

      const proveInfo = await findProofTransactionForWithdrawal(withdrawalHash)

      if (proveInfo) {
        console.log("Found proof transaction via events:", proveInfo)

        // Check if it's been 7 days since proving for finalization
        const now = Math.floor(Date.now() / 1000)
        const daysSinceProof = (now - proveInfo.proveTime) / (24 * 60 * 60)
        const isFinalized = daysSinceProof >= 7

        return {
          isProven: true,
          isFinalized,
          provenTimestamp: proveInfo.proveTime,
          error: null,
          viemStatus: isFinalized ? "finalized" : "waiting-to-finalize",
        }
      } else {
        console.log("No proof transaction found, withdrawal likely not proven yet")

        // Check if withdrawal is ready to prove by checking L2 block age
        if (receipt) {
          const l2Block = await publicClientL2?.getBlock({ blockNumber: receipt.blockNumber })
          if (l2Block) {
            const now = Math.floor(Date.now() / 1000)
            const blockAge = now - Number(l2Block.timestamp)
            const isReadyToProve = blockAge > 3600 // 1 hour

            return {
              isProven: false,
              isFinalized: false,
              provenTimestamp: 0,
              error: null,
              viemStatus: isReadyToProve ? "ready-to-prove" : "waiting-to-prove",
            }
          }
        }

        return {
          isProven: false,
          isFinalized: false,
          provenTimestamp: 0,
          error: null,
          viemStatus: "ready-to-prove",
        }
      }
    } catch (error) {
      console.error("Error checking withdrawal status:", error)
      return {
        isProven: false,
        isFinalized: false,
        provenTimestamp: 0,
        error: error instanceof Error ? error.message : "Unknown error checking withdrawal status",
        viemStatus: null,
      }
    }
  }

  // Function to check if a withdrawal is ready to prove
  const isWithdrawalReadyToProve = async (l2BlockNumber: bigint) => {
    if (!publicClientL2) return false

    try {
      const currentL2Block = await publicClientL2.getBlockNumber()
      const blocksSinceWithdrawal = currentL2Block - l2BlockNumber

      // Typically need to wait ~1 hour (about 64 blocks on L2)
      return blocksSinceWithdrawal > 64n
    } catch (error) {
      console.error("Error checking if withdrawal is ready to prove:", error)
      return false
    }
  }

  // Complete function to check withdrawal status and update UI
  const checkCompleteWithdrawalStatus = async (withdrawalData: WithdrawState) => {
    if (!publicClientL1 || !withdrawalData.withdrawalReceipt) {
      return false
    }

    try {
      setIsCheckingProofStatus(true)
      console.log("Checking complete withdrawal status...")

      // Get the L2 transaction
      const l2Tx = await publicClientL2.getTransaction({ hash: withdrawalData.withdrawalHash as `0x${string}` })
      if (!l2Tx) {
        throw new Error("L2 transaction not found")
      }

      // Extract withdrawal hash from the transaction analysis
      const txAnalysis = analyzeTransaction(l2Tx, withdrawalData.withdrawalReceipt)
      let withdrawalHash: `0x${string}`

      if (txAnalysis.withdrawalHash) {
        withdrawalHash = txAnalysis.withdrawalHash as `0x${string}`
        console.log("Using withdrawal hash from logs:", withdrawalHash)
      } else {
        // Fallback to computing from transaction
        withdrawalHash = keccak256(
          serializeTransaction({
            to: l2Tx.to,
            from: l2Tx.from,
            gas: l2Tx.gas,
            gasPrice: l2Tx.gasPrice,
            value: l2Tx.value,
            nonce: l2Tx.nonce,
            data: l2Tx.input,
            chainId: l2Tx.chainId,
          }),
        )
        console.log("Computed withdrawal hash from transaction:", withdrawalHash)
      }

      // Check if the withdrawal is ready to prove
      const readyToProve = await isWithdrawalReadyToProve(l2Tx.blockNumber!)
      console.log("Is ready to prove:", readyToProve)

      console.log('withdrawalData.withdrawalReceipt', withdrawalData.withdrawalReceipt)
      // Replace the existing getWithdrawalStatus call with:
      const {
        status: viemStatus,
        isProven,
        isFinalized,
        provenTimestamp,
        error: statusError,
      } = await getViemWithdrawalStatus(withdrawalData.withdrawalReceipt)
      console.log("Withdrawal status:", { isProven, isFinalized, provenTimestamp, statusError, viemStatus })

      // Find the proof transaction if the withdrawal is proven
      let proveInfo = null
      if (isProven) {
        proveInfo = await findProofTransactionForWithdrawal(withdrawalHash)
        console.log("Proof transaction info:", proveInfo)
      }

      // Set debug info
      setDebugInfo({
        withdrawalHash,
        l2TxHash: withdrawalData.withdrawalHash,
        isProven,
        isFinalized,
        provenTimestamp,
        proveInfo,
        readyToProve,
        statusError,
        viemStatus,
      })

      // Determine the status
      let status: WithdrawState["status"] = "initiated"

      if (isFinalized) {
        status = "finalized"
      } else if (isProven) {
        status = "proved"
      } else if (readyToProve) {
        status = "ready_to_prove"
      } else {
        status = "initiated"
      }

      // Update the withdrawal data
      const updatedWithdrawal = {
        ...withdrawalData,
        status,
        updatedAt: new Date(),
      }

      // Add proof information if available
      if (proveInfo) {
        updatedWithdrawal.proveHash = proveInfo.proveHash
        updatedWithdrawal.createdAt = new Date(proveInfo.proveTime * 1000)
      } else if (isProven && provenTimestamp > 0) {
        // If we couldn't find the proof transaction but know it's proven, use the timestamp from the contract
        updatedWithdrawal.createdAt = new Date(provenTimestamp * 1000)
      }

      // Save to database if it exists there
      if (withdrawalData.id) {
        await db.withdraws.where("withdrawalHash").equals(withdrawalData.withdrawalHash).modify({
          status,
          proveHash: updatedWithdrawal.proveHash,
          createdAt: updatedWithdrawal.createdAt,
          updatedAt: new Date(),
        })
      }

      setWithdrawalData(updatedWithdrawal)

      // Update time left if the withdrawal is proved
      if (status === "proved" && provenTimestamp > 0) {
        setTimeLeft(calculateTimeLeft(provenTimestamp))
      }

      console.log("Updated withdrawal status to:", status)
      return isProven || isFinalized
    } catch (error) {
      console.error("Error in checkCompleteWithdrawalStatus:", error)
      return false
    } finally {
      setIsCheckingProofStatus(false)
    }
  }

  const handleProveWithdrawal = async () => {
    if (!withdrawalData || !withdrawalData.output || !withdrawalData.withdrawal || !walletClientL1) {
      setError("Missing withdrawal data or wallet client for proving")
      return
    }

    try {
      setIsLoading(true)
      console.log("Starting prove withdrawal process...", withdrawalData.output, withdrawalData.withdrawal)

      // Build prove arguments

     const proveArgs = await publicClientL2.buildProveWithdrawal({
        output: withdrawalData.output,
        withdrawal: withdrawalData.withdrawal,
      })

      console.log("Built prove args:", proveArgs)

      // Switch to L1 chain
      await switchChain({
        chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID),
      })

      // Get account
      if (!window.ethereum) {
        throw new Error("No Ethereum provider found")
      }

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      })

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found")
      }

      const account = accounts[0]

      console.log('account--->',account)

      // Execute prove transaction
      const proveHash = await walletClientL1.proveWithdrawal({
        ...proveArgs,
        authorizationList: [],
        account,
      })

      console.log("Prove transaction hash:", proveHash)

      // Update withdrawal data
      const updatedWithdrawal = {
        ...withdrawalData,
        status: "proving" as const,
        proveHash,
        proveArgs,
        updatedAt: new Date(),
      }

      // Update database
      if (withdrawalData.id) {
        await db.withdraws.where("withdrawalHash").equals(withdrawalData.withdrawalHash).modify({
          status: "proving",
          proveHash,
          proveArgs,
          updatedAt: new Date(),
        })
      }

      setWithdrawalData(updatedWithdrawal)

      // Wait for prove transaction to be mined
      const proveReceipt = await publicClientL1.waitForTransactionReceipt({
        hash: proveHash,
      })

      console.log("Prove transaction mined:", proveReceipt)

      // Update to proved status
      const provedWithdrawal = {
        ...updatedWithdrawal,
        status: "proved" as const,
        proveReceipt,
        createdAt: new Date(), // Use current time as the prove time
        updatedAt: new Date(),
      }

      // Update database
      if (withdrawalData.id) {
        await db.withdraws.where("withdrawalHash").equals(withdrawalData.withdrawalHash).modify({
          status: "proved",
          proveReceipt,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      setWithdrawalData(provedWithdrawal)

      // Calculate time left for finalization
      setTimeLeft(calculateTimeLeft(Math.floor(Date.now() / 1000)))
    } catch (error) {
      console.error("Error proving withdrawal:", error)
      if (error instanceof Error) {
        if (error.message.includes("User rejected") || error.message.includes("User denied")) {
          setError("Transaction was cancelled by user")
        } else {
          setError(`Failed to prove withdrawal: ${error.message}`)
        }
      } else {
        setError("Failed to prove withdrawal")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const checkTxWithdrawalStatus = async () => {
    if (!txHash.trim()) {
      setError("Please enter a transaction hash")
      return
    }

    if (!txHash.startsWith("0x") || txHash.length !== 66) {
      setError("Please enter a valid transaction hash (0x...)")
      return
    }

    setIsLoading(true)
    setError(null)
    setWithdrawalData(null)
    setAnalysis(null)
    setDebugInfo(null)

    try {
      console.log("Checking withdrawal status for:", txHash)

      // First, check local database
      try {
        const localWithdrawal = await db.withdraws.where("withdrawalHash").equals(txHash.toLowerCase()).first()

        if (localWithdrawal) {
          console.log("Found withdrawal in local database:", localWithdrawal)
          setWithdrawalData(localWithdrawal)

          if (localWithdrawal.status === "proved" && localWithdrawal.createdAt) {
            setTimeLeft(calculateTimeLeft(Math.floor(localWithdrawal.createdAt.getTime() / 1000)))
          }

          // Always check complete status for any withdrawal
          await checkCompleteWithdrawalStatus(localWithdrawal)
          return
        }
      } catch (dbError) {
        console.error("Error checking local database:", dbError)
        // Continue to blockchain check
      }

      // If not in local DB, try to fetch from blockchain
      if (!publicClientL2) {
        throw new Error("L2 client not available")
      }

      console.log("Fetching transaction from blockchain...")

      const [tx, receipt] = await Promise.all([
        publicClientL2.getTransaction({ hash: txHash as `0x${string}` }).catch(() => null),
        publicClientL2.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null),
      ])

      if (!tx || !receipt) {
        throw new Error(
          "Transaction not found on L2. Please verify the transaction hash and ensure it's from the L2 network (OptiPulse Testnet).",
        )
      }

      console.log("Transaction found:", tx)
      console.log("Receipt logs:", receipt.logs)

      // Analyze the transaction
      const txAnalysis = analyzeTransaction(tx, receipt)
      setAnalysis(txAnalysis)

      if (!txAnalysis.isWithdrawal) {
        throw new Error(txAnalysis.details)
      }

      // Get withdrawal hash from analysis or compute it
      let withdrawalHash: `0x${string}`

      if (txAnalysis.withdrawalHash) {
        withdrawalHash = txAnalysis.withdrawalHash as `0x${string}`
        console.log("Using withdrawal hash from logs:", withdrawalHash)
      } else {
        // Fallback to computing from transaction
        withdrawalHash = keccak256(
          serializeTransaction({
            to: tx.to,
            from: tx.from,
            gas: tx.gas,
            gasPrice: tx.gasPrice,
            value: tx.value,
            nonce: tx.nonce,
            data: tx.input,
            chainId: tx.chainId,
          }),
        )
        console.log("Computed withdrawal hash from transaction:", withdrawalHash)
      }

      console.log("Final withdrawal hash being used:", withdrawalHash)

      // Check if the withdrawal is ready to prove
      const readyToProve = await isWithdrawalReadyToProve(tx.blockNumber!)
      console.log("Is ready to prove:", readyToProve)

      // Replace the existing getWithdrawalStatus call with:
      const {
        status: viemStatus,
        isProven,
        isFinalized,
        provenTimestamp,
        error: statusError,
      } = await getViemWithdrawalStatus(receipt)

      console.log("Withdrawal status:", { isProven, isFinalized, provenTimestamp, statusError, viemStatus })

      // Find the proof transaction if the withdrawal is proven
      let proveInfo = null
      if (isProven) {
        proveInfo = await findProofTransactionForWithdrawal(withdrawalHash)
        console.log("Proof transaction info:", proveInfo)
      }

      // Set debug info
      setDebugInfo({
        withdrawalHash,
        l2TxHash: txHash,
        isProven,
        isFinalized,
        provenTimestamp,
        proveInfo,
        readyToProve,
        statusError,
        viemStatus,
      })

      // Determine the status
      let status: WithdrawState["status"] = "initiated"

      if (isFinalized) {
        status = "finalized"
      } else if (isProven) {
        status = "proved"
      } else if (readyToProve) {
        status = "ready_to_prove"
      } else {
        status = "initiated"
      }

      // Create a basic withdrawal data structure
      const basicWithdrawal: WithdrawState = {
        withdrawalHash: txHash,
        address: tx.from,
        status,
        args: {
          request: {
            value: tx.value || 0n,
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        withdrawalReceipt: receipt,
      }

      // Add proof information if available
      if (proveInfo) {
        basicWithdrawal.proveHash = proveInfo.proveHash
        basicWithdrawal.createdAt = new Date(proveInfo.proveTime * 1000)
      } else if (isProven && provenTimestamp > 0) {
        // If we couldn't find the proof transaction but know it's proven, use the timestamp from the contract
        basicWithdrawal.createdAt = new Date(provenTimestamp * 1000)
      }

      setWithdrawalData(basicWithdrawal)

      // Update time left if the withdrawal is proved
      if (status === "proved" && provenTimestamp > 0) {
        setTimeLeft(calculateTimeLeft(provenTimestamp))
      }

      // Try to get the output and withdrawal data if needed for proving
      if (status === "ready_to_prove") {
        try {
          const { output, withdrawal } = await publicClientL1.waitToProve({
            receipt,
            targetChain: l2Chain,
          })

          basicWithdrawal.output = output
          basicWithdrawal.withdrawal = withdrawal
        } catch (error) {
          console.error("Error getting output and withdrawal data:", error)
        }
      }
    } catch (error) {
      console.error("Error checking withdrawal status:", error)
      if (error instanceof Error) {
        setError(error.message)
      } else {
        setError("Failed to check withdrawal status")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    setTxHash(value)
    setError(null)
    setWithdrawalData(null)
    setTimeLeft("")
    setAnalysis(null)
    setDebugInfo(null)
  }

  useEffect(() => {
    if (initialHash && initialHash.trim()) {
      setTxHash(initialHash.trim())
      // Auto-check the withdrawal status when hash is provided via URL
      setTimeout(() => {
        checkTxWithdrawalStatus()
      }, 500)
    }
  }, [initialHash])

  // Update time left every second when withdrawal is proved
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (withdrawalData?.status === "proved" && withdrawalData?.createdAt) {
      // Update immediately
      setTimeLeft(calculateTimeLeft(Math.floor(withdrawalData.createdAt.getTime() / 1000)))

      // Then update every second
      interval = setInterval(() => {
        setTimeLeft(calculateTimeLeft(Math.floor(withdrawalData.createdAt.getTime() / 1000)))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [withdrawalData])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Check Withdrawal Status</CardTitle>
        <CardDescription>Enter a withdrawal transaction hash to check its current status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="txHash">Transaction Hash</Label>
          <div className="flex gap-2">
            <Input
              id="txHash"
              placeholder="0xe2e24f24e25ba4317b2611af23294be20fa30383ebccfc573fce3acf36eb114c"
              value={txHash}
              onChange={handleInputChange}
              className="font-mono text-sm"
            />
            <Button onClick={checkTxWithdrawalStatus} disabled={isLoading || !txHash.trim()} size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            {txHash && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTxHash("")
                  setWithdrawalData(null)
                  setError(null)
                  setAnalysis(null)
                  setTimeLeft("")
                  setDebugInfo(null)
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Debug Information */}
        {debugInfo && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-950/50">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm text-purple-800 dark:text-purple-200 font-medium">Debug Information</p>
                <div className="text-xs text-purple-700 dark:text-purple-300 space-y-1 font-mono">
                  <p>
                    <strong>Contract:</strong> OptimismPortal ({NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY})
                  </p>
                  <p>
                    <strong>L2 Tx Hash:</strong> {debugInfo.l2TxHash}
                  </p>
                  <p>
                    <strong>Withdrawal Hash:</strong> {debugInfo.withdrawalHash}
                  </p>
                  {debugInfo.viemStatus && (
                    <p>
                      <strong>Status:</strong> {debugInfo.viemStatus}
                    </p>
                  )}
                  <p>
                    <strong>Is Proven:</strong> {debugInfo.isProven ? "✅ Yes" : "❌ No"}
                  </p>
                  <p>
                    <strong>Is Finalized:</strong> {debugInfo.isFinalized ? "✅ Yes" : "❌ No"}
                  </p>
                  <p>
                    <strong>Proven Timestamp:</strong> {debugInfo.provenTimestamp || "N/A"}
                  </p>
                  <p>
                    <strong>Ready to Prove:</strong> {debugInfo.readyToProve ? "✅ Yes" : "❌ No"}
                  </p>
                  {debugInfo.proveInfo && (
                    <>
                      <p>
                        <strong>Prove Tx Hash:</strong> {debugInfo.proveInfo.proveHash}
                      </p>
                      <p>
                        <strong>Prove Time:</strong> {new Date(debugInfo.proveInfo.proveTime * 1000).toISOString()}
                      </p>
                    </>
                  )}
                  {debugInfo.statusError && (
                    <p>
                      <strong>Status Error:</strong> {debugInfo.statusError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator for proof status check */}
        {isCheckingProofStatus && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Checking withdrawal status using event-based method...
              </p>
            </div>
          </div>
        )}

        {/* Transaction Analysis */}
        {analysis && !withdrawalData && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50">
            <div className="flex items-start space-x-2">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">Transaction Analysis</p>
                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <p>
                    <strong>Bridge Interaction:</strong> {analysis.bridgeInteraction ? "✅ Yes" : "❌ No"}
                  </p>
                  <p>
                    <strong>MessagePasser Interaction:</strong> {analysis.messagePasser ? "✅ Yes" : "❌ No"}
                  </p>
                  <p>
                    <strong>Contract Interactions:</strong> {analysis.contractInteractions.join(", ")}
                  </p>
                  {analysis.eventTypes.length > 0 && (
                    <p>
                      <strong>Events Found:</strong> {analysis.eventTypes.join(", ")}
                    </p>
                  )}
                  {analysis.withdrawalHash && (
                    <p className="font-mono">
                      <strong>Withdrawal Hash:</strong> {analysis.withdrawalHash}
                    </p>
                  )}
                  <p>
                    <strong>Details:</strong> {analysis.details}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/50">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                <div className="text-xs text-red-700 dark:text-red-300">
                  <p>
                    <strong>Expected:</strong> Transaction to either:
                  </p>
                  <p>- L2 Standard Bridge (0x4200000000000000000000000000000000000010) OR</p>
                  <p>- L2ToL1MessagePasser (0x4200000000000000000000000000000000000016)</p>
                  <p>
                    <strong>Required:</strong> WithdrawalInitiated or MessagePassed event
                  </p>
                  <p>
                    <strong>Network:</strong> OptiPulse Testnet (L2)
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
          <div className="flex items-start space-x-2">
            <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                How withdrawals work on OptiPulse:
              </p>
              <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                <p>
                  <strong>ETH/Native Token Withdrawals:</strong> Interact with L2ToL1MessagePasser (0x4200...0016)
                </p>
                <p>
                  <strong>Token Withdrawals:</strong> Interact with L2StandardBridge (0x4200...0010)
                </p>
                <p>
                  <strong>Status Checking:</strong> Uses event-based detection to avoid contract call issues
                </p>
              </div>
            </div>
          </div>
        </div>

        {withdrawalData && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Transaction Hash</span>
                  <Link
                    href={`${NEXT_PUBLIC_L2_EXPLORER_URL}/tx/${withdrawalData.withdrawalHash}`}
                    target="_blank"
                    className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <span className="font-mono">{truncateAddress(withdrawalData.withdrawalHash as `0x${string}`)}</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">From Address</span>
                  <span className="font-mono text-sm">{truncateAddress(withdrawalData.address as `0x${string}`)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge variant="outline" className="capitalize">
                    {withdrawalData.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                {withdrawalData.status === "proved" && timeLeft && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Time to Finalize</span>
                    <Badge variant="outline" className="text-xs">
                      {timeLeft}
                    </Badge>
                  </div>
                )}

                {withdrawalData.proveHash && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Prove Transaction</span>
                    <Link
                      href={`${NEXT_PUBLIC_L1_EXPLORER_URL}/tx/${withdrawalData.proveHash}`}
                      target="_blank"
                      className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="font-mono">{truncateAddress(withdrawalData.proveHash as `0x${string}`)}</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/50 p-4">
              <WithdrawTxStatus
                currentStep={withdrawalData.status}
                withdrawalHash={withdrawalData.withdrawalHash}
                proveHash={withdrawalData.proveHash}
                finalizeHash={withdrawalData.finalizeHash}
                isLoading={isLoading}
                timeLeft={timeLeft}
              />
            </div>

            {/* Prove button for ready_to_prove status */}
            {withdrawalData.status === "ready_to_prove" && isConnected && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/50">
                <div className="space-y-3">
                  <div className="flex items-start space-x-2">
                    <Info className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                        Ready to Prove Withdrawal
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                        Your withdrawal is ready to be proved on L1. Click the button below to submit the proof
                        transaction.
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleProveWithdrawal} disabled={isLoading} className="w-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Proving Withdrawal...
                      </>
                    ) : (
                      "Prove Withdrawal"
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Connect wallet message for ready_to_prove status */}
            {withdrawalData.status === "ready_to_prove" && !isConnected && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
                <div className="flex items-start space-x-2">
                  <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Connect Wallet to Prove</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Connect your wallet using the header to prove this withdrawal on L1.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
