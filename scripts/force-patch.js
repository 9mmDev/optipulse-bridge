const fs = require("fs")
const path = require("path")

console.log("🧹 Force cleaning and re-patching viem/op-stack...")

// Paths to the files we need to patch
const abisPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/abis.js")
const statusPath = path.join(process.cwd(), "node_modules/viem/_esm/op-stack/actions/getWithdrawalStatus.js")

// Restore from backups if they exist
if (fs.existsSync(abisPath + ".backup")) {
  console.log("📁 Restoring abis.js from backup...")
  fs.copyFileSync(abisPath + ".backup", abisPath)
}

if (fs.existsSync(statusPath + ".backup")) {
  console.log("📁 Restoring getWithdrawalStatus.js from backup...")
  fs.copyFileSync(statusPath + ".backup", statusPath)
}

// Remove any existing patch files
const patchesDir = path.join(process.cwd(), "patches")
if (fs.existsSync(patchesDir)) {
  console.log("🗑️ Removing existing patch files...")
  const patchFiles = fs.readdirSync(patchesDir).filter((file) => file.startsWith("viem+"))
  patchFiles.forEach((file) => {
    fs.unlinkSync(path.join(patchesDir, file))
    console.log(`   Removed ${file}`)
  })
}

console.log("🔧 Running direct patch script...")

// Run the direct patch script
try {
  require("./direct-patch.js")
} catch (error) {
  console.error("❌ Error running direct patch script:", error.message)
  process.exit(1)
}
