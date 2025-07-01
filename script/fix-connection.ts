import { WebSocket } from "ws"

async function fixConnection() {
  console.log("🔧 P2P File Sharing Connection Diagnostics")
  console.log("==========================================")

  // Test 1: Check if ports are available
  console.log("\n1. 🔍 Checking port availability...")

  const testPort = async (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const { createServer } = require("http")
      const server = createServer()

      server.listen(port, () => {
        server.close(() => resolve(true))
      })

      server.on("error", () => resolve(false))
    })
  }

  const port8080Available = await testPort(8080)
  const port3000Available = await testPort(3000)

  console.log(`   Port 8080 (WebSocket): ${port8080Available ? "✅ Available" : "❌ In use"}`)
  console.log(`   Port 3000 (Next.js): ${port3000Available ? "✅ Available" : "❌ In use"}`)

  // Test 2: Try to connect to WebSocket server
  console.log("\n2. 🔌 Testing WebSocket connection...")

  const wsUrls = ["ws://localhost:8080", "ws://127.0.0.1:8080", "ws://0.0.0.0:8080"]

  let connected = false

  for (const url of wsUrls) {
    try {
      console.log(`   Trying ${url}...`)

      const ws = new WebSocket(url)

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error("Timeout"))
        }, 3000)

        ws.on("open", () => {
          clearTimeout(timeout)
          console.log(`   ✅ Connected to ${url}`)
          connected = true
          ws.close()
          resolve(true)
        })

        ws.on("error", (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      break
    } catch (error) {
      console.log(`   ❌ Failed to connect to ${url}`)
    }
  }

  // Test 3: Check if signaling server process is running
  console.log("\n3. 🔍 Checking running processes...")

  try {
    const { execSync } = require("child_process")

    // Check for Node.js processes on port 8080
    let processes = ""
    try {
      if (process.platform === "win32") {
        processes = execSync("netstat -ano | findstr :8080", { encoding: "utf8" })
      } else {
        processes = execSync("lsof -i :8080", { encoding: "utf8" })
      }

      if (processes.trim()) {
        console.log("   ✅ Process found on port 8080:")
        console.log(`   ${processes.trim()}`)
      } else {
        console.log("   ❌ No process found on port 8080")
      }
    } catch (error) {
      console.log("   ❌ No process found on port 8080")
    }
  } catch (error) {
    console.log("   ⚠️ Could not check processes")
  }

  // Provide solutions
  console.log("\n4. 💡 Solutions:")
  console.log("==================")

  if (!connected) {
    console.log("❌ WebSocket server is not running. Try these solutions:")
    console.log("")
    console.log("🔧 Option 1 - Start Development Servers:")
    console.log("   npm run dev")
    console.log("")
    console.log("🔧 Option 2 - Start Production Servers:")
    console.log("   npm run build")
    console.log("   npm run start:production")
    console.log("")
    console.log("🔧 Option 3 - Start Signaling Server Only:")
    console.log("   npm run dev:signaling")
    console.log("")
    console.log("🔧 Option 4 - Use PM2 (Production):")
    console.log("   npm install -g pm2")
    console.log("   npm run pm2:start")
    console.log("")
    console.log("🔧 Option 5 - Manual Start:")
    console.log("   # Terminal 1:")
    console.log("   npx tsx signaling-server/index.ts")
    console.log("   # Terminal 2:")
    console.log("   npm run dev:next")
  } else {
    console.log("✅ WebSocket server is running correctly!")
    console.log("   If you're still having issues, try:")
    console.log("   1. Refresh your browser")
    console.log("   2. Clear browser cache")
    console.log("   3. Check browser console for errors")
  }

  // Test 4: Environment check
  console.log("\n5. 🔍 Environment Check:")
  console.log("========================")

  const envFile = require("fs").existsSync(".env.local")
  console.log(`   .env.local file: ${envFile ? "✅ Found" : "❌ Missing"}`)

  if (envFile) {
    const envContent = require("fs").readFileSync(".env.local", "utf8")
    const hasWsUrl = envContent.includes("NEXT_PUBLIC_WS_URL")
    console.log(`   WebSocket URL configured: ${hasWsUrl ? "✅ Yes" : "❌ No"}`)

    if (hasWsUrl) {
      const wsUrlMatch = envContent.match(/NEXT_PUBLIC_WS_URL=(.+)/)
      if (wsUrlMatch) {
        console.log(`   WebSocket URL: ${wsUrlMatch[1]}`)
      }
    }
  }

  console.log("\n6. 🚀 Quick Start Commands:")
  console.log("===========================")
  console.log("   Development: npm run dev")
  console.log("   Production:  npm run start:production")
  console.log("   Check:       npm run check-server")
  console.log("   Fix:         npm run fix-connection")
}

fixConnection().catch(console.error)
