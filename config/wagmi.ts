import { http, createConfig } from "wagmi"
import { injected, metaMask, walletConnect } from "wagmi/connectors"
import { l1Chain, l2Chain, NEXT_PUBLIC_L1_RPC_URL, NEXT_PUBLIC_L2_RPC_URL } from "./chains"

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "your-project-id"

export const config = createConfig({
  chains: [l1Chain, l2Chain],
  connectors: [injected(), metaMask(), walletConnect({ projectId })],
  transports: {
    [l1Chain.id]: http(NEXT_PUBLIC_L1_RPC_URL),
    [l2Chain.id]: http(NEXT_PUBLIC_L2_RPC_URL),
  },
})

declare module "wagmi" {
  interface Register {
    config: typeof config
  }
}
