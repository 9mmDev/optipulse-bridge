const fs = require("fs")
const path = require("path")

console.log("🔍 Debugging viem package structure...")

const viemPath = path.join(process.cwd(), "node_modules", "viem")

if (!fs.existsSync(viemPath)) {
  console.error("❌ viem package not found")
  process.exit(1)
}

console.log("📁 viem package found at:", viemPath)

// Check _esm directory
const esmPath = path.join(viemPath, "_esm")
if (fs.existsSync(esmPath)) {
  console.log("✅ _esm directory exists")

  // Check op-stack directory
  const opStackPath = path.join(esmPath, "op-stack")
  if (fs.existsSync(opStackPath)) {
    console.log("✅ op-stack directory exists")

    // List contents of op-stack directory
    const opStackContents = fs.readdirSync(opStackPath)
    console.log("📂 op-stack contents:", opStackContents)

    // Check for abis.js
    const abisPath = path.join(opStackPath, "abis.js")
    if (fs.existsSync(abisPath)) {
      console.log("✅ abis.js exists")

      // Read first few lines to verify content
      const abisContent = fs.readFileSync(abisPath, "utf8")
      const firstLines = abisContent.split("\n").slice(0, 10).join("\n")
      console.log("📄 First 10 lines of abis.js:")
      console.log(firstLines)

      // Check if it contains portal2Abi
      if (abisContent.includes("portal2Abi")) {
        console.log("✅ abis.js contains portal2Abi")

        // Check if already patched
        if (abisContent.includes("OptimismPortal_Unproven")) {
          console.log("✅ abis.js already contains OptimismPortal_Unproven")
        } else {
          console.log("❌ abis.js missing OptimismPortal_Unproven")
        }

        if (abisContent.includes("OptimismPortal_ProofNotOldEnough")) {
          console.log("✅ abis.js already contains OptimismPortal_ProofNotOldEnough")
        } else {
          console.log("❌ abis.js missing OptimismPortal_ProofNotOldEnough")
        }
      } else {
        console.log("❌ abis.js does not contain portal2Abi")
      }
    } else {
      console.log("❌ abis.js not found")
    }

    // Check actions directory
    const actionsPath = path.join(opStackPath, "actions")
    if (fs.existsSync(actionsPath)) {
      console.log("✅ actions directory exists")

      // List contents of actions directory
      const actionsContents = fs.readdirSync(actionsPath)
      console.log("📂 actions contents:", actionsContents)

      // Check for getWithdrawalStatus.js
      const statusPath = path.join(actionsPath, "getWithdrawalStatus.js")
      if (fs.existsSync(statusPath)) {
        console.log("✅ getWithdrawalStatus.js exists")

        // Read first few lines to verify content
        const statusContent = fs.readFileSync(statusPath, "utf8")
        const firstLines = statusContent.split("\n").slice(0, 10).join("\n")
        console.log("📄 First 10 lines of getWithdrawalStatus.js:")
        console.log(firstLines)

        // Check if it contains the function
        if (statusContent.includes("getWithdrawalStatus")) {
          console.log("✅ getWithdrawalStatus.js contains getWithdrawalStatus function")

          // Check if already patched
          if (statusContent.includes("OptimismPortal_Unproven")) {
            console.log("✅ getWithdrawalStatus.js already contains OptimismPortal_Unproven")
          } else {
            console.log("❌ getWithdrawalStatus.js missing OptimismPortal_Unproven")
          }

          if (statusContent.includes("OptimismPortal_ProofNotOldEnough")) {
            console.log("✅ getWithdrawalStatus.js already contains OptimismPortal_ProofNotOldEnough")
          } else {
            console.log("❌ getWithdrawalStatus.js missing OptimismPortal_ProofNotOldEnough")
          }
        } else {
          console.log("❌ getWithdrawalStatus.js does not contain getWithdrawalStatus function")
        }
      } else {
        console.log("❌ getWithdrawalStatus.js not found")
      }
    } else {
      console.log("❌ actions directory not found")
    }
  } else {
    console.log("❌ op-stack directory not found")
  }
} else {
  console.log("❌ _esm directory not found")
}

console.log("\n🔍 Debug complete!")
