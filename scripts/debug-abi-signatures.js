const fs = require("fs")
const path = require("path")
const { keccak256, toHex } = require("viem")

console.log("🔍 Debugging ABI signatures and error types...")

// Function to calculate error signature
function calculateErrorSignature(errorName) {
  const errorSignature = `${errorName}()`
  const hash = keccak256(toHex(errorSignature))
  return hash.slice(0, 10) // First 4 bytes (8 hex chars + 0x)
}

// Check the current state of abis.js
const abisPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/abis.js")

if (!fs.existsSync(abisPath)) {
  console.error("❌ abis.js not found")
  process.exit(1)
}

console.log("📄 Reading abis.js...")
const abisContent = fs.readFileSync(abisPath, "utf8")

// Calculate expected signatures
const unprovenSig = calculateErrorSignature("OptimismPortal_Unproven")
const proofNotOldEnoughSig = calculateErrorSignature("OptimismPortal_ProofNotOldEnough")

console.log("🔢 Expected error signatures:")
console.log(`   OptimismPortal_Unproven(): ${unprovenSig}`)
console.log(`   OptimismPortal_ProofNotOldEnough(): ${proofNotOldEnoughSig}`)
console.log(`   Your error signature: 0xcca6afda`)

// Check if the error types are in the file
console.log("\n📋 Checking abis.js content:")
console.log(`   Contains 'OptimismPortal_Unproven': ${abisContent.includes("OptimismPortal_Unproven")}`)
console.log(
  `   Contains 'OptimismPortal_ProofNotOldEnough': ${abisContent.includes("OptimismPortal_ProofNotOldEnough")}`,
)

// Look for portal2Abi specifically
const portal2AbiMatch = abisContent.match(/export const portal2Abi = \[([\s\S]*?)\];/)
if (portal2AbiMatch) {
  console.log("✅ Found portal2Abi")

  const portal2AbiContent = portal2AbiMatch[1]
  console.log(
    `   portal2Abi contains 'OptimismPortal_Unproven': ${portal2AbiContent.includes("OptimismPortal_Unproven")}`,
  )
  console.log(
    `   portal2Abi contains 'OptimismPortal_ProofNotOldEnough': ${portal2AbiContent.includes("OptimismPortal_ProofNotOldEnough")}`,
  )

  // Count error types in portal2Abi
  const errorMatches = portal2AbiContent.match(/type:\s*['"]error['"]/g) || []
  console.log(`   Total error types in portal2Abi: ${errorMatches.length}`)

  // Show a snippet of the portal2Abi to see its structure
  const lines = portal2AbiContent.split("\n")
  console.log("\n📄 Last 20 lines of portal2Abi:")
  lines.slice(-20).forEach((line, index) => {
    console.log(`   ${lines.length - 20 + index + 1}: ${line}`)
  })
} else {
  console.error("❌ Could not find portal2Abi in abis.js")
}

// Check if the signature 0xcca6afda matches any known error
console.log("\n🔍 Analyzing the error signature 0xcca6afda:")
if (unprovenSig === "0xcca6afda") {
  console.log("✅ This matches OptimismPortal_Unproven()")
} else if (proofNotOldEnoughSig === "0xcca6afda") {
  console.log("✅ This matches OptimismPortal_ProofNotOldEnough()")
} else {
  console.log("❌ This signature doesn't match our expected error types")
  console.log("   This might be a different error or the ABI might not be properly updated")
}

console.log("\n🔍 Debug complete!")
