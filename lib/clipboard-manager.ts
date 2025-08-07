export interface ClipboardData {
  content: string
  type: 'text' | 'html' | 'image'
  timestamp: Date
}

export class ClipboardManager {
  static async readClipboard(): Promise<string | null> {
    try {
      if (!navigator.clipboard) {
        console.warn('Clipboard API not available')
        return null
      }
      
      const text = await navigator.clipboard.readText()
      return text.trim() || null
    } catch (error) {
      console.error('Failed to read clipboard:', error)
      return null
    }
  }
  
  static async writeClipboard(content: string): Promise<boolean> {
    try {
      if (!navigator.clipboard) {
        console.warn('Clipboard API not available')
        return false
      }
      
      await navigator.clipboard.writeText(content)
      return true
    } catch (error) {
      console.error('Failed to write clipboard:', error)
      return false
    }
  }
  
  static validateClipboardContent(content: string): { isValid: boolean; reason?: string } {
    if (!content || content.trim().length === 0) {
      return { isValid: false, reason: 'Clipboard is empty' }
    }
    
    if (content.length > 100000) {
      return { isValid: false, reason: 'Content too large (max 100KB)' }
    }
    
    // Check for potentially harmful content
    const dangerousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi
    ]
    
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'Content contains potentially harmful code' }
      }
    }
    
    return { isValid: true }
  }
  
  static sanitizeClipboardContent(content: string): string {
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .substring(0, 100000) // Limit length
  }
}
