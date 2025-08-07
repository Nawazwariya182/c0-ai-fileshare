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
      const fileType = file.type.toLowerCase()
      const fileName = file.name.toLowerCase()
      
      // Image files
      if (fileType.startsWith('image/')) {
        if (file.size > this.MAX_IMAGE_SIZE) {
          return {
            canPreview: false,
            previewType: 'none',
            error: 'Image too large for preview'
          }
        }
        
        const dataUrl = await this.fileToDataUrl(file)
        return {
          canPreview: true,
          previewType: 'image',
          previewData: dataUrl
        }
      }
      
      // Text files
      if (fileType.startsWith('text/') || 
          fileName.endsWith('.txt') || 
          fileName.endsWith('.md') || 
          fileName.endsWith('.json') ||
          fileName.endsWith('.js') ||
          fileName.endsWith('.ts') ||
          fileName.endsWith('.jsx') ||
          fileName.endsWith('.tsx') ||
          fileName.endsWith('.css') ||
          fileName.endsWith('.html') ||
          fileName.endsWith('.xml') ||
          fileName.endsWith('.csv')) {
        
        if (file.size > this.MAX_TEXT_SIZE) {
          return {
            canPreview: false,
            previewType: 'none',
            error: 'Text file too large for preview'
          }
        }
        
        const text = await this.fileToText(file)
        return {
          canPreview: true,
          previewType: 'text',
          previewData: text
        }
      }
      
      // PDF files
      if (fileType === 'application/pdf') {
        const dataUrl = await this.fileToDataUrl(file)
        return {
          canPreview: true,
          previewType: 'pdf',
          previewData: dataUrl
        }
      }
      
      // Video files
      if (fileType.startsWith('video/')) {
        const dataUrl = await this.fileToDataUrl(file)
        return {
          canPreview: true,
          previewType: 'video',
          previewData: dataUrl
        }
      }
      
      // Audio files
      if (fileType.startsWith('audio/')) {
        const dataUrl = await this.fileToDataUrl(file)
        return {
          canPreview: true,
          previewType: 'audio',
          previewData: dataUrl
        }
      }
      
      // Unsupported file type
      return {
        canPreview: false,
        previewType: 'none'
      }
      
    } catch (error) {
      console.error('Preview generation error:', error)
      return {
        canPreview: false,
        previewType: 'none',
        error: 'Failed to generate preview'
      }
    }
  }
  
  private static fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  
  private static fileToText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }
}
