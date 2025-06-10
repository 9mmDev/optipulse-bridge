#!/bin/bash

echo "🔍 Checking viem patch status..."

# Check if files exist
if [ ! -f "node_modules/viem/_esm/op-stack/abis.js" ]; then
    echo "❌ abis.js not found. Run 'npm install' first."
    exit 1
fi

if [ ! -f "node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js" ]; then
    echo "❌ getWithdrawalStatus.js not found. Run 'npm install' first."
    exit 1
fi

# Check patches
echo "Checking abis.js..."
if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/abis.js; then
    echo "  ✅ OptimismPortal_Unproven found"
else
    echo "  ❌ OptimismPortal_Unproven missing"
fi

if grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/abis.js; then
    echo "  ✅ OptimismPortal_ProofNotOldEnough found"
else
    echo "  ❌ OptimismPortal_ProofNotOldEnough missing"
fi

echo "Checking getWithdrawalStatus.js..."
if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js; then
    echo "  ✅ OptimismPortal_Unproven found in error causes"
else
    echo "  ❌ OptimismPortal_Unproven missing from error causes"
fi

if grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js; then
    echo "  ✅ OptimismPortal_ProofNotOldEnough found in error causes"
else
    echo "  ❌ OptimismPortal_ProofNotOldEnough missing from error causes"
fi

echo "Done."
