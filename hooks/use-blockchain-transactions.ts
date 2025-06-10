"use client"

import { useState, useEffect } from "react"
import { useAccount } from "wagmi"
import { parseAbiItem, formatEther } from "viem"
import { useChainConfigs } from "./use-chain-configs"
import {
  NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY,
  NEXT_PUBLIC_L1_EXPLORER_URL,
  NEXT_PUBLIC_L2_EXPLORER_URL,
} from "@/config/chains"
import { db } from "@/store/db"

export interface BlockchainTransaction {
  id: string
  hash: string
  type: "deposit" | "withdraw"
  amount: string
  status: "pending" | "completed" | "failed"
  timestamp: Date
  blockNumber: bigint
  fromChain: string
  toChain: string
  explorerUrl: string
  l1Hash?: string
  l2Hash?: string
}

export function useBlockchainTransactions() {
  const [depositTransactions, setDepositTransactions] = useState<BlockchainTransaction[]>([])
  const [withdrawTransactions, setWithdrawTransactions] = useState<BlockchainTransaction[]>([])
  const [isLoadingDeposits, setIsLoadingDeposits] = useState(false)
  const [isLoadingWithdraws, setIsLoadingWithdraws] = useState(false)
  const [depositError, setDepositError] = useState<string | null>(null)
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState({ deposits: 0, withdrawals: 0 })
  const { address, isConnected } = useAccount()
  const { publicClientL1, publicClientL2 } = useChainConfigs()

  // Configuration for block ranges and timing
  const BLOCK_CHUNK_SIZE = 2000n // Number of blocks to query at once
  const L1_CHAIN_ID = 943 // L1 Chain ID
  const L2_CHAIN_ID = 94128 // L2 Chain ID
  const L2_INCEPTION_BLOCK_ON_L1 = 21610104n // Block where L2 was deployed on L1

  // Block generation times (in seconds)
  const L1_BLOCK_TIME = 10 // ~10 seconds per block on L1
  const L2_BLOCK_TIME = 2 // ~2 seconds per block on L2

  // Time window for tracking (2 months in seconds)
  const TRACKING_WINDOW_SECONDS = 60 * 24 * 60 * 60 // 60 days * 24 hours * 60 minutes * 60 seconds

  // Calculate how many blocks to look back for 2 months
  const L1_BLOCKS_FOR_2_MONTHS = BigInt(Math.floor(TRACKING_WINDOW_SECONDS / L1_BLOCK_TIME)) // ~518,400 blocks
  const L2_BLOCKS_FOR_2_MONTHS = BigInt(Math.floor(TRACKING_WINDOW_SECONDS / L2_BLOCK_TIME)) // ~2,592,000 blocks

  // L1 Optimism Portal contract for deposits
  const L1_OPTIMISM_PORTAL = NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`
  // L2ToL1MessagePasser contract for withdrawals
  const L2_TO_L1_MESSAGE_PASSER = "0x4200000000000000000000000000000000000016" as `0x${string}`

  // Helper function to construct proper explorer URLs
  const buildExplorerUrl = (baseUrl: string, txHash: string): string => {
    // Remove trailing slashes from base URL
    const cleanBaseUrl = baseUrl.replace(/\/+$/, "")
    // Ensure we have a single slash before the path
    return `${cleanBaseUrl}/tx/${txHash}`
  }

  // Calculate the start block for a given chain (2 months back)
  const calculateStartBlock = (currentBlock: bigint, chainType: "L1" | "L2"): bigint => {
    const blocksToLookBack = chainType === "L1" ? L1_BLOCKS_FOR_2_MONTHS : L2_BLOCKS_FOR_2_MONTHS
    const calculatedStart = currentBlock > blocksToLookBack ? currentBlock - blocksToLookBack : 0n

    // For L1, also respect the L2 inception block
    if (chainType === "L1") {
      return calculatedStart > L2_INCEPTION_BLOCK_ON_L1 ? calculatedStart : L2_INCEPTION_BLOCK_ON_L1
    }

    return calculatedStart
  }

  // Clean up old cached transactions beyond the 2-month window
  const cleanupOldTransactions = async (userAddress: string, chainId: number, oldestBlockToKeep: bigint) => {
    try {
      await db.transactions
        .where("[address+chainId]")
        .equals([userAddress.toLowerCase(), chainId])
        .and((tx) => BigInt(tx.blockNumber) < oldestBlockToKeep)
        .delete()

      console.log(`Cleaned up old transactions before block ${oldestBlockToKeep} for chain ${chainId}`)
    } catch (error) {
      console.error("Error cleaning up old transactions:", error)
    }
  }

  // Get the last synced block for a specific address and chain
  const getLastSyncedBlock = async (userAddress: string, chainId: number): Promise<bigint | null> => {
    try {
      const syncState = await db.blockSync
        .where("[address+chainId]")
        .equals([userAddress.toLowerCase(), chainId])
        .first()

      return syncState?.lastSyncedBlock || null
    } catch (error) {
      console.error("Error getting last synced block:", error)
      return null
    }
  }

  // Update the last synced block for a specific address and chain
  const updateLastSyncedBlock = async (userAddress: string, chainId: number, blockNumber: bigint) => {
    try {
      const existingSync = await db.blockSync
        .where("[address+chainId]")
        .equals([userAddress.toLowerCase(), chainId])
        .first()

      if (existingSync) {
        await db.blockSync.update(existingSync.id!, {
          lastSyncedBlock: blockNumber,
          lastSyncTime: new Date(),
        })
      } else {
        await db.blockSync.add({
          address: userAddress.toLowerCase(),
          chainId,
          lastSyncedBlock: blockNumber,
          lastSyncTime: new Date(),
        })
      }
    } catch (error) {
      console.error("Error updating last synced block:", error)
    }
  }

  // Get cached transactions for a specific address and chain within the 2-month window
  const getCachedTransactions = async (
    userAddress: string,
    chainId: number,
    type: "deposit" | "withdraw",
    oldestBlockToKeep: bigint,
  ): Promise<BlockchainTransaction[]> => {
    try {
      const transactions = await db.transactions
        .where("[address+chainId]")
        .equals([userAddress.toLowerCase(), chainId])
        .and((tx) => tx.type === type && BigInt(tx.blockNumber) >= oldestBlockToKeep)
        .toArray()

      return transactions.map((tx) => ({
        ...tx,
        timestamp: new Date(tx.timestamp),
        blockNumber: BigInt(tx.blockNumber),
      }))
    } catch (error) {
      console.error(`Error getting cached ${type} transactions:`, error)
      return []
    }
  }

  // Save transactions to cache
  const saveTransactionsToCache = async (
    transactions: BlockchainTransaction[],
    userAddress: string,
    chainId: number,
  ) => {
    try {
      // Prepare transactions for storage (convert BigInt to string)
      const txsToStore = transactions.map((tx) => ({
        ...tx,
        address: userAddress.toLowerCase(),
        chainId,
        blockNumber: tx.blockNumber.toString(),
        timestamp: tx.timestamp.toISOString(),
      }))

      // Use transaction to ensure atomicity
      await db.transaction("rw", db.transactions, async () => {
        // For each transaction, check if it exists and update or add
        for (const tx of txsToStore) {
          const existingTx = await db.transactions.where("hash").equals(tx.hash).first()

          if (existingTx) {
            await db.transactions.update(existingTx.id!, tx)
          } else {
            await db.transactions.add(tx)
          }
        }
      })
    } catch (error) {
      console.error("Error saving transactions to cache:", error)
    }
  }

  const fetchDepositTransactions = async () => {
    if (!address || !publicClientL1) {
      console.log("Missing address or publicClientL1 for deposits")
      return []
    }

    try {
      console.log("Fetching deposit transactions for:", address)
      console.log("L1 Optimism Portal address:", L1_OPTIMISM_PORTAL)

      // Get current block number
      const currentBlock = await publicClientL1.getBlockNumber()
      console.log("Current L1 block:", currentBlock)

      // Calculate the start block for 2-month window
      const twoMonthStartBlock = calculateStartBlock(currentBlock, "L1")
      console.log(`2-month window: blocks ${twoMonthStartBlock} to ${currentBlock} (~${L1_BLOCKS_FOR_2_MONTHS} blocks)`)

      // Clean up old cached transactions
      await cleanupOldTransactions(address, L1_CHAIN_ID, twoMonthStartBlock)

      // Get the last synced block, but ensure it's within our 2-month window
      let startBlock = await getLastSyncedBlock(address, L1_CHAIN_ID)
      if (!startBlock || startBlock < twoMonthStartBlock) {
        startBlock = twoMonthStartBlock
      }
      console.log(`Starting deposit search from block ${startBlock} to ${currentBlock}`)

      // Get cached transactions within the 2-month window
      const cachedDeposits = await getCachedTransactions(address, L1_CHAIN_ID, "deposit", twoMonthStartBlock)
      console.log(`Found ${cachedDeposits.length} cached deposits within 2-month window`)

      // If we're already synced to the current block, just return cached transactions
      if (startBlock >= currentBlock) {
        console.log("Already synced to current block, using cached deposits")
        return cachedDeposits
      }

      const newDeposits: BlockchainTransaction[] = []

      // TransactionDeposited event from OptimismPortal
      const depositEventSignature =
        "event TransactionDeposited(address indexed from, address indexed to, uint256 indexed version, bytes opaqueData)"

      // Process in chunks to avoid RPC timeouts
      for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += BLOCK_CHUNK_SIZE) {
        const toBlock =
          fromBlock + BLOCK_CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BLOCK_CHUNK_SIZE - 1n

        try {
          console.log(`Fetching deposit logs from block ${fromBlock} to ${toBlock}`)

          // Calculate and update progress
          const progress = Number(((fromBlock - startBlock) * 100n) / (currentBlock - startBlock + 1n))
          setSyncProgress((prev) => ({ ...prev, deposits: Math.min(99, progress) }))
          console.log(`Progress: ${progress}% complete`)

          const depositLogs = await publicClientL1.getLogs({
            address: L1_OPTIMISM_PORTAL,
            event: parseAbiItem(depositEventSignature),
            args: {
              from: address,
            },
            fromBlock,
            toBlock,
          })

          console.log(`Found ${depositLogs.length} deposit logs in range ${fromBlock}-${toBlock}`)

          for (const log of depositLogs) {
            try {
              // Get transaction details to extract the value (amount)
              const [tx, block] = await Promise.all([
                publicClientL1.getTransaction({ hash: log.transactionHash }),
                publicClientL1.getBlock({ blockNumber: log.blockNumber }),
              ])

              // For native token deposits, the amount is the transaction value
              const amount = formatEther(tx.value || 0n)

              // Skip zero-value transactions
              if (Number.parseFloat(amount) > 0) {
                newDeposits.push({
                  id: `${log.transactionHash}-${log.logIndex}`,
                  hash: log.transactionHash,
                  type: "deposit",
                  amount,
                  status: "completed",
                  timestamp: new Date(Number(block.timestamp) * 1000),
                  blockNumber: log.blockNumber,
                  fromChain: "L1",
                  toChain: "L2",
                  explorerUrl: buildExplorerUrl(NEXT_PUBLIC_L1_EXPLORER_URL, log.transactionHash),
                  l1Hash: log.transactionHash,
                })
              }
            } catch (error) {
              console.error("Error processing deposit log:", error)
            }
          }

          // Update the last synced block after each successful chunk
          await updateLastSyncedBlock(address, L1_CHAIN_ID, toBlock)
        } catch (error) {
          console.error(`Error fetching deposits for range ${fromBlock}-${toBlock}:`, error)
          // Don't update the last synced block if there was an error
        }
      }

      // Set progress to 100% when done
      setSyncProgress((prev) => ({ ...prev, deposits: 100 }))

      // Save new deposits to cache
      if (newDeposits.length > 0) {
        await saveTransactionsToCache(newDeposits, address, L1_CHAIN_ID)
      }

      // Combine cached and new deposits
      const allDeposits = [...cachedDeposits, ...newDeposits]

      // Remove duplicates based on transaction hash
      const uniqueDeposits = allDeposits.filter(
        (deposit, index, self) => index === self.findIndex((d) => d.hash === deposit.hash),
      )

      console.log("Total unique deposits found:", uniqueDeposits.length)
      return uniqueDeposits
    } catch (error) {
      console.error("Error fetching deposit transactions:", error)
      throw error
    }
  }

  const fetchWithdrawTransactions = async () => {
    if (!address || !publicClientL2) {
      console.log("Missing address or publicClientL2 for withdrawals")
      return []
    }

    try {
      console.log("Fetching withdrawal transactions for:", address)
      // Get current block number
      const currentBlock = await publicClientL2.getBlockNumber()

      // Calculate the start block for 2-month window
      const twoMonthStartBlock = calculateStartBlock(currentBlock, "L2")
      console.log(`2-month window: blocks ${twoMonthStartBlock} to ${currentBlock} (~${L2_BLOCKS_FOR_2_MONTHS} blocks)`)

      // Clean up old cached transactions
      await cleanupOldTransactions(address, L2_CHAIN_ID, twoMonthStartBlock)

      // Get the last synced block, but ensure it's within our 2-month window
      let startBlock = await getLastSyncedBlock(address, L2_CHAIN_ID)
      if (!startBlock || startBlock < twoMonthStartBlock) {
        startBlock = twoMonthStartBlock
      }
      console.log(`Starting withdrawal search from block ${startBlock} to ${currentBlock}`)

      // Get cached transactions within the 2-month window
      const cachedWithdrawals = await getCachedTransactions(address, L2_CHAIN_ID, "withdraw", twoMonthStartBlock)
      console.log(`Found ${cachedWithdrawals.length} cached withdrawals within 2-month window`)

      // If we're already synced to the current block, just return cached transactions
      if (startBlock >= currentBlock) {
        console.log("Already synced to current block, using cached withdrawals")
        return cachedWithdrawals
      }

      const newWithdrawals: BlockchainTransaction[] = []

      // MessagePassed event from L2ToL1MessagePasser
      const withdrawEventSignature =
        "event MessagePassed(uint256 indexed nonce, address indexed sender, address indexed target, uint256 value, uint256 gasLimit, bytes data, bytes32 withdrawalHash)"

      // Process in chunks to avoid RPC timeouts
      for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += BLOCK_CHUNK_SIZE) {
        const toBlock =
          fromBlock + BLOCK_CHUNK_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BLOCK_CHUNK_SIZE - 1n

        try {
          console.log(`Fetching withdrawal logs from block ${fromBlock} to ${toBlock}`)

          // Calculate and update progress
          const progress = Number(((fromBlock - startBlock) * 100n) / (currentBlock - startBlock + 1n))
          setSyncProgress((prev) => ({ ...prev, withdrawals: Math.min(99, progress) }))
          console.log(`Progress: ${progress}% complete`)

          const withdrawalLogs = await publicClientL2.getLogs({
            address: L2_TO_L1_MESSAGE_PASSER,
            event: parseAbiItem(withdrawEventSignature),
            args: {
              sender: address,
            },
            fromBlock,
            toBlock,
          })

          console.log(`Found ${withdrawalLogs.length} withdrawal logs in range ${fromBlock}-${toBlock}`)

          for (const log of withdrawalLogs) {
            try {
              const block = await publicClientL2.getBlock({ blockNumber: log.blockNumber })

              // Parse amount from the value field in the event
              const amount = log.args.value ? formatEther(log.args.value) : "0"

              // Skip zero-value transactions
              if (Number.parseFloat(amount) > 0) {
                // Determine status based on age
                const now = new Date()
                const txTime = new Date(Number(block.timestamp) * 1000)
                const daysSince = (now.getTime() - txTime.getTime()) / (1000 * 60 * 60 * 24)
                const status = daysSince > 7 ? "completed" : "pending"

                newWithdrawals.push({
                  id: `${log.transactionHash}-${log.logIndex}`,
                  hash: log.transactionHash,
                  type: "withdraw",
                  amount,
                  status,
                  timestamp: txTime,
                  blockNumber: log.blockNumber,
                  fromChain: "L2",
                  toChain: "L1",
                  explorerUrl: buildExplorerUrl(NEXT_PUBLIC_L2_EXPLORER_URL, log.transactionHash),
                  l2Hash: log.transactionHash,
                })
              }
            } catch (error) {
              console.error("Error processing withdrawal log:", error)
            }
          }

          // Update the last synced block after each successful chunk
          await updateLastSyncedBlock(address, L2_CHAIN_ID, toBlock)
        } catch (error) {
          console.error(`Error fetching withdrawals for range ${fromBlock}-${toBlock}:`, error)
          // Don't update the last synced block if there was an error
        }
      }

      // Set progress to 100% when done
      setSyncProgress((prev) => ({ ...prev, withdrawals: 100 }))

      // Save new withdrawals to cache
      if (newWithdrawals.length > 0) {
        await saveTransactionsToCache(newWithdrawals, address, L2_CHAIN_ID)
      }

      // Combine cached and new withdrawals
      const allWithdrawals = [...cachedWithdrawals, ...newWithdrawals]

      // Remove duplicates based on transaction hash
      const uniqueWithdrawals = allWithdrawals.filter(
        (withdrawal, index, self) => index === self.findIndex((w) => w.hash === withdrawal.hash),
      )

      console.log("Total unique withdrawals found:", uniqueWithdrawals.length)
      return uniqueWithdrawals
    } catch (error) {
      console.error("Error fetching withdrawal transactions:", error)
      throw error
    }
  }

  const fetchDeposits = async () => {
    if (!address || !isConnected) {
      setDepositTransactions([])
      return
    }

    setIsLoadingDeposits(true)
    setDepositError(null)

    try {
      const deposits = await fetchDepositTransactions()
      setDepositTransactions(deposits.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 50))
    } catch (error) {
      console.error("Error fetching deposits:", error)
      setDepositError(error instanceof Error ? error.message : "Failed to fetch deposits")
    } finally {
      setIsLoadingDeposits(false)
    }
  }

  const fetchWithdraws = async () => {
    if (!address || !isConnected) {
      setWithdrawTransactions([])
      return
    }

    setIsLoadingWithdraws(true)
    setWithdrawError(null)

    try {
      const withdrawals = await fetchWithdrawTransactions()
      setWithdrawTransactions(withdrawals.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 50))
    } catch (error) {
      console.error("Error fetching withdrawals:", error)
      setWithdrawError(error instanceof Error ? error.message : "Failed to fetch withdrawals")
    } finally {
      setIsLoadingWithdraws(false)
    }
  }

  // Fetch deposits when address changes
  useEffect(() => {
    if (isConnected && address && publicClientL1) {
      fetchDeposits()
    } else {
      setDepositTransactions([])
    }
  }, [address, isConnected, publicClientL1])

  // Fetch withdrawals when address changes
  useEffect(() => {
    if (isConnected && address && publicClientL2) {
      fetchWithdraws()
    } else {
      setWithdrawTransactions([])
    }
  }, [address, isConnected, publicClientL2])

  return {
    depositTransactions,
    withdrawTransactions,
    isLoadingDeposits,
    isLoadingWithdraws,
    depositError,
    withdrawError,
    syncProgress,
    refetchDeposits: fetchDeposits,
    refetchWithdraws: fetchWithdraws,
    // Expose the block ranges for UI display
    blockRanges: {
      l1BlocksFor2Months: L1_BLOCKS_FOR_2_MONTHS,
      l2BlocksFor2Months: L2_BLOCKS_FOR_2_MONTHS,
    },
  }
}
