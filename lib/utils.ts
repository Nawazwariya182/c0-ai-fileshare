import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateSessionCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export function validateSessionCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code)
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"

  const k = 100
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

export function validateFileType(fileName: string): boolean {
  const blockedExtensions = [".exe", ".bat", ".sh", ".cmd", ".scr", ".pif", ".com", ".msi", ".app"]
  const fileExtension = "." + fileName.split(".").pop()?.toLowerCase()

  return !blockedExtensions.includes(fileExtension)
}

export function calculateSHA256(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer
        const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
        resolve(hashHex)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsArrayBuffer(file)
  })
}
