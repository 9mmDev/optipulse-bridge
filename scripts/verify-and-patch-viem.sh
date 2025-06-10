#!/bin/bash

echo "🔍 Verifying and patching viem/op-stack package..."

# Check if node_modules exists
if [ ! -d "node_modules/viem" ]; then
    echo "❌ node_modules/viem not found. Please run 'npm install' first."
    exit 1
fi

# Backup original files
echo "📁 Creating backups..."
cp node_modules/viem/_esm/op-stack/abis.js node_modules/viem/_esm/op-stack/abis.js.backup 2>/dev/null || echo "⚠️ Could not backup abis.js"
cp node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js.backup 2>/dev/null || echo "⚠️ Could not backup getWithdrawalStatus.js"

# Check current state of files
echo "🔍 Checking current state of files..."

# Check abis.js
if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/abis.js; then
    echo "✅ OptimismPortal_Unproven already exists in abis.js"
else
    echo "❌ OptimismPortal_Unproven missing from abis.js - will patch"
    NEED_ABIS_PATCH=true
fi

if grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/abis.js; then
    echo "✅ OptimismPortal_ProofNotOldEnough already exists in abis.js"
else
    echo "❌ OptimismPortal_ProofNotOldEnough missing from abis.js - will patch"
    NEED_ABIS_PATCH=true
fi

# Check getWithdrawalStatus.js
if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js; then
    echo "✅ OptimismPortal_Unproven already exists in getWithdrawalStatus.js"
else
    echo "❌ OptimismPortal_Unproven missing from getWithdrawalStatus.js - will patch"
    NEED_STATUS_PATCH=true
fi

if grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js; then
    echo "✅ OptimismPortal_ProofNotOldEnough already exists in getWithdrawalStatus.js"
else
    echo "❌ OptimismPortal_ProofNotOldEnough missing from getWithdrawalStatus.js - will patch"
    NEED_STATUS_PATCH=true
fi

# Apply patches if needed
if [ "$NEED_ABIS_PATCH" = true ]; then
    echo "🔧 Patching abis.js..."
    
    # Create a temporary file with the patch
    cat > /tmp/abis_patch.js << 'EOF'
const fs = require('fs');
const filePath = 'node_modules/viem/_esm/op-stack/abis.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already patched
    if (content.includes('OptimismPortal_Unproven') && content.includes('OptimismPortal_ProofNotOldEnough')) {
        console.log('✅ abis.js already patched');
        process.exit(0);
    }
    
    // Find the portal2Abi export
    const portal2AbiRegex = /(export const portal2Abi = \[[\s\S]*?)\];/;
    const match = content.match(portal2AbiRegex);
    
    if (!match) {
        console.log('❌ Could not find portal2Abi in abis.js');
        process.exit(1);
    }
    
    // Add the new error types before the closing bracket
    const errorTypes = `    {
        inputs: [],
        name: 'OptimismPortal_Unproven',
        type: 'error',
    },
    {
        inputs: [],
        name: 'OptimismPortal_ProofNotOldEnough',
        type: 'error',
    },`;
    
    const beforeClosing = match[1];
    const newContent = content.replace(
        match[0],
        beforeClosing + errorTypes + '\n];'
    );
    
    fs.writeFileSync(filePath, newContent);
    console.log('✅ Successfully patched abis.js');
    
} catch (error) {
    console.log('❌ Error patching abis.js:', error.message);
    process.exit(1);
}
EOF
    
    node /tmp/abis_patch.js
    rm /tmp/abis_patch.js
fi

if [ "$NEED_STATUS_PATCH" = true ]; then
    echo "🔧 Patching getWithdrawalStatus.js..."
    
    # Create a temporary file with the patch
    cat > /tmp/status_patch.js << 'EOF'
const fs = require('fs');
const filePath = 'node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js';

try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already patched
    if (content.includes('OptimismPortal_Unproven') && content.includes('OptimismPortal_ProofNotOldEnough')) {
        console.log('✅ getWithdrawalStatus.js already patched');
        process.exit(0);
    }
    
    // Define the new errorCauses object
    const newErrorCauses = `const errorCauses = {
    'ready-to-prove': [
        'OptimismPortal: invalid game type',
        'OptimismPortal: withdrawal has not been proven yet',
        'OptimismPortal: withdrawal has not been proven by proof submitter address yet',
        'OptimismPortal: dispute game created before respected game type was updated',
        'InvalidGameType',
        'LegacyGame',
        'OptimismPortal_Unproven',
    ],
    'waiting-to-finalize': [
        'OptimismPortal_ProofNotOldEnough',
        'OptimismPortal: proven withdrawal has not matured yet',
        'OptimismPortal: output proposal has not been finalized yet',
        'OptimismPortal: output proposal in air-gap',
    ],
};`;
    
    // Replace the existing errorCauses definition
    const errorCausesRegex = /const errorCauses = \{[\s\S]*?\};/;
    
    if (!errorCausesRegex.test(content)) {
        console.log('❌ Could not find errorCauses in getWithdrawalStatus.js');
        process.exit(1);
    }
    
    content = content.replace(errorCausesRegex, newErrorCauses);
    fs.writeFileSync(filePath, content);
    console.log('✅ Successfully patched getWithdrawalStatus.js');
    
} catch (error) {
    console.log('❌ Error patching getWithdrawalStatus.js:', error.message);
    process.exit(1);
}
EOF
    
    node /tmp/status_patch.js
    rm /tmp/status_patch.js
fi

# Verify patches were applied
echo "🔍 Verifying patches were applied..."

if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/abis.js && \
   grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/abis.js; then
    echo "✅ abis.js successfully patched"
else
    echo "❌ abis.js patch failed"
    exit 1
fi

if grep -q "OptimismPortal_Unproven" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js && \
   grep -q "OptimismPortal_ProofNotOldEnough" node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js; then
    echo "✅ getWithdrawalStatus.js successfully patched"
else
    echo "❌ getWithdrawalStatus.js patch failed"
    exit 1
fi

echo "🎉 All patches applied successfully!"
