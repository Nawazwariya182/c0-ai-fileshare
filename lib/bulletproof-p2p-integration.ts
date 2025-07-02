// Bulletproof P2P Integration - Combines all systems for maximum reliability
import { BulletproofConnectionEngine } from "./bulletproof-connection-engine"

interface FileTransferOptions {
  maxConcurrentFiles?: number
  chunkSize?: number
  enableChecksums?: boolean
  retryAttempts?: number
}

interface ConnectionOptions {
  enableBackgroundPersistence?: boolean
  adaptiveChunkSizing?: boolean
  redundantConnections?: boolean
  immediateReconnection?: boolean
}

export class BulletproofP2PSystem {
  private connectionEngine: BulletproofConnectionEngine
  private isInitialized = false
  private transferOptions: FileTransferOptions
  private connectionOptions: ConnectionOptions

  // Event handlers
  public onConnectionStatusChange: ((status: "connecting" | "connected" | "disconnected") => void) | null = null
  public onFileTransferUpdate: ((transfers: any[]) => void) | null = null
  public onError: ((error: string) => void) | null = null
  public onSpeedUpdate: ((speed: number) => void) | null = null
  public onReconnectionAttempt: ((attempt: number) => void) | null = null

  constructor(
    sessionId: string,
    userId: string,
    transferOptions: FileTransferOptions = {},
    connectionOptions: ConnectionOptions = {},
  ) {
    this.transferOptions = {
      maxConcurrentFiles: 3,
      chunkSize: 1048576, // 1MB default
      enableChecksums: true,
      retryAttempts: 3,
      ...transferOptions,
    }

    this.connectionOptions = {
      enableBackgroundPersistence: true,
      adaptiveChunkSizing: true,
      redundantConnections: true,
      immediateReconnection: true,
      ...connectionOptions,
    }

    this.connectionEngine = new BulletproofConnectionEngine(sessionId, userId)
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.connectionEngine.onConnectionStatusChange = (status) => {
      this.onConnectionStatusChange?.(status)
    }

    this.connectionEngine.onFileTransferUpdate = (transfers) => {
      this.onFileTransferUpdate?.(transfers)

      // Calculate and report speed
      const activeTransfers = transfers.filter((t) => t.status === "transferring")
      const totalSpeed = activeTransfers.reduce((sum, t) => sum + (t.speed || 0), 0)
      this.onSpeedUpdate?.(totalSpeed)
    }

    this.connectionEngine.onError = (error) => {
      this.onError?.(error)
    }

    this.connectionEngine.onReconnectionAttempt = (attempt) => {
      this.onReconnectionAttempt?.(attempt)
    }
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("⚠️ System already initialized")
      return
    }

    console.log("🚀 Initializing Bulletproof P2P System")
    console.log(`📊 Transfer options:`, this.transferOptions)
    console.log(`🔧 Connection options:`, this.connectionOptions)

    try {
      await this.connectionEngine.initialize()
      this.isInitialized = true
      console.log("✅ Bulletproof P2P System initialized successfully")
    } catch (error) {
      console.error("❌ Failed to initialize Bulletproof P2P System:", error)
      throw error
    }
  }

  public async sendFiles(files: File[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("System not initialized. Call initialize() first.")
    }

    if (files.length < 2 || files.length > 5) {
      throw new Error("File count must be between 2 and 5 for optimal transfer")
    }

    console.log(`📤 Starting bulletproof file transfer: ${files.length} files`)
    console.log(`📊 Total size: ${(files.reduce((sum, f) => sum + f.size, 0) / 100 / 100).toFixed(1)}MB`)

    try {
      await this.connectionEngine.sendFiles(files)
      console.log("✅ File transfer initiated successfully")
    } catch (error) {
      console.error("❌ File transfer failed:", error)
      throw error
    }
  }

  public pauseTransfer(fileId: string): void {
    this.connectionEngine.pauseTransfer(fileId)
  }

  public resumeTransfer(fileId: string): void {
    this.connectionEngine.resumeTransfer(fileId)
  }

  public cancelTransfer(fileId: string): void {
    this.connectionEngine.cancelTransfer(fileId)
  }

  public forceReconnect(): void {
    console.log("🔄 Forcing reconnection")
    this.connectionEngine.destroy()

    // Reinitialize after brief delay
    setTimeout(async () => {
      try {
        await this.connectionEngine.initialize()
        console.log("✅ Force reconnection successful")
      } catch (error) {
        console.error("❌ Force reconnection failed:", error)
        this.onError?.("Force reconnection failed")
      }
    }, 100)
  }

  public getConnectionHealth(): number {
    return this.connectionEngine.getConnectionHealth()
  }

  public getNetworkConditions(): any {
    return this.connectionEngine.getNetworkConditions()
  }

  public getPerformanceMetrics(): any {
    return this.connectionEngine.getPerformanceMetrics()
  }

  public destroy(): void {
    console.log("🛑 Destroying Bulletproof P2P System")
    this.connectionEngine.destroy()
    this.isInitialized = false
  }
}
