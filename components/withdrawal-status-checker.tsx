"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, Info } from "lucide-react"
import { useChainConfigs } from "@/hooks/use-chain-configs"
import { db, type WithdrawStatus, type WithdrawState } from "@/store/db"
import { l2Chain, NEXT_PUBLIC_L1_CHAIN_ID, NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY } from "@/config/chains"
import { useAccount, useSwitchChain } from "wagmi"
import { getWithdrawalStatus } from "viem/op-stack"
import { WithdrawalProgress } from "@/components/withdrawal-progress"
import { useToast } from "@/hooks/use-toast"
import { parseAbiItem } from "viem"

// Constants
const L2_BRIDGE_ADDRESS = "0x4200000000000000000000000000000000000010"
const L2_TO_L1_MESSAGE_PASSER = "0x4200000000000000000000000000000000000016"
const WITHDRAWAL_INITIATED_TOPIC = "0x73d170910aba9e6d50b102db522b1dbcd796216f5128b445aa2135272886497e"
const MESSAGE_PASSED_TOPIC = "0x02a52367d10742d8032712c1bb8e0144ff1ec5ffda1ed7d70bb05a2744955054"
const BLOCKS_TO_WAIT_FOR_PROOF = 64n
const FINALIZATION_PERIOD = 7 * 24 * 60 * 60 // 7 days in seconds
const MAX_BLOCKS_PER_QUERY = 20000n // Maximum blocks we can query at once

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
  const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null)
  const [isCheckingProofStatus, setIsCheckingProofStatus] = useState(false)
  const [searchProgress, setSearchProgress] = useState("")
  const [timeLeft, setTimeLeft] = useState("")
  const [currentStatus, setCurrentStatus] = useState<WithdrawStatus | null>(null)

  const { publicClientL1, publicClientL2, walletClientL1 } = useChainConfigs()
  const { address, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { toast } = useToast()

  const calculateTimeLeft = useCallback((timestamp: number) => {
    const now = Math.floor(Date.now() / 1000)
    const finalizationTime = timestamp + FINALIZATION_PERIOD
    const diff = finalizationTime - now

    if (diff <= 0) return "Ready to finalize"

    const days = Math.floor(diff / (24 * 60 * 60))
    const hours = Math.floor((diff % (24 * 60 * 60)) / (60 * 60))
    const minutes = Math.floor((diff % (60 * 60)) / 60)

    return `${days}d ${hours}h ${minutes}m`
  }, [])

  const extractWithdrawalHashFromLogs = useCallback((receipt: any): string | null => {
    const messagePasserLog = receipt.logs.find(
      (log: any) =>
        log.address.toLowerCase() === L2_TO_L1_MESSAGE_PASSER.toLowerCase() &&
        log.topics?.[0] === MESSAGE_PASSED_TOPIC
    )

    if (!messagePasserLog || !messagePasserLog.data || messagePasserLog.data === "0x") {
      return null
    }

    try {
      const dataHex = messagePasserLog.data.slice(2)
      if (dataHex.length >= 64) {
        const withdrawalHash = "0x" + dataHex.slice(-64)
        if (withdrawalHash !== "0x000000000000000000000000000000000000000000000000000000000000000") {
          return withdrawalHash
        }
      }
    } catch (error) {
      console.error("Error decoding withdrawal hash:", error)
    }

    return null
  }, [])

  const analyzeTransaction = useCallback(
    (tx: any, receipt: any): TransactionAnalysis => {
      const contractInteractions = receipt.logs.map((log: any) => log.address.toLowerCase())
      const uniqueContracts = [...new Set(contractInteractions)]
      
      const bridgeInteraction = contractInteractions.includes(L2_BRIDGE_ADDRESS)
      const messagePasserInteraction = contractInteractions.includes(L2_TO_L1_MESSAGE_PASSER)

      const eventTypes: string[] = []
      const bridgeWithdrawalEvent = receipt.logs.some((log: any) => {
        if (log.address.toLowerCase() === L2_BRIDGE_ADDRESS && log.topics?.[0] === WITHDRAWAL_INITIATED_TOPIC) {
          eventTypes.push("WithdrawalInitiated")
          return true
        }
        return false
      })

      const messagePasserEvent = receipt.logs.some((log: any) => {
        if (log.address.toLowerCase() === L2_TO_L1_MESSAGE_PASSER && log.topics?.[0] === MESSAGE_PASSED_TOPIC) {
          eventTypes.push("MessagePassed")
          return true
        }
        return false
      })

      const hasWithdrawalEvent = bridgeWithdrawalEvent || messagePasserEvent
      const withdrawalHash = messagePasserEvent ? extractWithdrawalHashFromLogs(receipt) : undefined

      let details = ""
      if (!bridgeInteraction && !messagePasserInteraction) {
        details = `Transaction did not interact with L2 Standard Bridge (${L2_BRIDGE_ADDRESS}) or L2ToL1MessagePasser (${L2_TO_L1_MESSAGE_PASSER}). Interacted with: ${uniqueContracts.join(", ")}`
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
    },
    [extractWithdrawalHashFromLogs],
  )

  const getViemWithdrawalStatus = useCallback(
    async (receipt: any) => {
      if (!publicClientL1) {
        return {
          status: null,
          isProven: false,
          isFinalized: false,
          provenTimestamp: 0,
          error: "L1 client not available",
        }
      }

      try {
        const status = await getWithdrawalStatus(publicClientL1, {
          receipt,
          targetChain: l2Chain,
        })
        console.log('status--->',status);

        return {
          status,
          isProven: status === "ready-to-finalize" || status === "finalized" || status === "waiting-to-finalize",
          isFinalized: status === "finalized",
          provenTimestamp: 0,
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
    },
    [publicClientL1],
  )

  const searchLogsInChunks = useCallback(
    async (
      realWithdrawalHash: `0x${string}`,
      fromBlock: bigint,
      toBlock: bigint,
      eventSignature: string,
      progressPrefix: string,
    ) => {
      const totalBlocks = toBlock - fromBlock
      const chunks = Math.ceil(Number(totalBlocks) / Number(MAX_BLOCKS_PER_QUERY))

      for (let i = 0; i < chunks; i++) {
        const chunkFromBlock = fromBlock + BigInt(i) * MAX_BLOCKS_PER_QUERY
        const chunkToBlock = i === chunks - 1 ? toBlock : chunkFromBlock + MAX_BLOCKS_PER_QUERY - 1n

        setSearchProgress(`${progressPrefix} - Chunk ${i + 1}/${chunks} (blocks ${chunkFromBlock}-${chunkToBlock})`)

        try {
          const provenLogs = await publicClientL1!.getLogs({
            address: NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`,
            event: parseAbiItem(eventSignature),
            args: {
              withdrawalHash: realWithdrawalHash,
            },
            fromBlock: chunkFromBlock,
            toBlock: chunkToBlock,
          })

          if (provenLogs.length > 0) {
            return provenLogs
          }
        } catch (error) {
          console.error(`Error searching chunk ${i + 1}:`, error)
        }
      }

      return []
    },
    [publicClientL1],
  )

  const findProofTransactionForWithdrawal = useCallback(
    async (l2TxHash: `0x${string}`, forceRefresh = false) => {
      if (!publicClientL1 || !publicClientL2) {
        console.log("Missing L1 or L2 client")
        return null
      }

      try {
        setSearchProgress("Getting withdrawal data...")

        // First get the L2 transaction receipt to extract the real withdrawal hash
        const receipt = await publicClientL2.getTransactionReceipt({
          hash: l2TxHash,
        })

        // Get the withdrawal data which contains the real withdrawal hash
        const { output, withdrawal } = await publicClientL1.waitToProve({
          receipt: receipt,
          targetChain: l2Chain,
        })

        const realWithdrawalHash = withdrawal.withdrawalHash

        // Check if we already have this data in the database (unless forcing refresh)
        if (!forceRefresh) {
          const existingWithdrawal = await db.withdraws.where("withdrawalHash").equals(l2TxHash.toLowerCase()).first()

          if (existingWithdrawal?.proveHash && existingWithdrawal.proveTimestamp) {
            setSearchProgress("")
            return {
              proveHash: existingWithdrawal.proveHash,
              proveTime: Math.floor(new Date(existingWithdrawal.proveTimestamp).getTime() / 1000),
            }
          }
        }

        // Get current block
        const currentBlock = await publicClientL1.getBlockNumber()
        const eventSignature =
          "event WithdrawalProven(bytes32 indexed withdrawalHash, address indexed from, address indexed to)"

        // Progressive search with chunking
        const searchRanges = [
          { blocks: 648000n, name: "3 months" }, // ~3 months
          { blocks: 1296000n, name: "6 months" }, // ~6 months
          { blocks: 2592000n, name: "1 year" }, // ~1 year
        ]

        let provenLogs: any[] = []

        // Try each range progressively
        for (const range of searchRanges) {
          if (currentBlock > range.blocks) {
            const searchFromBlock = currentBlock - range.blocks

            provenLogs = await searchLogsInChunks(
              realWithdrawalHash,
              searchFromBlock,
              currentBlock,
              eventSignature,
              `Searching ${range.name} range`,
            )

            if (provenLogs.length > 0) {
              break
            }
          }
        }

        // Last resort: calculate starting block from L2 transaction timestamp
        if (provenLogs.length === 0) {
          const l2Block = await publicClientL2.getBlock({ blockNumber: receipt.blockNumber })
          const l2Timestamp = Number(l2Block.timestamp)
          const currentL1Block = await publicClientL1.getBlock({ blockNumber: currentBlock })
          const currentL1Timestamp = Number(currentL1Block.timestamp)
          const secondsAgo = currentL1Timestamp - l2Timestamp
          const l1BlocksAgo = Math.floor(secondsAgo / 10)
          const calculatedStartBlock = Math.max(0, Number(currentBlock) - l1BlocksAgo - 1000)

          provenLogs = await searchLogsInChunks(
            realWithdrawalHash,
            BigInt(calculatedStartBlock),
            currentBlock,
            eventSignature,
            "Searching from calculated start block",
          )
        }

        setSearchProgress("")

        if (provenLogs.length > 0) {
          const log = provenLogs[0]
          const proveBlock = await publicClientL1.getBlock({ blockNumber: log.blockNumber })

          const proveInfo = {
            proveHash: log.transactionHash,
            proveTime: Number(proveBlock.timestamp),
          }

          // Update the database with proof information
          try {
            const existingWithdrawal = await db.withdraws.where("withdrawalHash").equals(l2TxHash.toLowerCase()).first()
            const proveReceipt = await publicClientL1.waitForTransactionReceipt({ hash: proveInfo.proveHash })
            
            if (existingWithdrawal) {
              await db.withdraws.update(existingWithdrawal.id!, {
                proveHash: proveInfo.proveHash,
                proveReceipt,
                proveTimestamp: new Date(proveInfo.proveTime * 1000),
                status: "proved",
                updatedAt: new Date(),
              })
            } else {
              // Create new record if it doesn't exist
              await db.withdraws.add({
                withdrawalHash: l2TxHash.toLowerCase(),
                address: receipt.from,
                status: "proved",
                args: { request: { value: receipt.value || 0n } },
                createdAt: new Date(proveInfo.proveTime * 1000),
                updatedAt: new Date(),
                withdrawalReceipt: receipt,
                output: output,
                withdrawal: withdrawal,
                proveHash: proveInfo.proveHash,
                proveReceipt: proveReceipt,
                proveTimestamp: new Date(proveInfo.proveTime * 1000),
              })
            }
          } catch (error) {
            console.error("Error updating withdrawal with proof info:", error)
          }

          return proveInfo
        }

        return null
      } catch (error) {
        console.error("Error finding proof transaction:", error)
        setSearchProgress("")
        return null
      }
    },
    [publicClientL1, publicClientL2, searchLogsInChunks],
  )

  const refreshProofDataForWithdrawal = useCallback(
    async (withdrawal: WithdrawState) => {
      if (!withdrawal.withdrawalHash || withdrawal.status !== "proved") return

      setIsCheckingProofStatus(true)
      const proveInfo = await findProofTransactionForWithdrawal(withdrawal.withdrawalHash as `0x${string}`, true)
      setIsCheckingProofStatus(false)

      if (proveInfo) {
        const updatedWithdrawal = {
          ...withdrawal,
          proveHash: proveInfo.proveHash,
          proveTimestamp: new Date(proveInfo.proveTime * 1000),
          updatedAt: new Date(),
        }

        setWithdrawalData(updatedWithdrawal)
        setTimeLeft(calculateTimeLeft(proveInfo.proveTime))
        setCurrentStatus("proved")
      } else {
        toast({
          title: "Proof Data Not Found",
          description: "Could not find proof transaction on blockchain. The withdrawal may not be proven yet.",
          variant: "destructive",
        })
      }
    },
    [findProofTransactionForWithdrawal, calculateTimeLeft, toast],
  )

  const isWithdrawalReadyToProve = useCallback(
    async (l2BlockNumber: bigint) => {
      if (!publicClientL2) return false

      try {
        const currentL2Block = await publicClientL2.getBlockNumber()
        return currentL2Block - l2BlockNumber > BLOCKS_TO_WAIT_FOR_PROOF
      } catch (error) {
        console.error("Error checking if withdrawal is ready to prove:", error)
        return false
      }
    },
    [publicClientL2],
  )

  const checkTxWithdrawalStatus = useCallback(
    async (hashToCheck?: string) => {
      const currentHash = hashToCheck || txHash
      const trimmedHash = currentHash.trim()
   
      if (!trimmedHash) {
        toast({
          title: "Invalid Input",
          description: "Please enter a transaction hash",
          variant: "destructive",
        })
        return
      }

      if (!trimmedHash.startsWith("0x") || trimmedHash.length !== 66) {
        toast({
          title: "Invalid Transaction Hash",
          description: "Please enter a valid transaction hash (0x...)",
          variant: "destructive",
        })
        return
      }

      setIsLoading(true)
      setWithdrawalData(null)
      setAnalysis(null)
      setSearchProgress("")

      try {
        // Check local database first
        const localWithdrawal = await db.withdraws.where("withdrawalHash").equals(trimmedHash.toLowerCase()).first()

        if (localWithdrawal) {
          setWithdrawalData(localWithdrawal)
          setCurrentStatus(localWithdrawal.status)

          if (localWithdrawal.status === "proved" && localWithdrawal.proveTimestamp) {
            setTimeLeft(calculateTimeLeft(Math.floor(new Date(localWithdrawal.proveTimestamp).getTime() / 1000)))
          }
          return
        }

        if (!publicClientL2) {
          toast({
            title: "Connection Error",
            description: "L2 blockchain client is not available. Please check your network connection and try again.",
            variant: "destructive",
          })
          return
        }

        const [tx, receipt] = await Promise.all([
          publicClientL2.getTransaction({ hash: trimmedHash as `0x${string}` }).catch(() => null),
          publicClientL2.getTransactionReceipt({ hash: trimmedHash as `0x${string}` }).catch(() => null),
        ])

        if (!tx || !receipt) {
          toast({
            title: "Transaction Not Found",
            description: "Transaction not found on L2. Please verify the transaction hash.",
            variant: "destructive",
          })
          return
        }

       
        const withdrawalHash = (trimmedHash as `0x${string}`)


        const readyToProve = await isWithdrawalReadyToProve(tx.blockNumber!)
        const { status: viemStatus, isProven, isFinalized } = await getViemWithdrawalStatus(receipt)
        const proveInfo = isProven ? await findProofTransactionForWithdrawal(withdrawalHash as `0x${string}`) : null

        const status: WithdrawState["status"] = isFinalized
          ? "finalized"
          : isProven
            ? "proved"
            : readyToProve || viemStatus === "ready-to-prove"
              ? "ready_to_prove"
              : "initiated"

        // Get output and withdrawal data if ready to prove
        let output, withdrawal;
        if (status === "ready_to_prove" || status === "proved") {
          try {
            const result = await publicClientL1.waitToProve({
              receipt,
              targetChain: l2Chain,
            })
            output = result.output
            withdrawal = result.withdrawal
          } catch (error) {
            console.error("Error getting output and withdrawal data:", error)
          }
        }

        const basicWithdrawal: WithdrawState = {
          withdrawalHash: trimmedHash,
          address: tx.from,
          status,
          args: { request: { value: tx.value || 0n } },
          createdAt: new Date(),
          updatedAt: new Date(),
          withdrawalReceipt: receipt,
          output,
          withdrawal,
        }

        if (proveInfo) {
          basicWithdrawal.proveHash = proveInfo.proveHash
          basicWithdrawal.proveTimestamp = new Date(proveInfo.proveTime * 1000)
          basicWithdrawal.createdAt = new Date(proveInfo.proveTime * 1000)
        }

        try {
          const savedWithdrawal = await db.withdraws.add(basicWithdrawal)
          basicWithdrawal.id = savedWithdrawal
        } catch (error) {
          console.error("Error saving withdrawal to database:", error)
        }

        setWithdrawalData(basicWithdrawal)
        setCurrentStatus(status)

        if (status === "proved" && proveInfo) {
          setTimeLeft(calculateTimeLeft(proveInfo.proveTime))
        }

      } catch (error) {
        console.error("Error checking withdrawal status:", error)
        const errorMessage = error instanceof Error ? error.message : "Failed to check withdrawal status"
        const isUserRejected = errorMessage.includes("User rejected") || errorMessage.includes("User denied")

        toast({
          title: isUserRejected ? "Transaction Cancelled" : "Error",
          description: isUserRejected ? "Transaction was cancelled by user" : errorMessage,
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
        setSearchProgress("")
      }
    },
    [
      txHash,
      publicClientL1,
      publicClientL2,
      toast,
      analyzeTransaction,
      isWithdrawalReadyToProve,
      getViemWithdrawalStatus,
      findProofTransactionForWithdrawal,
      calculateTimeLeft,
    ],
  )

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim()
    setTxHash(value)
    setWithdrawalData(null)
    setTimeLeft("")
    setAnalysis(null)
    setSearchProgress("")
  }, [])

  const handleProveWithdrawal = useCallback(async () => {
    if (!withdrawalData?.output || !withdrawalData.withdrawal || !walletClientL1 || !address) {
      toast({
        title: "Cannot Prove Withdrawal",
        description: "Missing withdrawal data or wallet client for proving",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)

      const proveArgs = await publicClientL2.buildProveWithdrawal({
        output: withdrawalData.output,
        withdrawal: withdrawalData.withdrawal,
      })

      await switchChain({ chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID) })

      const proveHash = await walletClientL1.proveWithdrawal({
        ...proveArgs,
        account: address,
      })

      toast({
        title: "Prove Transaction Submitted",
        description: "Your prove transaction has been submitted to L1",
      })

      const updatedWithdrawal = {
        ...withdrawalData,
        status: "proving" as const,
        proveHash,
        proveArgs,
        updatedAt: new Date(),
      }

      if (withdrawalData.id) {
        await db.withdraws.update(withdrawalData.id, updatedWithdrawal)
      } else {
        const id = await db.withdraws.add(updatedWithdrawal)
        updatedWithdrawal.id = id
      }

      setWithdrawalData(updatedWithdrawal)
      setCurrentStatus("proving")

      // Wait for the transaction receipt
      const proveReceipt = await publicClientL1.waitForTransactionReceipt({ hash: proveHash })

      const provedWithdrawal = {
        ...updatedWithdrawal,
        status: "proved" as const,
        proveReceipt,
        proveTimestamp: new Date(),
        updatedAt: new Date(),
      }

      if (withdrawalData.id) {
        await db.withdraws.update(withdrawalData.id, provedWithdrawal)
      }

      setWithdrawalData(provedWithdrawal)
      setCurrentStatus("proved")
      setTimeLeft(calculateTimeLeft(Math.floor(Date.now() / 1000)))

      toast({
        title: "Withdrawal Proved",
        description: "Your withdrawal has been successfully proved. Wait 7 days to finalize.",
      })
    } catch (error) {
      console.error("Error proving withdrawal:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to prove withdrawal"
      const isUserRejected = errorMessage.includes("User rejected") || errorMessage.includes("User denied")

      toast({
        title: isUserRejected ? "Transaction Cancelled" : "Prove Failed",
        description: isUserRejected ? "The prove transaction was cancelled by user" : errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [withdrawalData, walletClientL1, address, publicClientL1, publicClientL2, switchChain, toast, calculateTimeLeft])

  const handleFinalizeWithdrawal = useCallback(async () => {
   let _withdrawalData=withdrawalData?.withdrawal
    if(!withdrawalData?.withdrawal){

           // Get the withdrawal data which contains the real withdrawal hash
            const { output, withdrawal } = await publicClientL1.waitToProve({
              receipt: withdrawalData!.withdrawalReceipt,
              targetChain: l2Chain,
            })

         _withdrawalData  = withdrawal

      }
    console.log('withdrawalData',withdrawalData);
    if (!_withdrawalData || !walletClientL1 || !address) {
      toast({
        title: "Cannot Finalize Withdrawal",
        description: "Missing withdrawal data or wallet client for finalizing",
        variant: "destructive",
      })
      return
    }

    try {
      setIsLoading(true)
      await switchChain({ chainId: Number(NEXT_PUBLIC_L1_CHAIN_ID) })

      const finalizeHash = await walletClientL1.finalizeWithdrawal({
        targetChain: l2Chain,
        withdrawal: _withdrawalData,
        account: address,
      })

      toast({
        title: "Finalize Transaction Submitted",
        description: "Your finalize transaction has been submitted to L1",
      })

      const updatedWithdrawal = {
        ...withdrawalData,
        status: "finalizing" as const,
        finalizeHash,
        updatedAt: new Date(),
      }

      if (withdrawalData.id) {
        await db.withdraws.update(withdrawalData.id, updatedWithdrawal)
      }

      setWithdrawalData(updatedWithdrawal)
      setCurrentStatus("finalizing")

      const finalizeReceipt = await publicClientL1.waitForTransactionReceipt({ hash: finalizeHash })

      const finalizedWithdrawal = {
        ...updatedWithdrawal,
        status: "finalized" as const,
        finalizeReceipt,
        updatedAt: new Date(),
      }

      if (withdrawalData.id) {
        await db.withdraws.update(withdrawalData.id, finalizedWithdrawal)
      }

      setWithdrawalData(finalizedWithdrawal)
      setCurrentStatus("finalized")

      toast({
        title: "Withdrawal Finalized",
        description: "Your withdrawal has been successfully finalized! Funds are now available on L1.",
      })
    } catch (error) {
      console.error("Error finalizing withdrawal:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to finalize withdrawal"
      const isUserRejected = errorMessage.includes("User rejected") || errorMessage.includes("User denied")

      toast({
        title: isUserRejected ? "Transaction Cancelled" : "Finalize Failed",
        description: isUserRejected ? "The finalize transaction was cancelled by user" : errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [withdrawalData, walletClientL1, address, publicClientL1, switchChain, toast])

  const handleUpdateStatus = useCallback(async () => {
    if (withdrawalData?.status === "proved") {
      await refreshProofDataForWithdrawal(withdrawalData)
    }
  }, [withdrawalData, refreshProofDataForWithdrawal])

  // Initialize with initialHash on mount
  useEffect(() => {
    if (initialHash?.trim()) {
      setTxHash(initialHash.trim())
      if (initialHash.trim().startsWith("0x") && initialHash.trim().length === 66) {
        const timer = setTimeout(() => checkTxWithdrawalStatus(initialHash.trim()), 100)
        return () => clearTimeout(timer)
      }
    }
  }, [initialHash, checkTxWithdrawalStatus])

  // Update time left every second when withdrawal is proved
  useEffect(() => {
    let interval: NodeJS.Timeout

    if (withdrawalData?.status === "proved" && withdrawalData?.proveTimestamp) {
      setTimeLeft(calculateTimeLeft(Math.floor(new Date(withdrawalData.proveTimestamp).getTime() / 1000)))
      interval = setInterval(() => {
        setTimeLeft(calculateTimeLeft(Math.floor(new Date(withdrawalData.proveTimestamp!).getTime() / 1000)))
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [withdrawalData, calculateTimeLeft])

  const clearInput = useCallback(() => {
    setTxHash("")
    setWithdrawalData(null)
    setAnalysis(null)
    setTimeLeft("")
    setSearchProgress("")
  }, [])

  const infoContent = useMemo(() => (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/50">
      <div className="flex items-start space-x-2">
        <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="space-y-2">
          <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
            How withdrawals work on OptiPulse:
          </p>
          <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p>
              <strong>ETH/Native Token Withdrawals:</strong> Interact with L2ToL1MessagePasser (
              {L2_TO_L1_MESSAGE_PASSER})
            </p>
            <p>
              <strong>Token Withdrawals:</strong> Interact with L2StandardBridge ({L2_BRIDGE_ADDRESS})
            </p>
            <p>
              <strong>Status Checking:</strong> Uses event-based detection to avoid contract call issues
            </p>
          </div>
        </div>
      </div>
    </div>
  ), [])

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
            <Button onClick={() => checkTxWithdrawalStatus()} disabled={isLoading || !txHash.trim()} size="sm">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
            {txHash && (
              <Button variant="outline" size="sm" onClick={clearInput}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {(isCheckingProofStatus || searchProgress) && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/50">
            <div className="flex items-center space-x-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {searchProgress || "Searching for proof transaction data..."}
              </p>
            </div>
          </div>
        )}

        {infoContent}

        {withdrawalData && currentStatus && (
          <WithdrawalProgress
            withdrawalData={withdrawalData}
            currentStatus={currentStatus}
            isLoading={isLoading}
            timeLeft={timeLeft}
            onProve={isConnected ? handleProveWithdrawal : undefined}
            onFinalize={isConnected ? handleFinalizeWithdrawal : undefined}
            onUpdateStatus={handleUpdateStatus}
          />
        )}
      </CardContent>
    </Card>
  )
}