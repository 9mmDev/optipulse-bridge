"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { WalletIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAccount, useDisconnect, useConnect } from "wagmi"
import { truncateAddress } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NEXT_PUBLIC_L1_CHAIN_ID, NEXT_PUBLIC_L1_CHAIN_NAME, NEXT_PUBLIC_L2_CHAIN_NAME } from "@/config/chains"
import type { Connector } from "wagmi"

export default function WalletSection() {
  const { address, isConnected, chainId } = useAccount()
  const { disconnect } = useDisconnect()
  const { connect, connectors } = useConnect()
  const [isDisconnectOpen, setIsDisconnectOpen] = useState(false)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)

  const handleDisconnect = () => {
    disconnect()
    setIsDisconnectOpen(false)
  }

  const handleConnect = (connector: Connector) => {
    console.log("Connecting with:", connector.name)
    connect({ connector })
    setIsWalletModalOpen(false)
  }

  const handleOpenWalletModal = () => {
    console.log("Opening wallet modal")
    setIsWalletModalOpen(true)
  }

  return (
    <>
      {isConnected ? (
        <Button variant="outline" onClick={() => setIsDisconnectOpen(true)} className="font-mono">
          <WalletIcon className="mr-2 h-4 w-4" />
          {truncateAddress(address)}
          {chainId && (
            <Badge variant="secondary" className="ml-2 text-xs">
              {chainId === Number(NEXT_PUBLIC_L1_CHAIN_ID) ? NEXT_PUBLIC_L1_CHAIN_NAME : NEXT_PUBLIC_L2_CHAIN_NAME}
            </Badge>
          )}
        </Button>
      ) : (
        <Button onClick={handleOpenWalletModal}>
          <WalletIcon className="mr-2 h-4 w-4" />
          Connect Wallet
        </Button>
      )}

      {/* Disconnect Dialog */}
      <Dialog open={isDisconnectOpen} onOpenChange={setIsDisconnectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Wallet</DialogTitle>
            <DialogDescription>Are you sure you want to disconnect your wallet?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDisconnectOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDisconnect}>Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wallet Connection Dialog */}
      <Dialog open={isWalletModalOpen} onOpenChange={setIsWalletModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>Choose a wallet provider to connect to the bridge.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {connectors.map((connector: Connector) => (
              <Button
                key={connector.name}
                variant="outline"
                className="h-12 justify-start"
                onClick={() => {
                  console.log("Connector clicked:", connector.name)
                  handleConnect(connector)
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
    </>
  )
}
