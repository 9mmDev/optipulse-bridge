import { NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL, NEXT_PUBLIC_NATIVE_TOKEN_NAME } from "./chains"

export interface Token {
  symbol: string
  name: string
  address: string | null // null for native token
  decimals: number
  logoURI: string
  isStable: boolean
}

export const tokens: Token[] = [
  {
    symbol: NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL || "TPLS",
    name: NEXT_PUBLIC_NATIVE_TOKEN_NAME || "Test PLS",
    address: null, // Native token
    decimals: 18,
    logoURI: "/tpls.png?height=32&width=32",
    isStable: false,
  },
  // {
  //   symbol: "USDC",
  //   name: "USD Coin",
  //   address: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
  //   decimals: 6,
  //   logoURI: "/placeholder.svg?height=32&width=32",
  //   isStable: true,
  // },
  // {
  //   symbol: "USDT",
  //   name: "Tether USD",
  //   address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
  //   decimals: 6,
  //   logoURI: "/placeholder.svg?height=32&width=32",
  //   isStable: true,
  // },
  // {
  //   symbol: "DAI",
  //   name: "Dai Stablecoin",
  //   address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  //   decimals: 18,
  //   logoURI: "/placeholder.svg?height=32&width=32",
  //   isStable: true,
  // },
]

export const getTokenBySymbol = (symbol: string): Token | undefined => {
  return tokens.find((token) => token.symbol === symbol)
}

export const getNativeToken = (): Token => {
  return tokens.find((token) => token.address === null) || tokens[0]
}
