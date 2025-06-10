#!/bin/bash

echo "Installing patch-package..."
npm install --save-dev patch-package

echo "Adding postinstall script to package.json..."
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

echo "Applying patches..."
chmod +x scripts/patch-viem.sh
./scripts/patch-viem.sh

echo "Creating patch file..."
npx patch-package viem

echo "✅ Patch created successfully!"
echo ""
echo "The patch will now be automatically applied when running 'npm install'"
