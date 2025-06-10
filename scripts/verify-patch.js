const fs = require("fs")
const path = require("path")

console.log("🔍 Verifying viem/op-stack patches...")

// Paths to the files we need to check
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

let allPatchesApplied = true

// Check abis.js
try {
  console.log("📝 Checking abis.js...")
  const abisContent = fs.readFileSync(abisPath, "utf8")

  // Look for portal2Abi
  const portal2AbiMatch = abisContent.match(/export\s+const\s+portal2Abi\s*=\s*\[([\s\S]*?)\]\s*;?/m)

  if (!portal2AbiMatch) {
    console.error("❌ portal2Abi not found in abis.js")
    allPatchesApplied = false
  } else {
    console.log("✅ portal2Abi found in abis.js")

    const portal2AbiContent = portal2AbiMatch[1]

    if (portal2AbiContent.includes("OptimismPortal_Unproven")) {
      console.log("✅ OptimismPortal_Unproven found in portal2Abi")
    } else {
      console.error("❌ OptimismPortal_Unproven NOT found in portal2Abi")
      allPatchesApplied = false
    }

    if (portal2AbiContent.includes("OptimismPortal_ProofNotOldEnough")) {
      console.log("✅ OptimismPortal_ProofNotOldEnough found in portal2Abi")
    } else {
      console.error("❌ OptimismPortal_ProofNotOldEnough NOT found in portal2Abi")
      allPatchesApplied = false
    }
  }
} catch (error) {
  console.error("❌ Error checking abis.js:", error.message)
  allPatchesApplied = false
}

// Check getWithdrawalStatus.js
try {
  console.log("📝 Checking getWithdrawalStatus.js...")
  const statusContent = fs.readFileSync(statusPath, "utf8")

  if (statusContent.includes("OptimismPortal_Unproven")) {
    console.log("✅ OptimismPortal_Unproven found in getWithdrawalStatus.js")
  } else {
    console.error("❌ OptimismPortal_Unproven NOT found in getWithdrawalStatus.js")
    allPatchesApplied = false
  }

  if (statusContent.includes("OptimismPortal_ProofNotOldEnough")) {
    console.log("✅ OptimismPortal_ProofNotOldEnough found in getWithdrawalStatus.js")
  } else {
    console.error("❌ OptimismPortal_ProofNotOldEnough NOT found in getWithdrawalStatus.js")
    allPatchesApplied = false
  }
} catch (error) {
  console.error("❌ Error checking getWithdrawalStatus.js:", error.message)
  allPatchesApplied = false
}

if (allPatchesApplied) {
  console.log("🎉 All patches verified successfully!")
  console.log("✅ viem/op-stack is properly patched and ready to use")
} else {
  console.error("❌ Some patches are missing or not applied correctly")
  console.error("   Run: npm run patch:viem")
  process.exit(1)
}

console.log("🔍 Verification complete!")
