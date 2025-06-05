interface Window {
  ethereum?: any
}

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_L1_CHAIN_ID: string
      NEXT_PUBLIC_L2_CHAIN_ID: string
      NEXT_PUBLIC_L1_CHAIN_NAME: string
      NEXT_PUBLIC_L2_CHAIN_NAME: string
      NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL: string
      NEXT_PUBLIC_NATIVE_TOKEN_NAME: string
      NEXT_PUBLIC_DEPOSIT_CAP: string
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: string
      NEXT_PUBLIC_L1_RPC_URL: string
      NEXT_PUBLIC_L2_RPC_URL: string
      NEXT_PUBLIC_L1_EXPLORER_URL: string
      NEXT_PUBLIC_L2_EXPLORER_URL: string
      NEXT_PUBLIC_L1_STANDARD_BRIDGE_PROXY: string
      NEXT_PUBLIC_L1_OPTIMISM_PORTAL_PROXY: string
      NEXT_PUBLIC_L2_STANDARD_BRIDGE_PROXY: string
      NEXT_PUBLIC_DISPUTE_GAME_FACTORY_PROXY: string
      NEXT_PUBLIC_L2_OUTPUT_ORACLE_PROXY: string
      NEXT_PUBLIC_L1_MULTICALL3_ADDRESS: string
    }
  }
}

export {}
