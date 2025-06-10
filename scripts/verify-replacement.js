const fs = require("fs")
const path = require("path")

function verifyReplacement() {
  console.log("🔍 Verifying viem file replacements...")

  try {
    const viemPath = path.join(process.cwd(), "node_modules", "viem")

    if (!fs.existsSync(viemPath)) {
      console.error("❌ viem package not found in node_modules")
      return false
    }

    // Check abis.js
    const abisPath = path.join(viemPath, "_esm", "op-stack", "abis.js")
    if (fs.existsSync(abisPath)) {
      const abisContent = fs.readFileSync(abisPath, "utf8")
      const hasUnproven = abisContent.includes("OptimismPortal_Unproven")
      const hasProofNotOldEnough = abisContent.includes("OptimismPortal_ProofNotOldEnough")

      if (hasUnproven && hasProofNotOldEnough) {
        console.log("✅ abis.js contains required error types")
      } else {
        console.log("❌ abis.js missing error types:", {
          hasUnproven,
          hasProofNotOldEnough,
        })
        return false
      }
    } else {
      console.error("❌ abis.js not found")
      return false
    }

    // Check getWithdrawalStatus.js
    const getWithdrawalStatusPath = path.join(viemPath, "_esm", "op-stack", "actions", "getWithdrawalStatus.js")
    if (fs.existsSync(getWithdrawalStatusPath)) {
      const statusContent = fs.readFileSync(getWithdrawalStatusPath, "utf8")
      const hasUnprovenMapping = statusContent.includes("'OptimismPortal_Unproven'")
      const hasProofNotOldEnoughMapping = statusContent.includes("'OptimismPortal_ProofNotOldEnough'")

      if (hasUnprovenMapping && hasProofNotOldEnoughMapping) {
        console.log("✅ getWithdrawalStatus.js contains required error mappings")
      } else {
        console.log("❌ getWithdrawalStatus.js missing error mappings:", {
          hasUnprovenMapping,
          hasProofNotOldEnoughMapping,
        })
        return false
      }
    } else {
      console.error("❌ getWithdrawalStatus.js not found")
      return false
    }

    console.log("🎉 All viem file replacements verified successfully!")
    return true
  } catch (error) {
    console.error("❌ Error verifying replacements:", error)
    return false
  }
}

verifyReplacement()
