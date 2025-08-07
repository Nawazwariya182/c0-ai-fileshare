// In-browser file preview functionality
export interface PreviewResult {
  canPreview: boolean
  previewType: 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'none'
  previewData?: string
  error?: string
}

export class FilePreviewGenerator {
  private static readonly MAX_TEXT_SIZE = 1024 * 1024 // 1MB
  private static readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

  static async generatePreview(file: File): Promise<PreviewResult> {
    try {
      const previewType = this.getPreviewType(file)
      
      if (previewType === 'none') {
        return { canPreview: false, previewType: 'none' }
      }

      switch (previewType) {
        case 'image':
          return await this.generateImagePreview(file)
        case 'text':
          return await this.generateTextPreview(file)
        case 'pdf':
          return await this.generatePDFPreview(file)
        case 'video':
          return await this.generateVideoPreview(file)
        case 'audio':
          return await this.generateAudioPreview(file)
        default:
          return { canPreview: false, previewType: 'none' }
      }
    } catch (error) {
      return {
        canPreview: false,
        previewType: 'none',
        error: error instanceof Error ? error.message : 'Preview generation failed'
      }
    }
  }

  private static getPreviewType(file: File): PreviewResult['previewType'] {
    const { type, name } = file
    
    // Image files
    if (type.startsWith('image/')) {
      return 'image'
    }
    
    // Text files
    if (type.startsWith('text/') || 
        type === 'application/json' ||
        type === 'application/xml' ||
        name.match(/\.(txt|md|json|xml|html|css|js|ts|py|php|java|cpp|c|h|log|csv)$/i)) {
      return 'text'
    }
    
    // PDF files
    if (type === 'application/pdf') {
      return 'pdf'
    }
    
    // Video files
    if (type.startsWith('video/')) {
      return 'video'
    }
    
    // Audio files
    if (type.startsWith('audio/')) {
      return 'audio'
    }
    
    return 'none'
  }

  private static async generateImagePreview(file: File): Promise<PreviewResult> {
    if (file.size > this.MAX_IMAGE_SIZE) {
      return {
        canPreview: false,
        previewType: 'image',
        error: 'Image too large for preview'
      }
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          canPreview: true,
          previewType: 'image',
          previewData: reader.result as string
        })
      }
      reader.onerror = () => {
        resolve({
          canPreview: false,
          previewType: 'image',
          error: 'Failed to read image file'
        })
      }
      reader.readAsDataURL(file)
    })
  }

  private static async generateTextPreview(file: File): Promise<PreviewResult> {
    if (file.size > this.MAX_TEXT_SIZE) {
      return {
        canPreview: false,
        previewType: 'text',
        error: 'Text file too large for preview'
      }
    }

    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const content = reader.result as string
        // Truncate very long content
        const truncated = content.length > 102400 ? 
          content.substring(0, 102400) + '\n\n... (truncated)' : 
          content
        
        resolve({
          canPreview: true,
          previewType: 'text',
          previewData: truncated
        })
      }
      reader.onerror = () => {
        resolve({
          canPreview: false,
          previewType: 'text',
          error: 'Failed to read text file'
        })
      }
      reader.readAsText(file)
    })
  }

  private static async generatePDFPreview(file: File): Promise<PreviewResult> {
    // For PDF, we'll create a data URL that can be used in an iframe
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          canPreview: true,
          previewType: 'pdf',
          previewData: reader.result as string
        })
      }
      reader.onerror = () => {
        resolve({
          canPreview: false,
          previewType: 'pdf',
          error: 'Failed to read PDF file'
        })
      }
      reader.readAsDataURL(file)
    })
  }

  private static async generateVideoPreview(file: File): Promise<PreviewResult> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          canPreview: true,
          previewType: 'video',
          previewData: reader.result as string
        })
      }
      reader.onerror = () => {
        resolve({
          canPreview: false,
          previewType: 'video',
          error: 'Failed to read video file'
        })
      }
      reader.readAsDataURL(file)
    })
  }

  private static async generateAudioPreview(file: File): Promise<PreviewResult> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve({
          canPreview: true,
          previewType: 'audio',
          previewData: reader.result as string
        })
      }
      reader.onerror = () => {
        resolve({
          canPreview: false,
          previewType: 'audio',
          error: 'Failed to read audio file'
        })
      }
      reader.readAsDataURL(file)
    })
  }
}
