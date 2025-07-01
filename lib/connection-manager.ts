export interface ConnectionConfig {
  maxReconnectAttempts: number
  reconnectDelay: number
  connectionTimeout: number
  heartbeatInterval: number
  healthCheckInterval: number
}

export interface ServerEndpoint {
  url: string
  priority: number
  lastSuccess: number
  failureCount: number
  avgResponseTime: number
  isHealthy: boolean
}

export class ConnectionManager {
  private config: ConnectionConfig = {
    maxReconnectAttempts: 20, // Increased attempts
    reconnectDelay: 500, // Faster initial retry
    connectionTimeout: 5000, // Reduced timeout
    heartbeatInterval: 10000, // More frequent heartbeat
    healthCheckInterval: 30000, // Regular health checks
  }

  private endpoints: ServerEndpoint[] = []
  private currentEndpoint: ServerEndpoint | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private connectionPool: Map<string, WebSocket> = new Map()

  constructor() {
    this.initializeEndpoints()
    this.startHealthChecks()
  }

  private initializeEndpoints() {
    const baseEndpoints = [
      // Production endpoints
      "wss://signaling-server-1ckx.onrender.com",
      "wss://p2p-signaling-backup.herokuapp.com",
      "wss://p2p-relay.railway.app",
      
      // Development endpoints
      "ws://localhost:8080",
      "ws://127.0.0.1:8080",
      "ws://0.0.0.0:8080",
    ]

    // Add custom endpoint if provided
    if (process.env.NEXT_PUBLIC_WS_URL) {
      baseEndpoints.unshift(process.env.NEXT_PUBLIC_WS_URL)
    }

    this.endpoints = baseEndpoints.map((url, index) => ({
      url,
      priority: index === 0 ? 10 : 5 - Math.floor(index / 2), // Higher priority for first few
      lastSuccess: 0,
      failureCount: 0,
      avgResponseTime: 1000,
      isHealthy: true,
    }))

    console.log(`🔗 Initialized ${this.endpoints.length} connection endpoints`)
  }

  private startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks()
    }, this.config.healthCheckInterval)
  }

  private async performHealthChecks() {
    console.log("🏥 Performing health checks on all endpoints...")
    
    const healthPromises = this.endpoints.map(async (endpoint) => {
      try {
        const startTime = Date.now()
        const response = await fetch(endpoint.url.replace('ws://', 'http://').replace('wss://', 'https://') + '/health', {
          method: 'GET',
          timeout: 3000,
        } as any)
        
        const responseTime = Date.now() - startTime
        
        if (response.ok) {
          endpoint.isHealthy = true
          endpoint.lastSuccess = Date.now()
          endpoint.avgResponseTime = (endpoint.avgResponseTime + responseTime) / 2
          endpoint.failureCount = Math.max(0, endpoint.failureCount - 1)
          console.log(`✅ ${endpoint.url} healthy (${responseTime}ms)`)
        } else {
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        endpoint.isHealthy = false
        endpoint.failureCount++
        console.log(`❌ ${endpoint.url} unhealthy: ${error}`)
      }
    })

    await Promise.allSettled(healthPromises)
    this.sortEndpointsByHealth()
  }

  private sortEndpointsByHealth() {
    this.endpoints.sort((a, b) => {
      // Healthy endpoints first
      if (a.isHealthy !== b.isHealthy) {
        return a.isHealthy ? -1 : 1
      }
      
      // Then by priority
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      
      // Then by failure count (fewer failures first)
      if (a.failureCount !== b.failureCount) {
        return a.failureCount - b.failureCount
      }
      
      // Finally by response time
      return a.avgResponseTime - b.avgResponseTime
    })
  }

  public async getOptimalConnection(): Promise<WebSocket> {
    // Try to reuse existing healthy connection
    for (const [url, ws] of this.connectionPool.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        console.log(`♻️ Reusing existing connection to ${url}`)
        return ws
      } else {
        this.connectionPool.delete(url)
      }
    }

    // Sort endpoints by health before attempting connection
    this.sortEndpointsByHealth()
    
    const healthyEndpoints = this.endpoints.filter(e => e.isHealthy)
    const endpointsToTry = healthyEndpoints.length > 0 ? healthyEndpoints : this.endpoints

    console.log(`🔍 Attempting connection to ${endpointsToTry.length} endpoints...`)

    // Try multiple endpoints in parallel for faster connection
    const connectionPromises = endpointsToTry.slice(0, 3).map(endpoint => 
      this.attemptConnection(endpoint)
    )

    try {
      const ws = await Promise.any(connectionPromises)
      console.log(`✅ Successfully connected to optimal endpoint`)
      return ws
    } catch (error) {
      console.error(`❌ All connection attempts failed:`, error)
      throw new Error("Failed to connect to any signaling server")
    }
  }

  private async attemptConnection(endpoint: ServerEndpoint): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Attempting connection to ${endpoint.url}...`)
      
      const startTime = Date.now()
      const ws = new WebSocket(endpoint.url)
      
      const timeout = setTimeout(() => {
        ws.close()
        endpoint.failureCount++
        endpoint.isHealthy = false
        reject(new Error(`Connection timeout to ${endpoint.url}`))
      }, this.config.connectionTimeout)

      ws.onopen = () => {
        clearTimeout(timeout)
        const responseTime = Date.now() - startTime
        
        endpoint.lastSuccess = Date.now()
        endpoint.avgResponseTime = (endpoint.avgResponseTime + responseTime) / 2
        endpoint.failureCount = Math.max(0, endpoint.failureCount - 1)
        endpoint.isHealthy = true
        this.currentEndpoint = endpoint
        
        // Add to connection pool
        this.connectionPool.set(endpoint.url, ws)
        
        console.log(`✅ Connected to ${endpoint.url} in ${responseTime}ms`)
        resolve(ws)
      }

      ws.onerror = (error) => {
        clearTimeout(timeout)
        endpoint.failureCount++
        endpoint.isHealthy = false
        console.log(`❌ Connection failed to ${endpoint.url}:`, error)
        reject(error)
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        this.connectionPool.delete(endpoint.url)
      }
    })
  }

  public async reconnectWithBackoff(attempt: number): Promise<WebSocket> {
    const delay = Math.min(this.config.reconnectDelay * Math.pow(1.5, attempt), 10000)
    console.log(`🔄 Reconnection attempt ${attempt + 1} in ${delay}ms...`)
    
    await new Promise(resolve => setTimeout(resolve, delay))
    return this.getOptimalConnection()
  }

  public markEndpointFailed(url: string) {
    const endpoint = this.endpoints.find(e => e.url === url)
    if (endpoint) {
      endpoint.failureCount++
      endpoint.isHealthy = false
      this.connectionPool.delete(url)
    }
  }

  public getConnectionStats() {
    return {
      totalEndpoints: this.endpoints.length,
      healthyEndpoints: this.endpoints.filter(e => e.isHealthy).length,
      currentEndpoint: this.currentEndpoint?.url,
      poolSize: this.connectionPool.size,
      endpoints: this.endpoints.map(e => ({
        url: e.url,
        isHealthy: e.isHealthy,
        failureCount: e.failureCount,
        avgResponseTime: e.avgResponseTime,
        priority: e.priority,
      }))
    }
  }

  public cleanup() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    
    for (const ws of this.connectionPool.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
    this.connectionPool.clear()
  }
}

export class FastHandshake {
  private static instance: FastHandshake
  private preConnections: Map<string, WebSocket> = new Map()
  
  public static getInstance(): FastHandshake {
    if (!FastHandshake.instance) {
      FastHandshake.instance = new FastHandshake()
    }
    return FastHandshake.instance
  }

  public async preWarmConnections(urls: string[]) {
    console.log("🔥 Pre-warming connections...")
    
    const preWarmPromises = urls.slice(0, 2).map(async (url) => {
      try {
        const ws = new WebSocket(url)
        
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            ws.close()
            resolve()
          }, 3000)

          ws.onopen = () => {
            clearTimeout(timeout)
            this.preConnections.set(url, ws)
            console.log(`🔥 Pre-warmed connection to ${url}`)
            resolve()
          }

          ws.onerror = () => {
            clearTimeout(timeout)
            resolve()
          }
        })
      } catch (error) {
        console.log(`❌ Failed to pre-warm ${url}:`, error)
      }
    })

    await Promise.allSettled(preWarmPromises)
  }

  public getPreWarmedConnection(url: string): WebSocket | null {
    const ws = this.preConnections.get(url)
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.preConnections.delete(url)
      return ws
    }
    return null
  }

  public cleanup() {
    for (const ws of this.preConnections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
    this.preConnections.clear()
  }
}
