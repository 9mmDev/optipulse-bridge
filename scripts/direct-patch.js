const fs = require("fs")
const path = require("path")

console.log("🔧 Directly patching viem/op-stack files...")

// Paths to the files we need to patch
const abisPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/abis.js")
const statusPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js")

// Check if files exist
if (!fs.existsSync(abisPath)) {
  console.error("❌ abis.js not found. Make sure viem is installed.")
  console.error("   Run: npm install")
  process.exit(1)
}

if (!fs.existsSync(statusPath)) {
  console.error("❌ getWithdrawalStatus.js not found. Make sure viem is installed.")
  console.error("   Run: npm install")
  process.exit(1)
}

// Patch abis.js
try {
  console.log("📝 Patching abis.js...")
  let abisContent = fs.readFileSync(abisPath, "utf8")

  // Check if already patched
  if (abisContent.includes("OptimismPortal_Unproven") && abisContent.includes("OptimismPortal_ProofNotOldEnough")) {
    console.log("✅ abis.js already contains the required error types")
  } else {
    console.log("🔍 Looking for portal2Abi in the file...")

    // More robust regex to find portal2Abi
    const portal2AbiMatch = abisContent.match(/(export\s+const\s+portal2Abi\s*=\s*\[)([\s\S]*?)(\]\s*;?)/m)

    if (!portal2AbiMatch) {
      console.error("❌ Could not find portal2Abi export in abis.js")
      console.error("   The file structure might have changed in this version of viem")

      // Let's see what exports are available
      const exports = abisContent.match(/export\s+const\s+\w+/g) || []
      console.error("   Available exports:", exports.join(", "))
      process.exit(1)
    }

    console.log("✅ Found portal2Abi, adding error types...")

    // The error types to add
    const errorTypes = `    {
        inputs: [],
        name: 'OptimismPortal_Unproven',
        type: 'error',
    },
    {
        inputs: [],
        name: 'OptimismPortal_ProofNotOldEnough',
        type: 'error',
    },`

    // Reconstruct the portal2Abi with the new error types
    const beforeArray = portal2AbiMatch[1] // "export const portal2Abi = ["
    const arrayContent = portal2AbiMatch[2] // the content inside the array
    const afterArray = portal2AbiMatch[3] // "];"

    // Add the error types at the end of the array content
    const newArrayContent = arrayContent.trim() + (arrayContent.trim().endsWith(",") ? "" : ",") + "\n" + errorTypes

    const newPortal2Abi = beforeArray + newArrayContent + "\n" + afterArray

    // Replace the old portal2Abi with the new one
    abisContent = abisContent.replace(portal2AbiMatch[0], newPortal2Abi)

    // Create backup
    fs.writeFileSync(abisPath + ".backup", fs.readFileSync(abisPath))
    fs.writeFileSync(abisPath, abisContent)
    console.log("✅ Successfully added error types to portal2Abi in abis.js")

    // Verify the patch was applied
    const verifyContent = fs.readFileSync(abisPath, "utf8")
    if (
      verifyContent.includes("OptimismPortal_Unproven") &&
      verifyContent.includes("OptimismPortal_ProofNotOldEnough")
    ) {
      console.log("✅ Verified: Error types are now present in abis.js")
    } else {
      console.error("❌ Verification failed: Error types not found after patching")
    }
  }
} catch (error) {
  console.error("❌ Error patching abis.js:", error.message)
  process.exit(1)
}

// Patch getWithdrawalStatus.js
try {
  console.log("📝 Patching getWithdrawalStatus.js...")
  let statusContent = fs.readFileSync(statusPath, "utf8")

  // Check if already patched
  if (statusContent.includes("OptimismPortal_Unproven") && statusContent.includes("OptimismPortal_ProofNotOldEnough")) {
    console.log("✅ getWithdrawalStatus.js already contains the required error causes")
  } else {
    console.log("🔍 Looking for errorCauses in the file...")

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
};`

    // More robust regex to find errorCauses
    const errorCausesMatch = statusContent.match(/(const\s+errorCauses\s*=\s*\{)([\s\S]*?)(\}\s*;?)/m)

    if (!errorCausesMatch) {
      console.error("❌ Could not find errorCauses in getWithdrawalStatus.js")
      console.error("   The file structure might have changed in this version of viem")

      // Let's see what's in the file
      const constDeclarations = statusContent.match(/const\s+\w+/g) || []
      console.error("   Available const declarations:", constDeclarations.join(", "))
      process.exit(1)
    }

    console.log("✅ Found errorCauses, updating...")

    // Create backup
    fs.writeFileSync(statusPath + ".backup", fs.readFileSync(statusPath))
    statusContent = statusContent.replace(errorCausesMatch[0], newErrorCauses)
    fs.writeFileSync(statusPath, statusContent)
    console.log("✅ Successfully updated error causes in getWithdrawalStatus.js")

    // Verify the patch was applied
    const verifyContent = fs.readFileSync(statusPath, "utf8")
    if (
      verifyContent.includes("OptimismPortal_Unproven") &&
      verifyContent.includes("OptimismPortal_ProofNotOldEnough")
    ) {
      console.log("✅ Verified: Error causes are now present in getWithdrawalStatus.js")
    } else {
      console.error("❌ Verification failed: Error causes not found after patching")
    }
  }
} catch (error) {
  console.error("❌ Error patching getWithdrawalStatus.js:", error.message)
  process.exit(1)
}

// Try to create patch file for future installs (optional)
try {
  console.log("📦 Attempting to create patch file for future installs...")

  // Check if patch-package is available
  const { execSync } = require("child_process")

  // Check if patch-package is installed
  try {
    execSync("npx patch-package --version", { stdio: "pipe" })
    console.log("🔧 Running patch-package to create patch file...")
    execSync("npx patch-package viem", { stdio: "inherit" })
    console.log("✅ Patch file created successfully")
  } catch (patchError) {
    console.log("⚠️ patch-package not available or failed to create patch file")
    console.log("   This is optional - the patches are already applied")
    console.log("   To install patch-package: npm install --save-dev patch-package")
  }
} catch (error) {
  console.log("⚠️ Could not create patch file (this is optional)")
  console.log("   The patches are already applied and will work")
}

console.log("🎉 Patching complete!")
console.log("")
console.log("✅ The viem/op-stack package has been patched with:")
console.log("   - OptimismPortal_Unproven error type in portal2Abi")
console.log("   - OptimismPortal_ProofNotOldEnough error type in portal2Abi")
console.log("   - Updated error causes mapping in getWithdrawalStatus")
console.log("")
console.log("🚀 You can now run 'npm run dev' to start the development server")
