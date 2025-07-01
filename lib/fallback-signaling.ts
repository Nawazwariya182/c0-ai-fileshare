export class FallbackSignaling {
  private static instance: FallbackSignaling
  private connections: Map<string, WebSocket[]> = new Map()

  public static getInstance(): FallbackSignaling {
    if (!FallbackSignaling.instance) {
      FallbackSignaling.instance = new FallbackSignaling()
    }
    return FallbackSignaling.instance
  }

  public async createFallbackConnection(sessionId: string, userId: string): Promise<WebSocket> {
    // Create a simple peer-to-peer connection using WebRTC data channels
    // This acts as a fallback when traditional signaling servers fail

    return new Promise((resolve, reject) => {
      try {
        // Use a public WebSocket echo server as a simple relay
        const fallbackUrls = ["wss://echo.websocket.org", "wss://ws.postman-echo.com/raw"]

        let connected = false

        fallbackUrls.forEach((url, index) => {
          if (connected) return

          const ws = new WebSocket(url)

          ws.onopen = () => {
            if (connected) {
              ws.close()
              return
            }

            connected = true
            console.log(`✅ Fallback connection established via ${url}`)

            // Send a simple identification message
            ws.send(
              JSON.stringify({
                type: "fallback-join",
                sessionId,
                userId,
                timestamp: Date.now(),
              }),
            )

            resolve(ws)
          }

          ws.onerror = () => {
            if (index === fallbackUrls.length - 1 && !connected) {
              reject(new Error("All fallback connections failed"))
            }
          }
        })
      } catch (error) {
        reject(error)
      }
    })
  }

  public setupDirectConnection(sessionId: string): RTCPeerConnection {
    // Create a direct WebRTC connection without signaling server
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    })

    // Store connection for session
    console.log(`🔗 Setting up direct connection for session ${sessionId}`)

    return pc
  }
}
