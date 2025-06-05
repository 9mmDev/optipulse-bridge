// Utility functions for bridge operations
import { parseEther, formatEther } from "viem"

export function formatAmount(amount: string): bigint {
  try {
    return parseEther(amount)
  } catch (error) {
    throw new Error("Invalid amount format")
  }
}

export function parseAmount(amount: bigint): string {
  try {
    return formatEther(amount)
  } catch (error) {
    return "0"
  }
}

export function validateAmount(amount: string, maxAmount?: string): boolean {
  try {
    const amountBN = parseEther(amount)
    if (amountBN <= 0n) return false

    if (maxAmount) {
      const maxAmountBN = parseEther(maxAmount)
      if (amountBN > maxAmountBN) return false
    }

    return true
  } catch {
    return false
  }
}
