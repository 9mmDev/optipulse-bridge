const fs = require("fs")
const path = require("path")

console.log("🔧 Enhanced viem patching with signature verification...")

// Paths to the files we need to patch
const abisPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/abis.js")
const statusPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js")

// Check if files exist
if (!fs.existsSync(abisPath)) {
  console.error("❌ abis.js not found. Make sure viem is installed.")
  process.exit(1)
}

if (!fs.existsSync(statusPath)) {
  console.error("❌ getWithdrawalStatus.js not found. Make sure viem is installed.")
  process.exit(1)
}

// Enhanced patch for abis.js
try {
  console.log("📝 Enhanced patching of abis.js...")
  let abisContent = fs.readFileSync(abisPath, "utf8")

  // Create backup
  if (!fs.existsSync(abisPath + ".backup")) {
    fs.writeFileSync(abisPath + ".backup", abisContent)
    console.log("💾 Created backup of abis.js")
  }

  // Check if already patched
  if (abisContent.includes("OptimismPortal_Unproven") && abisContent.includes("OptimismPortal_ProofNotOldEnough")) {
    console.log("✅ abis.js already contains the required error types")
  } else {
    console.log("🔍 Looking for portal2Abi in the file...")

    // More comprehensive search for portal2Abi
    const portal2AbiRegex = /(export\s+const\s+portal2Abi\s*=\s*\[)([\s\S]*?)(\]\s*;?)/
    const match = abisContent.match(portal2AbiRegex)

    if (!match) {
      console.error("❌ Could not find portal2Abi export in abis.js")

      // Let's see what exports are available
      const exports = abisContent.match(/export\s+const\s+\w+/g) || []
      console.error("   Available exports:", exports.join(", "))

      // Try to find any ABI that might be the portal ABI
      const abiExports = abisContent.match(/export\s+const\s+\w*[Pp]ortal\w*Abi/g) || []
      console.error("   Portal-related ABIs:", abiExports.join(", "))

      process.exit(1)
    }

    console.log("✅ Found portal2Abi, adding comprehensive error types...")

    // Enhanced error types with more comprehensive coverage
    const errorTypes = `    {
        inputs: [],
        name: 'OptimismPortal_Unproven',
        type: 'error',
    },
    {
        inputs: [],
        name: 'OptimismPortal_ProofNotOldEnough',
        type: 'error',
    },
    {
        inputs: [],
        name: 'InvalidGameType',
        type: 'error',
    },
    {
        inputs: [],
        name: 'LegacyGame',
        type: 'error',
    },`

    const beforeArray = match[1] // "export const portal2Abi = ["
    const arrayContent = match[2] // the content inside the array
    const afterArray = match[3] // "];"

    // Ensure proper comma placement
    let newArrayContent = arrayContent.trim()
    if (newArrayContent && !newArrayContent.endsWith(",")) {
      newArrayContent += ","
    }
    newArrayContent += "\n" + errorTypes

    const newPortal2Abi = beforeArray + newArrayContent + "\n" + afterArray

    // Replace the old portal2Abi with the new one
    abisContent = abisContent.replace(match[0], newPortal2Abi)

    fs.writeFileSync(abisPath, abisContent)
    console.log("✅ Successfully added comprehensive error types to portal2Abi")

    // Verify the patch was applied
    const verifyContent = fs.readFileSync(abisPath, "utf8")
    const hasUnproven = verifyContent.includes("OptimismPortal_Unproven")
    const hasProofNotOldEnough = verifyContent.includes("OptimismPortal_ProofNotOldEnough")
    const hasInvalidGameType = verifyContent.includes("InvalidGameType")
    const hasLegacyGame = verifyContent.includes("LegacyGame")

    console.log("🔍 Verification:")
    console.log(`   OptimismPortal_Unproven: ${hasUnproven ? "✅" : "❌"}`)
    console.log(`   OptimismPortal_ProofNotOldEnough: ${hasProofNotOldEnough ? "✅" : "❌"}`)
    console.log(`   InvalidGameType: ${hasInvalidGameType ? "✅" : "❌"}`)
    console.log(`   LegacyGame: ${hasLegacyGame ? "✅" : "❌"}`)

    if (!hasUnproven || !hasProofNotOldEnough) {
      console.error("❌ Verification failed: Required error types not found after patching")
      process.exit(1)
    }
  }
} catch (error) {
  console.error("❌ Error patching abis.js:", error.message)
  process.exit(1)
}

// Enhanced patch for getWithdrawalStatus.js
try {
  console.log("📝 Enhanced patching of getWithdrawalStatus.js...")
  let statusContent = fs.readFileSync(statusPath, "utf8")

  // Create backup
  if (!fs.existsSync(statusPath + ".backup")) {
    fs.writeFileSync(statusPath + ".backup", statusContent)
    console.log("💾 Created backup of getWithdrawalStatus.js")
  }

  // Check if already patched
  if (statusContent.includes("OptimismPortal_Unproven") && statusContent.includes("OptimismPortal_ProofNotOldEnough")) {
    console.log("✅ getWithdrawalStatus.js already contains the required error causes")
  } else {
    console.log("🔍 Looking for errorCauses in the file...")

    // Enhanced errorCauses with comprehensive error mapping
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

    // Find and replace the errorCauses object
    const errorCausesRegex = /(const\s+errorCauses\s*=\s*\{)([\s\S]*?)(\}\s*;?)/
    const match = statusContent.match(errorCausesRegex)

    if (!match) {
      console.error("❌ Could not find errorCauses in getWithdrawalStatus.js")

      // Let's see what's in the file
      const constDeclarations = statusContent.match(/const\s+\w+/g) || []
      console.error("   Available const declarations:", constDeclarations.join(", "))
      process.exit(1)
    }

    console.log("✅ Found errorCauses, updating with comprehensive mapping...")

    statusContent = statusContent.replace(match[0], newErrorCauses)
    fs.writeFileSync(statusPath, statusContent)
    console.log("✅ Successfully updated error causes with comprehensive mapping")

    // Verify the patch was applied
    const verifyContent = fs.readFileSync(statusPath, "utf8")
    const hasUnproven = verifyContent.includes("OptimismPortal_Unproven")
    const hasProofNotOldEnough = verifyContent.includes("OptimismPortal_ProofNotOldEnough")
    const hasInvalidGameType = verifyContent.includes("InvalidGameType")
    const hasLegacyGame = verifyContent.includes("LegacyGame")

    console.log("🔍 Verification:")
    console.log(`   OptimismPortal_Unproven: ${hasUnproven ? "✅" : "❌"}`)
    console.log(`   OptimismPortal_ProofNotOldEnough: ${hasProofNotOldEnough ? "✅" : "❌"}`)
    console.log(`   InvalidGameType: ${hasInvalidGameType ? "✅" : "❌"}`)
    console.log(`   LegacyGame: ${hasLegacyGame ? "✅" : "❌"}`)

    if (!hasUnproven || !hasProofNotOldEnough) {
      console.error("❌ Verification failed: Required error causes not found after patching")
      process.exit(1)
    }
  }
} catch (error) {
  console.error("❌ Error patching getWithdrawalStatus.js:", error.message)
  process.exit(1)
}

console.log("🎉 Enhanced patching complete!")
console.log("")
console.log("✅ The viem/op-stack package has been comprehensively patched with:")
console.log("   - OptimismPortal_Unproven error type")
console.log("   - OptimismPortal_ProofNotOldEnough error type")
console.log("   - InvalidGameType error type")
console.log("   - LegacyGame error type")
console.log("   - Comprehensive error causes mapping")
console.log("")
console.log("🚀 You can now test the withdrawal status functionality")
