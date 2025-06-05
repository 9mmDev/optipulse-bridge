"use client"

import { useMemo, useEffect, useState } from "react"
import { createPublicClient, createWalletClient, custom, http } from "viem"
import { useAccount } from "wagmi"
import { l1Chain, l2Chain, NEXT_PUBLIC_L1_RPC_URL, NEXT_PUBLIC_L2_RPC_URL } from "@/config/chains"
import { publicActionsL1, publicActionsL2, walletActionsL1, walletActionsL2 } from "viem/op-stack"

export function useChainConfigs() {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== "undefined"

  const { connector, isConnected } = useAccount()
  const [ethereum, setEthereum] = useState<any>(null)

  // Make sure we have access to the ethereum object
  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      console.log("Ethereum provider found:", window.ethereum)
      setEthereum(window.ethereum)
    } else {
      console.warn("No Ethereum provider found in window")
    }
  }, [])

  // Create public clients
  const publicClientL1 = useMemo(() => {
    console.log("Creating L1 public client")
    return createPublicClient({
      chain: l1Chain,
      transport: http(NEXT_PUBLIC_L1_RPC_URL),
    }).extend(publicActionsL1())
  }, [])

  const publicClientL2 = useMemo(() => {
    console.log("Creating L2 public client")
    return createPublicClient({
      chain: l2Chain,
      transport: http(NEXT_PUBLIC_L2_RPC_URL),
    }).extend(publicActionsL2())
  }, [])

  // Create wallet clients only when ethereum provider and connector are available
  const walletClientL1 = useMemo(() => {
    if (!connector || !isConnected || !ethereum) {
      console.log("Cannot create L1 wallet client - missing dependencies", { connector, isConnected, ethereum })
      return null
    }

    console.log("Creating L1 wallet client")
    try {
      return createWalletClient({
        chain: l1Chain,
        transport: custom(ethereum),
      }).extend(walletActionsL1())
    } catch (error) {
      console.error("Error creating L1 wallet client:", error)
      return null
    }
  }, [connector, isConnected, ethereum])

  const walletClientL2 = useMemo(() => {
    if (!connector || !isConnected || !ethereum) {
      console.log("Cannot create L2 wallet client - missing dependencies", { connector, isConnected, ethereum })
      return null
    }

    console.log("Creating L2 wallet client")
    try {
      return createWalletClient({
        chain: l2Chain,
        transport: custom(ethereum),
      }).extend(walletActionsL2())
    } catch (error) {
      console.error("Error creating L2 wallet client:", error)
      return null
    }
  }, [connector, isConnected, ethereum])

  return {
    publicClientL1,
    publicClientL2,
    walletClientL1,
    walletClientL2,
  }
}
