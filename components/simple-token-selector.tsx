"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { tokens } from "@/config/tokens"
import Image from 'next/image';


interface SimpleTokenSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function SimpleTokenSelector({ value, onChange }: SimpleTokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  const selectedToken = tokens.find((token) => token.symbol === value) || tokens[0]

  const handleTokenSelect = (tokenSymbol: string) => {
    onChange(tokenSymbol)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        className="flex items-center justify-between gap-2 h-12 px-3 font-mono w-full"
        onClick={() => {
          console.log("Token selector clicked, current state:", isOpen)
          setIsOpen(!isOpen)
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold">
             {selectedToken.logoURI ? (
                <Image
                  src={selectedToken.logoURI}
                  alt={selectedToken.symbol}
                  width={24}
                  height={24}
                  className="object-contain"
                />
              ) : (
                selectedToken.symbol.charAt(0)
              )}
          </div>
          <span>{selectedToken.symbol}</span>
        </div>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </Button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg z-50">
          <div className="p-2 space-y-1">
            {tokens.map((token) => (
              <button
                key={token.symbol}
                className="w-full text-left p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2"
                onClick={() => {
                  console.log("Token selected:", token.symbol)
                  handleTokenSelect(token.symbol)
                }}
              >
           <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden">
              {token.logoURI ? (
                <Image
                  src={token.logoURI}
                  alt={token.symbol}
                  width={24}
                  height={24}
                  className="object-contain"
                />
              ) : (
                token.symbol.charAt(0)
              )}
            </div>

                <div>
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-xs text-gray-500">{token.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
