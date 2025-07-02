// Session expiry and replay protection
export interface SessionInfo {
  id: string
  createdAt: Date
  expiresAt: Date
  isExpired: boolean
  token: string
}

export class SessionManager {
  private static readonly SESSION_DURATION = 10 * 60 * 10240 // 10 minutes
  private static readonly WARNING_TIME = 2 * 60 * 10240 // 2 minutes before expiry
  private static sessions = new Map<string, SessionInfo>()

  static createSession(sessionId: string): SessionInfo {
    const now = new Date()
    const session: SessionInfo = {
      id: sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.SESSION_DURATION),
      isExpired: false,
      token: this.generateToken()
    }

    this.sessions.set(sessionId, session)
    
    // Auto-expire session
    setTimeout(() => {
      this.expireSession(sessionId)
    }, this.SESSION_DURATION)

    return session
  }

  static getSession(sessionId: string): SessionInfo | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    // Check if expired
    if (new Date() > session.expiresAt) {
      session.isExpired = true
      this.expireSession(sessionId)
      return null
    }

    return session
  }

  static validateSession(sessionId: string, token?: string): boolean {
    const session = this.getSession(sessionId)
    if (!session || session.isExpired) return false

    // If token provided, validate it
    if (token && session.token !== token) return false

    return true
  }

  static extendSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.isExpired) return false

    const now = new Date()
    session.expiresAt = new Date(now.getTime() + this.SESSION_DURATION)
    
    return true
  }

  static expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isExpired = true
      // Keep in map for replay protection, but mark as expired
    }
  }

  static getTimeUntilExpiry(sessionId: string): number {
    const session = this.getSession(sessionId)
    if (!session) return 0

    return Math.max(0, session.expiresAt.getTime() - new Date().getTime())
  }

  static shouldShowWarning(sessionId: string): boolean {
    const timeLeft = this.getTimeUntilExpiry(sessionId)
    return timeLeft > 0 && timeLeft <= this.WARNING_TIME
  }

  static cleanupExpiredSessions(): void {
    const now = new Date()
    const expiredSessions: string[] = []

    this.sessions.forEach((session, sessionId) => {
      // Remove sessions that expired more than 1 hour ago
      if (session.isExpired && (now.getTime() - session.expiresAt.getTime()) > 60 * 60 * 10240) {
        expiredSessions.push(sessionId)
      }
    })

    expiredSessions.forEach(sessionId => {
      this.sessions.delete(sessionId)
    })
  }

  private static generateToken(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // Initialize cleanup interval
  static {
    if (typeof window !== 'undefined') {
      setInterval(() => {
        this.cleanupExpiredSessions()
      }, 60 * 10240) // Cleanup every minute
    }
  }
}
