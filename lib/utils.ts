import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const truncateAddress = (address: `0x${string}` | undefined, startLength = 6, endLength = 4): string => {
  if (!address) return ""
  return `${address.substring(0, startLength)}...${address.substring(address.length - endLength)}`
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
