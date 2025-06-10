const fs = require("fs")
const path = require("path")

console.log("🔄 Replacing viem files with pre-patched versions...")

// Check if node_modules exists
const nodeModulesPath = path.join(process.cwd(), "node_modules")
if (!fs.existsSync(nodeModulesPath)) {
  console.error("❌ node_modules directory not found. Run 'npm install' first.")
  process.exit(1)
}

// Check if viem exists
const viemPath = path.join(nodeModulesPath, "viem")
if (!fs.existsSync(viemPath)) {
  console.error("❌ viem package not found in node_modules. Run 'npm install viem' first.")
  process.exit(1)
}

// Define file paths
const abisPath = path.join(viemPath, "_esm", "op-stack", "abis.js")
const statusPath = path.join(viemPath, "_esm", "op-stack", "actions", "getWithdrawalStatus.js")

console.log("📁 Checking file paths...")
console.log("   abis.js path:", abisPath)
console.log("   getWithdrawalStatus.js path:", statusPath)

// Check if directories exist
const opStackDir = path.join(viemPath, "_esm", "op-stack")
const actionsDir = path.join(viemPath, "_esm", "op-stack", "actions")

if (!fs.existsSync(opStackDir)) {
  console.error("❌ op-stack directory not found:", opStackDir)
  process.exit(1)
}

if (!fs.existsSync(actionsDir)) {
  console.error("❌ actions directory not found:", actionsDir)
  process.exit(1)
}

// Check if files exist before replacement
console.log("🔍 Checking existing files...")
const abisExists = fs.existsSync(abisPath)
const statusExists = fs.existsSync(statusPath)

console.log(`   abis.js exists: ${abisExists}`)
console.log(`   getWithdrawalStatus.js exists: ${statusExists}`)

if (!abisExists) {
  console.error("❌ abis.js not found at:", abisPath)
  process.exit(1)
}

if (!statusExists) {
  console.error("❌ getWithdrawalStatus.js not found at:", statusPath)
  process.exit(1)
}

// Create backups
console.log("💾 Creating backups...")
try {
  fs.copyFileSync(abisPath, abisPath + ".backup")
  console.log("   ✅ Created backup of abis.js")
} catch (error) {
  console.log("   ⚠️ Could not create backup of abis.js:", error.message)
}

try {
  fs.copyFileSync(statusPath, statusPath + ".backup")
  console.log("   ✅ Created backup of getWithdrawalStatus.js")
} catch (error) {
  console.log("   ⚠️ Could not create backup of getWithdrawalStatus.js:", error.message)
}

// Replace abis.js
console.log("📝 Replacing abis.js...")
try {
  // Read current content to verify it's the right file
  const currentAbisContent = fs.readFileSync(abisPath, "utf8")

  if (!currentAbisContent.includes("portal2Abi")) {
    console.error("❌ abis.js doesn't contain portal2Abi - this might not be the right file")
    process.exit(1)
  }

  // Check if already patched
  if (
    currentAbisContent.includes("OptimismPortal_Unproven") &&
    currentAbisContent.includes("OptimismPortal_ProofNotOldEnough")
  ) {
    console.log("   ℹ️ abis.js already contains the required error types")
  } else {
    console.log("   🔧 Patching abis.js with error types...")

    // Simple approach: add the error types to the existing portal2Abi
    let newContent = currentAbisContent

    // Find the portal2Abi array and add our error types before the closing bracket
    const portal2AbiMatch = newContent.match(/(export const portal2Abi = \[[\s\S]*?)\];/)

    if (portal2AbiMatch) {
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

      const beforeClosing = portal2AbiMatch[1]
      const newPortal2Abi = beforeClosing + errorTypes + "\n];"

      newContent = newContent.replace(portal2AbiMatch[0], newPortal2Abi)

      fs.writeFileSync(abisPath, newContent)
      console.log("   ✅ Successfully patched abis.js")
    } else {
      console.error("   ❌ Could not find portal2Abi in abis.js")
      process.exit(1)
    }
  }
} catch (error) {
  console.error("❌ Error replacing abis.js:", error.message)
  process.exit(1)
}

// Replace getWithdrawalStatus.js
console.log("📝 Replacing getWithdrawalStatus.js...")
try {
  // Read current content to verify it's the right file
  const currentStatusContent = fs.readFileSync(statusPath, "utf8")

  if (!currentStatusContent.includes("getWithdrawalStatus")) {
    console.error(
      "❌ getWithdrawalStatus.js doesn't contain getWithdrawalStatus function - this might not be the right file",
    )
    process.exit(1)
  }

  // Check if already patched
  if (
    currentStatusContent.includes("OptimismPortal_Unproven") &&
    currentStatusContent.includes("OptimismPortal_ProofNotOldEnough")
  ) {
    console.log("   ℹ️ getWithdrawalStatus.js already contains the required error mappings")
  } else {
    console.log("   🔧 Patching getWithdrawalStatus.js with error mappings...")

    // Replace the errorCauses object
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

    let newContent = currentStatusContent

    // Find and replace the errorCauses object
    const errorCausesMatch = newContent.match(/const errorCauses = \{[\s\S]*?\};/)

    if (errorCausesMatch) {
      newContent = newContent.replace(errorCausesMatch[0], newErrorCauses)

      fs.writeFileSync(statusPath, newContent)
      console.log("   ✅ Successfully patched getWithdrawalStatus.js")
    } else {
      console.error("   ❌ Could not find errorCauses in getWithdrawalStatus.js")
      process.exit(1)
    }
  }
} catch (error) {
  console.error("❌ Error replacing getWithdrawalStatus.js:", error.message)
  process.exit(1)
}

// Verify the patches were applied
console.log("🔍 Verifying patches...")
try {
  const verifiedAbisContent = fs.readFileSync(abisPath, "utf8")
  const verifiedStatusContent = fs.readFileSync(statusPath, "utf8")

  const abisHasUnproven = verifiedAbisContent.includes("OptimismPortal_Unproven")
  const abisHasProofNotOldEnough = verifiedAbisContent.includes("OptimismPortal_ProofNotOldEnough")
  const statusHasUnproven = verifiedStatusContent.includes("OptimismPortal_Unproven")
  const statusHasProofNotOldEnough = verifiedStatusContent.includes("OptimismPortal_ProofNotOldEnough")

  console.log("📋 Verification Results:")
  console.log(`   abis.js - OptimismPortal_Unproven: ${abisHasUnproven ? "✅" : "❌"}`)
  console.log(`   abis.js - OptimismPortal_ProofNotOldEnough: ${abisHasProofNotOldEnough ? "✅" : "❌"}`)
  console.log(`   getWithdrawalStatus.js - OptimismPortal_Unproven: ${statusHasUnproven ? "✅" : "❌"}`)
  console.log(
    `   getWithdrawalStatus.js - OptimismPortal_ProofNotOldEnough: ${statusHasProofNotOldEnough ? "✅" : "❌"}`,
  )

  if (abisHasUnproven && abisHasProofNotOldEnough && statusHasUnproven && statusHasProofNotOldEnough) {
    console.log("🎉 All patches applied and verified successfully!")
  } else {
    console.error("❌ Some patches failed verification")
    process.exit(1)
  }
} catch (error) {
  console.error("❌ Error verifying patches:", error.message)
  process.exit(1)
}

console.log("")
console.log("✅ viem/op-stack package has been successfully patched!")
console.log("🚀 You can now run 'npm run dev' or 'npm run build'")
