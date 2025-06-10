#!/bin/bash

echo "Patching viem/op-stack package..."

# Backup original files
echo "Creating backups..."
cp node_modules/viem/_esm/op-stack/abis.js node_modules/viem/_esm/op-stack/abis.js.backup
cp node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js.backup

# Patch abis.js - Add missing error types to portal2Abi
echo "Patching abis.js..."
node -e "
const fs = require('fs');
const filePath = 'node_modules/viem/_esm/op-stack/abis.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find the portal2Abi constant and add the missing error types
const errorTypesToAdd = \`    {
        inputs: [],
        name: 'OptimismPortal_Unproven',
        type: 'error',
    },
    {
        inputs: [],
        name: 'OptimismPortal_ProofNotOldEnough',
        type: 'error',
    },\`;

// Look for the portal2Abi array and add the error types
// We'll add them after the existing error definitions
const portal2AbiMatch = content.match(/(export const portal2Abi = \[[\s\S]*?)(\];)/);
if (portal2AbiMatch) {
    // Check if the errors are already added
    if (!content.includes('OptimismPortal_Unproven')) {
        // Find a good place to insert - after existing error definitions
        const beforeClosing = portal2AbiMatch[1];
        const afterClosing = portal2AbiMatch[2];
        
        // Add the new errors before the closing bracket
        const updatedContent = content.replace(
            portal2AbiMatch[0],
            beforeClosing + errorTypesToAdd + '\n' + afterClosing
        );
        
        fs.writeFileSync(filePath, updatedContent);
        console.log('✅ Successfully added error types to portal2Abi');
    } else {
        console.log('ℹ️ Error types already exist in portal2Abi');
    }
} else {
    console.log('❌ Could not find portal2Abi in the file');
}
"

# Patch getWithdrawalStatus.js - Update error causes mapping
echo "Patching getWithdrawalStatus.js..."
node -e "
const fs = require('fs');
const filePath = 'node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js';
let content = fs.readFileSync(filePath, 'utf8');

// Define the new errorCauses object
const newErrorCauses = \`const errorCauses = {
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
};\`;

// Replace the existing errorCauses definition
const errorCausesRegex = /const errorCauses = \{[\s\S]*?\};/;
if (errorCausesRegex.test(content)) {
    content = content.replace(errorCausesRegex, newErrorCauses);
    fs.writeFileSync(filePath, content);
    console.log('✅ Successfully updated errorCauses mapping');
} else {
    console.log('❌ Could not find errorCauses in the file');
}
"

echo "Patching complete!"
echo ""
echo "To create a patch file for future use, run:"
echo "npx patch-package viem"
