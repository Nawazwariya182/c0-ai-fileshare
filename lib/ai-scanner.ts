// AI-based file risk detection using Gemini API
export interface ScanResult {
  isRisky: boolean
  reason?: string
  confidence: number
}

export class AIFileScanner {
  private apiKey: string
  private endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async scanFile(file: File): Promise<ScanResult> {
    try {
      // First check file extension and MIME type
      const extensionCheck = this.checkFileExtension(file)
      if (extensionCheck.isRisky) {
        return extensionCheck
      }

      // For text/code files, scan content with AI
      if (this.isTextFile(file)) {
        return await this.scanTextContent(file)
      }

      // For binary files, use heuristic checks
      return this.scanBinaryFile(file)
    } catch (error) {
      console.error('AI scan error:', error)
      // Fail safe - if AI scan fails, use basic checks
      return this.checkFileExtension(file)
    }
  }

  private checkFileExtension(file: File): ScanResult {
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.app',
      '.sh', '.bash', '.zsh', '.ps1', '.vbs', '.js', '.jar', '.deb',
      '.rpm', '.dmg', '.pkg', '.run', '.bin'
    ]

    const fileName = file.name.toLowerCase()
    const extension = '.' + fileName.split('.').pop()

    if (dangerousExtensions.includes(extension)) {
      return {
        isRisky: true,
        reason: `Executable file type (${extension}) is not allowed for security`,
        confidence: 1.0
      }
    }

    // Check MIME type
    const dangerousMimeTypes = [
      'application/x-executable',
      'application/x-msdownload',
      'application/x-msdos-program',
      'application/x-sh',
      'application/javascript',
      'text/javascript'
    ]

    if (dangerousMimeTypes.includes(file.type)) {
      return {
        isRisky: true,
        reason: `Dangerous MIME type (${file.type}) detected`,
        confidence: 0.9
      }
    }

    return { isRisky: false, confidence: 0.8 }
  }

  private isTextFile(file: File): boolean {
    const textTypes = [
      'text/', 'application/json', 'application/xml', 'application/javascript',
      'application/typescript', 'application/x-python', 'application/x-php'
    ]
    
    return textTypes.some(type => file.type.startsWith(type)) || 
           !!file.name.match(/\.(txt|md|json|xml|html|css|js|ts|py|php|java|cpp|c|h)$/i)
  }

  private async scanTextContent(file: File): Promise<ScanResult> {
    try {
      const content = await this.readFileAsText(file)
      
      // Limit content size for API (max 30KB)
      const truncatedContent = content.substring(0, 30000)
      
      const prompt = `Analyze this file content for security risks. Look for:
- Malicious code patterns
- Suspicious scripts or commands
- Potential malware signatures
- Social engineering attempts
- Obfuscated or encoded malicious content

File name: ${file.name}
File type: ${file.type}
Content:
${truncatedContent}

Respond with JSON: {"isRisky": boolean, "reason": "explanation", "confidence": 0.0-1.0}`

      const response = await fetch(`${this.endpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`)
      }

      const data = await response.json()
      const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text

      if (!aiResponse) {
        throw new Error('Invalid AI response format')
      }

      // Parse AI response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0])
        return {
          isRisky: result.isRisky || false,
          reason: result.reason || 'AI analysis completed',
          confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1)
        }
      }

      // Fallback if JSON parsing fails
      const isRisky = aiResponse.toLowerCase().includes('risky') || 
                     aiResponse.toLowerCase().includes('malicious') ||
                     aiResponse.toLowerCase().includes('dangerous')

      return {
        isRisky,
        reason: isRisky ? 'AI detected potential security risk' : 'AI scan passed',
        confidence: 0.7
      }

    } catch (error) {
      console.error('AI content scan error:', error)
      // Fallback to extension check
      return this.checkFileExtension(file)
    }
  }

  private scanBinaryFile(file: File): ScanResult {
    // For binary files, use size and name heuristics
    const suspiciousNames = [
      'setup', 'install', 'update', 'patch', 'crack', 'keygen',
      'loader', 'injector', 'trojan', 'virus', 'malware'
    ]

    const fileName = file.name.toLowerCase()
    const hasSuspiciousName = suspiciousNames.some(name => fileName.includes(name))

    if (hasSuspiciousName) {
      return {
        isRisky: true,
        reason: 'Suspicious file name pattern detected',
        confidence: 0.8
      }
    }

    // Very large files might be suspicious
    if (file.size > 500 * 100 * 100) { // 500MB
      return {
        isRisky: true,
        reason: 'File size exceeds safety limits',
        confidence: 0.6
      }
    }

    return { isRisky: false, confidence: 0.7 }
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(file)
    })
  }
}

// Singleton instance
let scannerInstance: AIFileScanner | null = null

export function getAIScanner(): AIFileScanner | null {
  if (typeof window === 'undefined') return null
  
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    console.warn('Gemini API key not found. AI scanning disabled.')
    return null
  }

  if (!scannerInstance) {
    scannerInstance = new AIFileScanner(apiKey)
  }

  return scannerInstance
}
