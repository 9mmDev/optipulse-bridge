#!/bin/bash

echo "🚀 Setting up viem patch for OptiPulse Bridge..."

# Install patch-package if not already installed
if ! npm list patch-package > /dev/null 2>&1; then
    echo "📦 Installing patch-package..."
    npm install --save-dev patch-package
else
    echo "✅ patch-package already installed"
fi

# Update package.json to include postinstall script
echo "📝 Updating package.json..."
node -e "
const fs = require('fs');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

if (!packageJson.scripts) {
    packageJson.scripts = {};
}

packageJson.scripts.postinstall = 'patch-package';

fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
console.log('✅ Added postinstall script to package.json');
"

# Apply the patches
echo "🔧 Applying patches..."
chmod +x scripts/verify-and-patch-viem.sh
./scripts/verify-and-patch-viem.sh

# Create the patch file
echo "📄 Creating patch file..."
npx patch-package viem

echo "🎉 Setup complete!"
echo ""
echo "The viem package has been patched with:"
echo "  - OptimismPortal_Unproven error type"
echo "  - OptimismPortal_ProofNotOldEnough error type"
echo "  - Updated error causes mapping in getWithdrawalStatus"
echo ""
echo "The patch will be automatically applied on future 'npm install' runs."
