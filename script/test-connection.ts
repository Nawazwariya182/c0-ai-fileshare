import { WebSocket } from "ws"

async function testConnection() {
  console.log("🧪 Testing WebSocket connection...")

  try {
    const ws = new WebSocket("ws://localhost:8080")

    ws.on("open", () => {
      console.log("✅ Successfully connected to signaling server!")

      // Test sending a message
      ws.send(
        JSON.stringify({
          type: "join",
          sessionId: "TEST01",
          userId: "test-user-123",
        }),
      )
    })

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString())
      console.log("📨 Received message:", message)

      if (message.type === "joined") {
        console.log("✅ Successfully joined test session!")
        ws.close()
        process.exit(0)
      }
    })

    ws.on("error", (error) => {
      console.error("❌ Connection failed:", error.message)
      console.log("💡 Make sure the signaling server is running:")
      console.log("   npm run dev:signaling")
      process.exit(1)
    })

    ws.on("close", () => {
      console.log("🔌 Connection closed")
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      console.error("⏰ Connection test timed out")
      console.log("💡 Make sure the signaling server is running:")
      console.log("   npm run dev:signaling")
      ws.close()
      process.exit(1)
    }, 102400)
  } catch (error) {
    console.error("❌ Test failed:", error)
    process.exit(1)
  }
}

testConnection()
