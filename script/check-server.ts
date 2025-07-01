// Check if signaling server is running
async function checkSignalingServer() {
  const WebSocket = require("ws")

  console.log("🔍 Checking signaling server...")

  try {
    const ws = new WebSocket("ws://localhost:8080")

    ws.on("open", () => {
      console.log("✅ Signaling server is running on ws://localhost:8080")
      ws.close()
      process.exit(0)
    })

    ws.on("error", (error: any) => {
      console.error("❌ Signaling server is not running:", error.message)
      console.log("💡 Start the server with: npm run dev:signaling")
      process.exit(1)
    })

    // Timeout after 5 seconds
    setTimeout(() => {
      console.error("⏰ Connection timeout - signaling server may not be running")
      console.log("💡 Start the server with: npm run dev:signaling")
      ws.close()
      process.exit(1)
    }, 5000)
  } catch (error) {
    console.error("❌ Failed to connect to signaling server:", error)
    process.exit(1)
  }
}

checkSignalingServer()
