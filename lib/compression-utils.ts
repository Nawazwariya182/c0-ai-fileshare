export class CompressionUtils {
  private static compressionSupported: boolean | null = null
  
  public static async isCompressionSupported(): Promise<boolean> {
    if (this.compressionSupported !== null) {
      return this.compressionSupported
    }
    
    try {
      // Test compression support
      const testData = new Uint8Array(1024).fill(65) // Repeating 'A'
      const compressed = await this.compress(testData)
      const decompressed = await this.decompress(compressed)
      
      this.compressionSupported = decompressed.length === testData.length
      console.log(`🗜️ Compression support: ${this.compressionSupported}`)
      return this.compressionSupported
    } catch (error) {
      console.warn('⚠️ Compression not supported:', error)
      this.compressionSupported = false
      return false
    }
  }
  
  public static async compress(data: Uint8Array): Promise<Uint8Array> {
    if (!('CompressionStream' in window)) {
      return data // Return original if compression not supported
    }
    
    try {
      const stream = new CompressionStream('gzip')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()
      
      writer.write(data)
      writer.close()
      
      const chunks: Uint8Array[] = []
      let done = false
      
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          chunks.push(value)
        }
      }
      
      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      
      return result
    } catch (error) {
      console.warn('⚠️ Compression failed:', error)
      return data
    }
  }
  
  public static async decompress(data: Uint8Array): Promise<Uint8Array> {
    if (!('DecompressionStream' in window)) {
      return data // Return original if decompression not supported
    }
    
    try {
      const stream = new DecompressionStream('gzip')
      const writer = stream.writable.getWriter()
      const reader = stream.readable.getReader()
      
      writer.write(data)
      writer.close()
      
      const chunks: Uint8Array[] = []
      let done = false
      
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          chunks.push(value)
        }
      }
      
      // Combine chunks
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const result = new Uint8Array(totalLength)
      let offset = 0
      
      for (const chunk of chunks) {
        result.set(chunk, offset)
        offset += chunk.length
      }
      
      return result
    } catch (error) {
      console.warn('⚠️ Decompression failed:', error)
      return data
    }
  }
  
  public static shouldCompress(data: Uint8Array, threshold: number = 1024): boolean {
    // Don't compress small chunks or already compressed data
    if (data.length < threshold) {
      return false
    }
    
    // Simple entropy check - if data has low entropy, it's likely compressible
    const entropy = this.calculateEntropy(data.slice(0, Math.min(1024, data.length)))
    return entropy < 7.5 // Threshold for compression worthiness
  }
  
  private static calculateEntropy(data: Uint8Array): number {
    const frequency = new Array(256).fill(0)
    
    for (const byte of data) {
      frequency[byte]++
    }
    
    let entropy = 0
    const length = data.length
    
    for (const freq of frequency) {
      if (freq > 0) {
        const probability = freq / length
        entropy -= probability * Math.log2(probability)
      }
    }
    
    return entropy
  }
}
