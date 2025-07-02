// Clipboard sharing functionality
export interface ClipboardData {
  id: string
  content: string
  timestamp: Date
  sender: string
}

export class ClipboardManager {
  private static readonly MAX_CLIPBOARD_SIZE = 100 * 100 // 100KB

  static async readClipboard(): Promise<string | null> {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        throw new Error('Clipboard API not supported')
      }

      const text = await navigator.clipboard.readText()
      return text.trim()
    } catch (error) {
      console.error('Failed to read clipboard:', error)
      return null
    }
  }

  static async writeClipboard(text: string): Promise<boolean> {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('Clipboard API not supported')
      }

      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.error('Failed to write clipboard:', error)
      return false
    }
  }

  static sanitizeClipboardContent(content: string): string {
    // Remove potentially dangerous content
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim()
      .substring(0, this.MAX_CLIPBOARD_SIZE) // Limit size
  }

  static validateClipboardContent(content: string): { isValid: boolean; reason?: string } {
    if (!content || content.length === 0) {
      return { isValid: false, reason: 'Clipboard is empty' }
    }

    if (content.length > this.MAX_CLIPBOARD_SIZE) {
      return { isValid: false, reason: 'Clipboard content too large' }
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /eval\s*\(/i,
      /function\s*\(/i,
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i
    ]

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'Clipboard contains potentially dangerous content' }
      }
    }

    return { isValid: true }
  }

  static createClipboardData(content: string, sender: string): ClipboardData {
    return {
      id: Math.random().toString(36).substring(2, 15),
      content: this.sanitizeClipboardContent(content),
      timestamp: new Date(),
      sender
    }
  }
}
