const fs = require("fs")
const path = require("path")

console.log("🧹 Clearing build cache...")

// Function to recursively delete a directory
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file)
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath)
      } else {
        fs.unlinkSync(curPath)
      }
    })
    fs.rmdirSync(folderPath)
  }
}

// Clear Next.js cache
const nextCachePath = path.join(process.cwd(), ".next")
if (fs.existsSync(nextCachePath)) {
  try {
    deleteFolderRecursive(nextCachePath)
    console.log("✅ Cleared .next cache")
  } catch (error) {
    console.log("⚠️ Could not clear .next cache:", error.message)
  }
} else {
  console.log("ℹ️ No .next cache found")
}

// Clear node_modules cache
const nodeModulesCachePath = path.join(process.cwd(), "node_modules", ".cache")
if (fs.existsSync(nodeModulesCachePath)) {
  try {
    deleteFolderRecursive(nodeModulesCachePath)
    console.log("✅ Cleared node_modules/.cache")
  } catch (error) {
    console.log("⚠️ Could not clear node_modules/.cache:", error.message)
  }
} else {
  console.log("ℹ️ No node_modules/.cache found")
}

// Clear TypeScript cache
const tsBuildInfoPath = path.join(process.cwd(), "tsconfig.tsbuildinfo")
if (fs.existsSync(tsBuildInfoPath)) {
  try {
    fs.unlinkSync(tsBuildInfoPath)
    console.log("✅ Cleared TypeScript build info")
  } catch (error) {
    console.log("⚠️ Could not clear TypeScript build info:", error.message)
  }
}

console.log("🎉 Cache clearing complete!")
