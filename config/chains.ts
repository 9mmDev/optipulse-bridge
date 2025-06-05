import { defineChain } from "viem"

// Environment variables with defaults
export const NEXT_PUBLIC_L1_CHAIN_ID = process.env.NEXT_PUBLIC_L1_CHAIN_ID || "943"
export const NEXT_PUBLIC_L2_CHAIN_ID = process.env.NEXT_PUBLIC_L2_CHAIN_ID || "94128"
export const NEXT_PUBLIC_L1_CHAIN_NAME = process.env.NEXT_PUBLIC_L1_CHAIN_NAME || "Pulse Testnet"
export const NEXT_PUBLIC_L2_CHAIN_NAME = process.env.NEXT_PUBLIC_L2_CHAIN_NAME || "OptiPulse Testnet"
export const NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL = process.env.NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL || "TPLS"
export const NEXT_PUBLIC_NATIVE_TOKEN_NAME = process.env.NEXT_PUBLIC_NATIVE_TOKEN_NAME || "Test PLS"

// RPC URLs
export const NEXT_PUBLIC_L1_RPC_URL =
  process.env.NEXT_PUBLIC_L1_RPC_URL || "https://pulsechain-testnet-rpc.publicnode.com"
export const NEXT_PUBLIC_L2_RPC_URL = process.env.NEXT_PUBLIC_L2_RPC_URL || "https://rpc-testnet.optipulse.io"

// Explorer URLs
// Fix the L1 explorer URL by removing the trailing "/#/"
export const NEXT_PUBLIC_L1_EXPLORER_URL =
  process.env.NEXT_PUBLIC_L1_EXPLORER_URL || "https://scan.v4.testnet.pulsechain.com"
export const NEXT_PUBLIC_L2_EXPLORER_URL =
  process.env.NEXT_PUBLIC_L2_EXPLORER_URL || "https://testnet-explorer.optipulse.io"

// Contract Addresses
export const NEXT_PUBLIC_L1_STANDARD_BRIDGE_PROXY =
  process.env.NEXT_PUBLIC_L1_STANDARD_BRIDGE_PROXY || "0x19af7b4f9b8bbf5b28c8b9b672e803573cfcc0d1"
export const NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY =
  process.env.NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY || "0xf1c82a074fa8d6150f1c88851a16365740f0a496"
export const NEXT_PUBLIC_L2_STANDARD_BRIDGE_PROXY =
  process.env.NEXT_PUBLIC_L2_STANDARD_BRIDGE_PROXY || "0x4200000000000000000000000000000000000010"
export const NEXT_PUBLIC_DISPUTE_GAME_FACTORY_PROXY =
  process.env.NEXT_PUBLIC_DISPUTE_GAME_FACTORY_PROXY || "0x39cd8bd51cd35824b4e497db5293f27f6faedf7c"
export const NEXT_PUBLIC_L1_MULTICALL3_ADDRESS =
  process.env.NEXT_PUBLIC_L1_MULTICALL3_ADDRESS || "0xcA11bde05977b3631167028862bE2a173976CA11"
export const NEXT_PUBLIC_L2_OUTPUT_ORACLE_PROXY =
  process.env.NEXT_PUBLIC_L2_OUTPUT_ORACLE_PROXY || "0x4200000000000000000000000000000000000013"

// L1 Chain (Pulse Testnet)
// Update the L1 chain definition to remove the "/#/" from the explorer URL
export const l1Chain = defineChain({
  id: Number(NEXT_PUBLIC_L1_CHAIN_ID),
  name: NEXT_PUBLIC_L1_CHAIN_NAME,
  network: "pulse-testnet",
  nativeCurrency: {
    decimals: 18,
    name: NEXT_PUBLIC_NATIVE_TOKEN_NAME,
    symbol: NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
  },
  rpcUrls: {
    default: {
      http: [NEXT_PUBLIC_L1_RPC_URL],
    },
    public: {
      http: [NEXT_PUBLIC_L1_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "PulseScan",
      url: NEXT_PUBLIC_L1_EXPLORER_URL,
    },
  },
  contracts: {
    multicall3: {
      address: NEXT_PUBLIC_L1_MULTICALL3_ADDRESS as `0x${string}`,
    },
    portal: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`,
      },
    },
    disputeGameFactory: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_DISPUTE_GAME_FACTORY_PROXY as `0x${string}`,
      },
    },
    l2OutputOracle: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L2_OUTPUT_ORACLE_PROXY as `0x${string}`,
      },
    },
    l1StandardBridge: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L1_STANDARD_BRIDGE_PROXY as `0x${string}`,
      },
    },
    l2StandardBridge: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L2_STANDARD_BRIDGE_PROXY as `0x${string}`,
      },
    },
  },
})

// L2 Chain (OptiPulse Testnet)
export const l2Chain = defineChain({
  id: Number(NEXT_PUBLIC_L2_CHAIN_ID),
  name: NEXT_PUBLIC_L2_CHAIN_NAME,
  network: "optipulse-testnet",
  nativeCurrency: {
    decimals: 18,
    name: NEXT_PUBLIC_NATIVE_TOKEN_NAME,
    symbol: NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL,
  },
  rpcUrls: {
    default: {
      http: [NEXT_PUBLIC_L2_RPC_URL],
    },
    public: {
      http: [NEXT_PUBLIC_L2_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: "OptiPulse Explorer",
      url: NEXT_PUBLIC_L2_EXPLORER_URL,
    },
  },
  contracts: {
    l2OutputOracle: {
      address: NEXT_PUBLIC_L2_OUTPUT_ORACLE_PROXY as `0x${string}`,
    },
    portal: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY as `0x${string}`,
      },
    },
    l1StandardBridge: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_L1_STANDARD_BRIDGE_PROXY as `0x${string}`,
      },
    },
    l2StandardBridge: {
      address: NEXT_PUBLIC_L2_STANDARD_BRIDGE_PROXY as `0x${string}`,
    },
    disputeGameFactory: {
      [Number(NEXT_PUBLIC_L1_CHAIN_ID)]: {
        address: NEXT_PUBLIC_DISPUTE_GAME_FACTORY_PROXY as `0x${string}`,
      },
    },
  },
})
