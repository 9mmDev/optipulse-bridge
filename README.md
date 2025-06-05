# OptiPulse Bridge with Patched viem/op-stack

A modern, secure bridge interface for transferring assets between Layer 1 and Layer 2 networks. This project includes a patch for the viem/op-stack package to fix issues with the withdrawal status detection.

## Features

- 🌉 **Cross-chain transfers** between L1 and L2 networks
- 🔐 **Secure wallet integration** with multiple wallet providers
- 📱 **Responsive design** optimized for all devices
- 🌙 **Dark/Light mode** support
- ⏱️ **Real-time status tracking** for withdrawal processes
- 💾 **Local state persistence** for incomplete transactions
- 🎨 **Modern UI** with smooth animations and transitions

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- A Web3 wallet (MetaMask, WalletConnect, etc.)

### Installation

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd optipulse-bridge
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Copy environment variables:
\`\`\`bash
cp .env.example .env.local
\`\`\`

4. Configure your environment variables in `.env.local`

5. Run the development server:
\`\`\`bash
npm run dev
\`\`\`

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_L1_CHAIN_ID` | L1 Chain ID | `943` |
| `NEXT_PUBLIC_L2_CHAIN_ID` | L2 Chain ID | `94128` |
| `NEXT_PUBLIC_L1_CHAIN_NAME` | L1 Chain Name | `Pulse Testnet` |
| `NEXT_PUBLIC_L2_CHAIN_NAME` | L2 Chain Name | `OptiPulse Testnet` |
| `NEXT_PUBLIC_NATIVE_TOKEN_SYMBOL` | Native Token Symbol | `TPLS` |
| `NEXT_PUBLIC_NATIVE_TOKEN_NAME` | Native Token Name | `Test PLS` |
| `NEXT_PUBLIC_DEPOSIT_CAP` | Maximum deposit amount | `10000000` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Project ID | Optional |

## Project Structure

\`\`\`
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── bridge.tsx        # Main bridge component
│   ├── wagmi-provider.tsx # Wagmi configuration
│   └── withdraw-tx-status.tsx # Withdrawal status tracker
├── config/               # Configuration files
│   ├── chains.ts         # Chain definitions
│   └── wagmi.ts          # Wagmi setup
├── hooks/                # Custom React hooks
│   └── use-chain-configs.ts # Chain client hooks
├── store/                # Data persistence
│   └── db.ts             # Dexie database setup
├── types/                # TypeScript definitions
│   └── global.d.ts       # Global type declarations
└── lib/                  # Utility functions
    └── utils.ts          # Helper functions
\`\`\`

## Usage

### Deposits

1. Connect your wallet
2. Select the "Deposit" tab
3. Enter the amount to transfer
4. Confirm the transaction
5. Wait for confirmation on both networks

### Withdrawals

1. Connect your wallet
2. Select the "Withdraw" tab
3. Enter the amount to transfer
4. Initiate the withdrawal
5. Wait ~1 hour, then prove the withdrawal
6. Wait 7 days for the challenge period
7. Finalize the withdrawal

## Development

### Building

\`\`\`bash
npm run build
\`\`\`

### Type Checking

\`\`\`bash
npm run type-check
\`\`\`

### Linting

\`\`\`bash
npm run lint
\`\`\`

## Security Considerations

- Always verify transaction details before confirming
- Be aware of the 7-day withdrawal period for L2 to L1 transfers
- Only deposit funds you can afford to lose during testnet phase
- Keep your private keys secure and never share them

## Patching Process

1. We've added `patch-package` as a dependency to fix the viem/op-stack package.
2. The patch adds support for new error types:
   - `OptimismPortal_Unproven`
   - `OptimismPortal_ProofNotOldEnough`
3. The patch updates the error causes mapping in the `getWithdrawalStatus` function.

## How to Apply the Patch

The patch is automatically applied during the `npm install` process thanks to the `postinstall` script in package.json.

If you need to manually apply the patch:

\`\`\`bash
npx patch-package
\`\`\`

## How to Create/Update the Patch

If you need to make further changes to the viem/op-stack package:

1. Make your changes directly in the `node_modules/viem/op-stack` directory
2. Run the following command to create/update the patch:

\`\`\`bash
npx patch-package viem
\`\`\`

## What's Fixed

- Added missing error types to the portal2Abi
- Updated error causes mapping in getWithdrawalStatus
- Improved withdrawal status detection for newer OptimismPortal contracts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
