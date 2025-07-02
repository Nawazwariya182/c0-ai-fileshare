// Mobile Connection Manager - Handles background mode, network changes, and mobile-specific optimizations
export class MobileConnectionManager {
  private isInitialized = false
  private isBackground = false
  private networkType = "unknown"
  private connectionStrength: "excellent" | "good" | "poor" = "good"
  private serviceWorker: ServiceWorker | null = null
  private wakeLock: any = null
  private visibilityChangeHandler: (() => void) | null = null
  private networkChangeHandler: (() => void) | null = null
  private beforeUnloadHandler: (() => void) | null = null

  // Event handlers
  public onBackgroundStateChange: ((isBackground: boolean) => void) | null = null
  public onNetworkChange: ((networkType: string) => void) | null = null
  public onConnectionStrengthChange: ((strength: "excellent" | "good" | "poor") => void) | null = null

  public async initialize() {
    if (this.isInitialized) return

    console.log("📱 Initializing Mobile Connection Manager")

    // Register service worker for background operation
    await this.registerServiceWorker()

    // Setup mobile-specific event listeners
    this.setupVisibilityHandling()
    this.setupNetworkMonitoring()
    this.setupWakeLock()
    this.setupBeforeUnloadHandler()

    // Mobile browser optimizations
    this.optimizeForMobile()

    this.isInitialized = true
    console.log("✅ Mobile Connection Manager initialized")
  }

  public destroy() {
    console.log("🛑 Destroying Mobile Connection Manager")

    // Remove event listeners
    if (this.visibilityChangeHandler) {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler)
    }
    if (this.networkChangeHandler && "connection" in navigator) {
      ;(navigator as any).connection.removeEventListener("change", this.networkChangeHandler)
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler)
    }

    // Release wake lock
    this.releaseWakeLock()

    this.isInitialized = false
  }

  private async registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.log("⚠️ Service Worker not supported")
      return
    }

    try {
      // Create service worker code dynamically
      const swCode = `
        // Bulletproof P2P Service Worker
        const CACHE_NAME = 'bulletproof-p2p-v1';
        
        // Keep connections alive in background
        let connections = new Map();
        let keepAliveInterval = null;
        
        self.addEventListener('install', (event) => {
          console.log('📱 Service Worker installed');
          self.skipWaiting();
        });
        
        self.addEventListener('activate', (event) => {
          console.log('📱 Service Worker activated');
          event.waitUntil(self.clients.claim());
          startKeepAlive();
        });
        
        self.addEventListener('message', (event) => {
          const { type, data } = event.data;
          
          switch (type) {
            case 'REGISTER_CONNECTION':
              connections.set(data.sessionId, {
                ...data,
                lastSeen: Date.now()
              });
              console.log('📱 Connection registered:', data.sessionId);
              break;
              
            case 'UNREGISTER_CONNECTION':
              connections.delete(data.sessionId);
              console.log('📱 Connection unregistered:', data.sessionId);
              break;
              
            case 'KEEP_ALIVE':
              if (connections.has(data.sessionId)) {
                const conn = connections.get(data.sessionId);
                conn.lastSeen = Date.now();
                connections.set(data.sessionId, conn);
              }
              break;
          }
        });
        
        function startKeepAlive() {
          if (keepAliveInterval) clearInterval(keepAliveInterval);
          
          keepAliveInterval = setInterval(() => {
            const now = Date.now();
            
            connections.forEach((conn, sessionId) => {
              // Send keep-alive to all registered connections
              self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                  client.postMessage({
                    type: 'KEEP_ALIVE_TICK',
                    sessionId: sessionId,
                    timestamp: now
                  });
                });
              });
            });
          }, 5000); // Every 5 seconds
        }
        
        // Handle background sync
        self.addEventListener('sync', (event) => {
          if (event.tag === 'background-sync') {
            event.waitUntil(handleBackgroundSync());
          }
        });
        
        async function handleBackgroundSync() {
          console.log('📱 Background sync triggered');
          
          // Notify all clients to reconnect
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: 'BACKGROUND_SYNC',
              timestamp: Date.now()
            });
          });
        }
      `

      const blob = new Blob([swCode], { type: "application/javascript" })
      const swUrl = URL.createObjectURL(blob)

      const registration = await navigator.serviceWorker.register(swUrl)
      console.log("✅ Service Worker registered successfully")

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener("message", this.handleServiceWorkerMessage.bind(this))

      // Get active service worker
      this.serviceWorker = registration.active || registration.waiting || registration.installing

      // Clean up blob URL
      URL.revokeObjectURL(swUrl)
    } catch (error) {
      console.error("❌ Service Worker registration failed:", error)
    }
  }

  private handleServiceWorkerMessage(event: MessageEvent) {
    const { type, sessionId, timestamp } = event.data

    switch (type) {
      case "KEEP_ALIVE_TICK":
        console.log(`📱 Keep-alive tick for session ${sessionId}`)
        // This will be handled by the main P2P system
        break

      case "BACKGROUND_SYNC":
        console.log("📱 Background sync event received")
        // Trigger reconnection if needed
        break
    }
  }

  private setupVisibilityHandling() {
    this.visibilityChangeHandler = () => {
      const isHidden = document.hidden
      this.isBackground = isHidden

      console.log(`📱 Visibility changed: ${isHidden ? "hidden" : "visible"}`)

      if (isHidden) {
        // App went to background
        this.handleBackgroundMode()
      } else {
        // App came to foreground
        this.handleForegroundMode()
      }

      this.onBackgroundStateChange?.(this.isBackground)
    }

    document.addEventListener("visibilitychange", this.visibilityChangeHandler)

    // Additional mobile events
    window.addEventListener("pagehide", () => {
      console.log("📱 Page hide event")
      this.handleBackgroundMode()
    })

    window.addEventListener("pageshow", () => {
      console.log("📱 Page show event")
      this.handleForegroundMode()
    })

    // iOS-specific events
    window.addEventListener("blur", () => {
      console.log("📱 Window blur (iOS)")
      this.handleBackgroundMode()
    })

    window.addEventListener("focus", () => {
      console.log("📱 Window focus (iOS)")
      this.handleForegroundMode()
    })
  }

  private setupNetworkMonitoring() {
    // Network Information API
    if ("connection" in navigator) {
      const connection = (navigator as any).connection

      const updateNetworkInfo = () => {
        this.networkType = connection.effectiveType || connection.type || "unknown"
        console.log(`📶 Network type: ${this.networkType}`)

        // Update connection strength based on network type
        if (this.networkType.includes("4g") || this.networkType.includes("wifi")) {
          this.connectionStrength = "excellent"
        } else if (this.networkType.includes("3g")) {
          this.connectionStrength = "good"
        } else {
          this.connectionStrength = "poor"
        }

        this.onNetworkChange?.(this.networkType)
        this.onConnectionStrengthChange?.(this.connectionStrength)
      }

      this.networkChangeHandler = updateNetworkInfo
      connection.addEventListener("change", this.networkChangeHandler)

      // Initial network info
      updateNetworkInfo()
    }

    // Online/offline events
    window.addEventListener("online", () => {
      console.log("📶 Network online")
      this.onNetworkChange?.("online")
    })

    window.addEventListener("offline", () => {
      console.log("📶 Network offline")
      this.onNetworkChange?.("offline")
    })
  }

  private async setupWakeLock() {
    // Screen Wake Lock API to prevent device from sleeping
    if ("wakeLock" in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request("screen")
        console.log("📱 Wake lock acquired")

        this.wakeLock.addEventListener("release", () => {
          console.log("📱 Wake lock released")
        })
      } catch (error) {
        console.log("⚠️ Wake lock not available:", error)
      }
    }
  }

  private setupBeforeUnloadHandler() {
    this.beforeUnloadHandler = () => {
      console.log("📱 Before unload - preserving connection state")
      // This will be handled by the main P2P system
    }

    window.addEventListener("beforeunload", this.beforeUnloadHandler)
  }

  private optimizeForMobile() {
    // Prevent mobile browser from pausing JavaScript
    const keepAlive = () => {
      // Send keep-alive to service worker
      if (this.serviceWorker) {
        this.serviceWorker.postMessage({
          type: "KEEP_ALIVE",
          data: { timestamp: Date.now() },
        })
      }
    }

    // Keep-alive every 10 seconds
    setInterval(keepAlive, 102400)

    // Prevent iOS Safari from pausing
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      // Create invisible audio context to keep app active
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        gainNode.gain.value = 0 // Silent
        oscillator.frequency.value = 20000 // Inaudible frequency
        oscillator.start()

        console.log("📱 iOS keep-alive audio context created")
      } catch (error) {
        console.log("⚠️ Could not create audio context:", error)
      }
    }

    // Android Chrome optimizations
    if (/Android.*Chrome/.test(navigator.userAgent)) {
      // Request persistent notification permission
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().then((permission) => {
          console.log(`📱 Notification permission: ${permission}`)
        })
      }
    }
  }

  private handleBackgroundMode() {
    console.log("📱 Entering background mode")

    // Register connection with service worker
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "REGISTER_CONNECTION",
        data: {
          sessionId: "current", // This will be set by the main P2P system
          timestamp: Date.now(),
        },
      })
    }

    // Request background sync
    if ("serviceWorker" in navigator && "sync" in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then((registration) => {
        return (registration as any).sync.register("background-sync")
      })
    }
  }

  private handleForegroundMode() {
    console.log("📱 Entering foreground mode")

    // Re-acquire wake lock if needed
    if (!this.wakeLock || this.wakeLock.released) {
      this.setupWakeLock()
    }
  }

  private releaseWakeLock() {
    if (this.wakeLock && !this.wakeLock.released) {
      this.wakeLock.release()
      console.log("📱 Wake lock released")
    }
  }

  // Public methods for P2P system integration
  public registerConnection(sessionId: string) {
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "REGISTER_CONNECTION",
        data: { sessionId, timestamp: Date.now() },
      })
    }
  }

  public unregisterConnection(sessionId: string) {
    if (this.serviceWorker) {
      this.serviceWorker.postMessage({
        type: "UNREGISTER_CONNECTION",
        data: { sessionId },
      })
    }
  }

  public getNetworkType(): string {
    return this.networkType
  }

  public getConnectionStrength(): "excellent" | "good" | "poor" {
    return this.connectionStrength
  }

  public isInBackground(): boolean {
    return this.isBackground
  }
}
