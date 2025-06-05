import Dexie, { type Table } from "dexie"

export type WithdrawStatus =
  | "initiating"
  | "initiated"
  | "ready_to_prove"
  | "proving"
  | "proved"
  | "finalizing"
  | "finalized"

export interface WithdrawState {
  id?: number
  withdrawalHash: string
  address: string
  status: WithdrawStatus
  args: any
  createdAt: Date
  updatedAt: Date
  withdrawalReceipt?: any
  output?: any
  withdrawal?: any
  proveArgs?: any
  proveHash?: string
  proveReceipt?: any
  finalizeHash?: string
  finalizeReceipt?: any
}

export interface BlockSyncState {
  id?: number
  address: string
  chainId: number
  lastSyncedBlock: bigint
  lastSyncTime: Date
}

export class BridgeDatabase extends Dexie {
  withdraws!: Table<WithdrawState>
  blockSync!: Table<BlockSyncState>
  transactions!: Table<any>

  constructor() {
    super("BridgeDatabase")
    this.version(1).stores({
      withdraws: "++id, withdrawalHash, address, status, createdAt",
    })

    // Add new tables in version 2
    this.version(2).stores({
      blockSync: "++id, address, chainId, [address+chainId]",
      transactions: "++id, hash, address, chainId, blockNumber, [address+chainId]",
    })
  }
}

export const db = new BridgeDatabase()
