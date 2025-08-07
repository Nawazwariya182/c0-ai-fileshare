"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  X,
  Eye,
  Send,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Files,
  Maximize2,
  Minimize2,
} from "lucide-react"
import { FilePreviewGenerator, type PreviewResult } from "@/lib/file-preview"

interface FileWithPreview {
  file: File
  preview: PreviewResult | null
  loading: boolean
  id: string
}

interface FilePreviewModalProps {
  files: File[]
  isOpen: boolean
  onClose: () => void
  onSendFiles: (files: File[]) => void
  onCancel: () => () => void
  onAddMoreFiles: () => void
}

export function FilePreviewModal({
  files,
  isOpen,
  onClose,
  onSendFiles,
  onCancel,
  onAddMoreFiles,
}: FilePreviewModalProps) {
  const [filesWithPreviews, setFilesWithPreviews] = useState<FileWithPreview[]>([])
  const [currentFileIndex, setCurrentFileIndex] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [showSidebar, setShowSidebar] = useState(false) // Default to hidden on mobile
  const [isMobile, setIsMobile] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fileSizeWarnings, setFileSizeWarnings] = useState<string[]>([])

  const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB in bytes

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setShowSidebar(!mobile) // Hide sidebar on mobile by default
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Initialize files with previews when modal opens
  useEffect(() => {
    if (files.length > 0 && isOpen) {
      // Filter out oversized files and show warnings
      const oversizedFiles = files.filter((file) => file.size > MAX_FILE_SIZE)
      const validFiles = files.filter((file) => file.size <= MAX_FILE_SIZE)

      if (oversizedFiles.length > 0) {
        const warnings = oversizedFiles.map((file) =>
          `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds 100MB limit`,
        )
        setFileSizeWarnings(warnings)
      } else {
        setFileSizeWarnings([])
      }

      const newFilesWithPreviews = validFiles.map((file) => ({
        file,
        preview: null,
        loading: true,
        id: Math.random().toString(36).substring(2, 15),
      }))

      setFilesWithPreviews(newFilesWithPreviews)
      setCurrentFileIndex(0)

      // Select all valid files by default
      const allIds = new Set(newFilesWithPreviews.map((f) => f.id))
      setSelectedFiles(allIds)

      // Generate previews for all valid files
      newFilesWithPreviews.forEach((fileWithPreview, index) => {
        generatePreview(fileWithPreview.file, index)
      })
    }
  }, [files, isOpen])

  const generatePreview = async (file: File, index: number) => {
    try {
      const result = await FilePreviewGenerator.generatePreview(file)
      setFilesWithPreviews((prev) =>
        prev.map((item, i) => (i === index ? { ...item, preview: result, loading: false } : item)),
      )
    } catch (error) {
      console.error("Preview generation failed:", error)
      setFilesWithPreviews((prev) =>
        prev.map((item, i) =>
          i === index
            ? {
                ...item,
                preview: {
                  canPreview: false,
                  previewType: "none",
                  error: "Failed to generate preview",
                },
                loading: false,
              }
            : item,
        ),
      )
    }
  }

  const handleSendSelected = () => {
    const selectedFileObjects = filesWithPreviews.filter((item) => selectedFiles.has(item.id)).map((item) => item.file)

    if (selectedFileObjects.length > 0) {
      onSendFiles(selectedFileObjects)
      onClose()
    }
  }

  const handleCancel = () => {
    onCancel()
    onClose()
  }

  const handleRemoveFile = (fileId: string) => {
    setFilesWithPreviews((prev) => prev.filter((item) => item.id !== fileId))
    setSelectedFiles((prev) => {
      const newSet = new Set(prev)
      newSet.delete(fileId)
      return newSet
    })

    // Adjust current index if needed
    if (currentFileIndex >= filesWithPreviews.length - 1) {
      setCurrentFileIndex(Math.max(0, filesWithPreviews.length - 2))
    }
  }

  const handleToggleSelection = (fileId: string) => {
    setSelectedFiles((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(fileId)) {
        newSet.delete(fileId)
      } else {
        newSet.add(fileId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const allIds = new Set(filesWithPreviews.map((f) => f.id))
    setSelectedFiles(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedFiles(new Set())
  }

  const navigateToFile = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setCurrentFileIndex((prev) => Math.max(0, prev - 1))
    } else {
      setCurrentFileIndex((prev) => Math.min(filesWithPreviews.length - 1, prev + 1))
    }
  }

  const currentFile = filesWithPreviews[currentFileIndex]
  const totalSize = filesWithPreviews.reduce((sum, item) => sum + item.file.size, 0)
  const selectedSize = filesWithPreviews
    .filter((item) => selectedFiles.has(item.id))
    .reduce((sum, item) => sum + item.file.size, 0)

  if (!isOpen || filesWithPreviews.length === 0) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-0 md:p-4">
      <Card
        className={`neubrutalism-card bg-white flex flex-col overflow-hidden ${
          isMobile || isFullscreen ? "w-full h-full rounded-none border-0" : "w-full max-w-[95vw] h-[95vh] rounded-lg"
        }`}
      >
        {/* Header - Compact on mobile */}
        <CardHeader
          className={`flex-shrink-0 border-b-4 border-black bg-gradient-to-r from-blue-1024 to-purple-1024 ${
            isMobile ? "p-2" : "p-3 md:p-4"
          }`}
        >
          <div className="flex items-center justify-between">
            <CardTitle
              className={`font-black flex items-center gap-2 ${isMobile ? "text-base" : "text-lg md:text-2xl"}`}
            >
              <Eye className={`${isMobile ? "w-4 h-4" : "w-5 md:w-6 h-5 md:h-6"}`} />
              <span className={isMobile ? "text-sm" : "hidden sm:inline"}>{isMobile ? "PREVIEW" : "FILE PREVIEW"}</span>
              <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-black">
                {filesWithPreviews.length}
              </div>
            </CardTitle>
            <div className="flex items-center gap-1">
              {!isMobile && (
                <Button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  variant="outline"
                  size="sm"
                  className="neubrutalism-button bg-purple-300"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              )}
              {filesWithPreviews.length > 1 && (
                <Button
                  onClick={() => setShowSidebar(!showSidebar)}
                  variant="outline"
                  size="sm"
                  className="neubrutalism-button bg-yellow-300"
                >
                  <Files className="w-4 h-4" />
                  {isMobile ? "" : showSidebar ? " HIDE" : " LIST"}
                </Button>
              )}
              <Button onClick={onClose} variant="ghost" size="sm" className="neubrutalism-button bg-red-400 text-white">
                <X className={`${isMobile ? "w-4 h-4" : "w-4 md:w-5 h-4 md:h-5"}`} />
              </Button>
            </div>
          </div>

          {/* File Size Warnings */}
          {fileSizeWarnings.length > 0 && (
            <div className="mt-3 p-2 bg-red-100 border-2 border-red-400 rounded">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-red-800 text-sm">Files excluded (over 100MB limit):</p>
                  <ul className="text-xs text-red-700 mt-1 space-y-1">
                    {fileSizeWarnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardHeader>

        {/* Main Content Area - Scrollable */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile: Stack everything vertically with scroll */}
          {isMobile ? (
            <div className="flex-1 overflow-y-auto">
              {/* Combined Navigation + File Info - Mobile */}
              {currentFile && (
                <div className="bg-gradient-to-r from-yellow-200 to-orange-200 p-3 border-b-2 border-black sticky top-0 z-10">
                  {/* Navigation Row */}
                  {filesWithPreviews.length > 1 && (
                    <div className="flex items-center justify-between mb-2">
                      <Button
                        onClick={() => navigateToFile("prev")}
                        disabled={currentFileIndex === 0}
                        variant="outline"
                        size="sm"
                        className="neubrutalism-button bg-white disabled:opacity-50 text-xs px-2 py-1"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        PREV
                      </Button>

                      <div className="bg-white px-2 py-1 border-2 border-black rounded text-xs">
                        <span className="font-black">
                          {currentFileIndex + 1} / {filesWithPreviews.length}
                        </span>
                      </div>

                      <Button
                        onClick={() => navigateToFile("next")}
                        disabled={currentFileIndex === filesWithPreviews.length - 1}
                        variant="outline"
                        size="sm"
                        className="neubrutalism-button bg-white disabled:opacity-50 text-xs px-2 py-1"
                      >
                        NEXT
                        <ChevronRight className="w-3 h-3" />
                      </Button>
                    </div>
                  )}

                  {/* File Info Row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-sm mb-1 truncate">{currentFile.file.name}</h3>
                      <div className="flex flex-wrap gap-1 text-xs">
                        <span className="bg-white px-1 py-0.5 border border-black rounded">
                          {(currentFile.file.size / 1024 / 1024).toFixed(1)}MB
                        </span>
                        <span className="bg-white px-1 py-0.5 border border-black rounded">
                          {currentFile.file.type?.split("/")[1] || "Unknown"}
                        </span>
                        <span
                          className={`px-1 py-0.5 border border-black rounded text-xs ${
                            currentFile.preview?.canPreview ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800"
                          }`}
                        >
                          {currentFile.preview?.canPreview ? "✓" : "✗"}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <label className="flex items-center gap-1 cursor-pointer bg-white px-2 py-1 border-2 border-black rounded">
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(currentFile.id)}
                          onChange={() => handleToggleSelection(currentFile.id)}
                          className="w-3 h-3 accent-green-500"
                        />
                        <span className="font-bold text-xs">Send</span>
                      </label>
                      <Button
                        onClick={() => handleRemoveFile(currentFile.id)}
                        variant="ghost"
                        size="sm"
                        className="neubrutalism-button bg-red-400 text-white text-xs px-1 py-1"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Content - Mobile (Scrollable) */}
              <div className="min-h-[400px] bg-white">
                {currentFile?.loading && (
                  <div className="flex items-center justify-center h-64 p-4">
                    <div className="text-center">
                      <div className="animate-spin w-12 h-12 border-4 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
                      <span className="font-bold text-base">Loading preview...</span>
                    </div>
                  </div>
                )}

                {currentFile && !currentFile.loading && currentFile.preview?.error && (
                  <div className="flex items-center justify-center min-h-[300px] text-center p-4">
                    <div>
                      <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-600" />
                      <p className="font-bold text-red-600 text-base mb-2">{currentFile.preview.error}</p>
                      <p className="text-gray-600">Cannot preview this file</p>
                    </div>
                  </div>
                )}

                {currentFile && !currentFile.loading && currentFile.preview && !currentFile.preview.error && (
                  <div className="p-2">
                    {currentFile.preview.previewType === "image" && currentFile.preview.previewData && (
                      <div className="text-center">
                        <img
                          src={currentFile.preview.previewData || "/placeholder.svg"}
                          alt={currentFile.file.name}
                          className="w-full h-auto max-w-full border-2 border-gray-300 rounded"
                          style={{ maxHeight: "70vh" }}
                        />
                      </div>
                    )}

                    {currentFile.preview.previewType === "text" && currentFile.preview.previewData && (
                      <div className="bg-gray-50 border-2 border-gray-200 rounded p-3">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words overflow-x-auto">
                          {currentFile.preview.previewData}
                        </pre>
                      </div>
                    )}

                    {currentFile.preview.previewType === "pdf" && currentFile.preview.previewData && (
                      <iframe
                        src={currentFile.preview.previewData}
                        className="w-full border-2 border-gray-300 rounded"
                        style={{ height: "60vh" }}
                        title={currentFile.file.name}
                      />
                    )}

                    {currentFile.preview.previewType === "video" && currentFile.preview.previewData && (
                      <div className="text-center">
                        <video
                          src={currentFile.preview.previewData}
                          controls
                          className="w-full h-auto max-w-full border-2 border-gray-300 rounded"
                          style={{ maxHeight: "60vh" }}
                        >
                          Your browser does not support video playback.
                        </video>
                      </div>
                    )}

                    {currentFile.preview.previewType === "audio" && currentFile.preview.previewData && (
                      <div className="text-center p-4">
                        <div className="bg-gradient-to-br from-purple-1024 to-blue-1024 p-6 border-4 border-black rounded-lg">
                          <div className="text-6xl mb-4">🎵</div>
                          <h3 className="font-bold text-base mb-4 break-words">{currentFile.file.name}</h3>
                          <audio src={currentFile.preview.previewData} controls className="w-full">
                            Your browser does not support audio playback.
                          </audio>
                        </div>
                      </div>
                    )}

                    {currentFile.preview.previewType === "none" && (
                      <div className="text-center p-6">
                        <Files className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <p className="font-bold text-gray-600 text-base mb-2">Preview not available</p>
                        <p className="text-gray-500 text-sm mb-4">This file type cannot be previewed</p>
                        <div className="bg-gray-1024 p-3 border-2 border-gray-300 rounded">
                          <p className="font-bold text-gray-700 text-sm">File Details:</p>
                          <p className="text-xs text-gray-600 mt-1">
                            Size: {(currentFile.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <p className="text-xs text-gray-600">Type: {currentFile.file.type || "Unknown"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* File List - Mobile (Collapsible) */}
              {showSidebar && filesWithPreviews.length > 1 && (
                <div className="border-t-4 border-black bg-gray-50">
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-black text-sm">ALL FILES ({filesWithPreviews.length})</h4>
                      <div className="flex gap-1">
                        <Button
                          onClick={handleSelectAll}
                          variant="ghost"
                          size="sm"
                          className="text-xs bg-white border border-black px-2 py-1"
                        >
                          ALL
                        </Button>
                        <Button
                          onClick={handleDeselectAll}
                          variant="ghost"
                          size="sm"
                          className="text-xs bg-white border border-black px-2 py-1"
                        >
                          NONE
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {filesWithPreviews.map((item, index) => (
                        <div
                          key={item.id}
                          className={`flex items-center gap-2 p-2 border-2 border-black rounded cursor-pointer ${
                            index === currentFileIndex
                              ? "bg-blue-200 border-blue-600"
                              : selectedFiles.has(item.id)
                                ? "bg-green-1024"
                                : "bg-white"
                          }`}
                          onClick={() => setCurrentFileIndex(index)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(item.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              handleToggleSelection(item.id)
                            }}
                            className="w-4 h-4 accent-green-500 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-xs truncate">{item.file.name}</p>
                            <p className="text-xs text-gray-600">{(item.file.size / 1024 / 1024).toFixed(1)}MB</p>
                          </div>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveFile(item.id)
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-red-600 p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Desktop Layout */
            <CardContent className="flex-1 flex flex-row gap-4 p-2 md:p-4 overflow-hidden">
              {/* Main Preview Area - Desktop */}
              <div className={`flex-1 flex flex-col min-h-0 ${showSidebar ? "w-2/3" : "w-full"}`}>
                {/* Combined Navigation + File Info - Desktop */}
                {currentFile && (
                  <div className="bg-gradient-to-r from-yellow-200 via-orange-200 to-pink-200 p-4 border-4 border-black mb-4 rounded-lg shadow-lg">
                    {/* Navigation Row */}
                    {filesWithPreviews.length > 1 && (
                      <div className="flex items-center justify-between mb-3">
                        <Button
                          onClick={() => navigateToFile("prev")}
                          disabled={currentFileIndex === 0}
                          variant="outline"
                          size="sm"
                          className="neubrutalism-button bg-white disabled:opacity-50 hover:bg-gray-50"
                        >
                          <ChevronLeft className="w-4 h-4 mr-2" />
                          PREVIOUS
                        </Button>

                        <div className="text-center">
                          <div className="bg-white px-4 py-2 border-3 border-black rounded-xl shadow-md">
                            <span className="font-black text-xl text-blue-600">
                              {currentFileIndex + 1} / {filesWithPreviews.length}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-gray-700 mt-1">Navigate files</p>
                        </div>

                        <Button
                          onClick={() => navigateToFile("next")}
                          disabled={currentFileIndex === filesWithPreviews.length - 1}
                          variant="outline"
                          size="sm"
                          className="neubrutalism-button bg-white disabled:opacity-50 hover:bg-gray-50"
                        >
                          NEXT
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    )}

                    {/* File Info Row */}
                    <div className="flex items-center justify-between gap-4 bg-white p-3 border-2 border-black rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-black text-lg text-gray-800 truncate">{currentFile.file.name}</h3>
                          <span
                            className={`px-3 py-1 border-2 border-black rounded-full text-sm font-bold ${
                              currentFile.preview?.canPreview
                                ? "bg-green-200 text-green-800"
                                : "bg-red-200 text-red-800"
                            }`}
                          >
                            {currentFile.preview?.canPreview ? "✓ Previewable" : "✗ No Preview"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="bg-blue-1024 text-blue-800 px-3 py-1 border border-blue-300 rounded-full text-sm font-bold">
                            📁 {(currentFile.file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                          <span className="bg-purple-1024 text-purple-800 px-3 py-1 border border-purple-300 rounded-full text-sm font-bold">
                            🏷️ {currentFile.file.type?.split("/")[1]?.toUpperCase() || "UNKNOWN"}
                          </span>
                          <span className="bg-gray-1024 text-gray-800 px-3 py-1 border border-gray-300 rounded-full text-sm font-bold">
                            📅 {new Date().toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <label className="flex items-center gap-2 cursor-pointer bg-green-1024 hover:bg-green-200 p-3 border-2 border-green-400 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(currentFile.id)}
                            onChange={() => handleToggleSelection(currentFile.id)}
                            className="w-5 h-5 accent-green-500"
                          />
                          <span className="font-bold text-green-800">Include in Transfer</span>
                        </label>
                        <Button
                          onClick={() => handleRemoveFile(currentFile.id)}
                          variant="ghost"
                          size="sm"
                          className="neubrutalism-button bg-red-400 hover:bg-red-500 text-white p-3"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preview Content - Desktop */}
                <div className="flex-1 border-4 border-black bg-white overflow-hidden rounded-lg min-h-0 shadow-lg">
                  <div className="h-full overflow-y-auto overflow-x-auto">
                    {currentFile?.loading && (
                      <div className="flex items-center justify-center h-full min-h-[400px]">
                        <div className="text-center">
                          <div className="animate-spin w-16 h-16 border-4 border-black border-t-transparent rounded-full mx-auto mb-4"></div>
                          <span className="font-bold text-xl">Generating preview...</span>
                        </div>
                      </div>
                    )}

                    {currentFile && !currentFile.loading && currentFile.preview?.error && (
                      <div className="flex items-center justify-center h-full min-h-[400px] text-center p-6">
                        <div>
                          <AlertTriangle className="w-20 h-20 mx-auto mb-4 text-red-600" />
                          <p className="font-bold text-red-600 text-xl mb-2">{currentFile.preview.error}</p>
                          <p className="text-gray-600 text-lg">This file cannot be previewed</p>
                          <p className="text-gray-500 mt-2">File will be sent as-is without preview</p>
                        </div>
                      </div>
                    )}

                    {currentFile && !currentFile.loading && currentFile.preview && !currentFile.preview.error && (
                      <div className="p-4">
                        {currentFile.preview.previewType === "image" && currentFile.preview.previewData && (
                          <div className="text-center">
                            <img
                              src={currentFile.preview.previewData || "/placeholder.svg"}
                              alt={currentFile.file.name}
                              className="max-w-full h-auto object-contain rounded-lg shadow-lg border-2 border-gray-300 mx-auto"
                              style={{ maxWidth: "1024%" }}
                            />
                          </div>
                        )}

                        {currentFile.preview.previewType === "text" && currentFile.preview.previewData && (
                          <div className="bg-gray-50 border-2 border-gray-200 rounded p-4">
                            <pre className="text-sm md:text-base font-mono whitespace-pre-wrap break-words overflow-x-auto">
                              {currentFile.preview.previewData}
                            </pre>
                          </div>
                        )}

                        {currentFile.preview.previewType === "pdf" && currentFile.preview.previewData && (
                          <div className="w-full" style={{ height: "800px" }}>
                            <iframe
                              src={currentFile.preview.previewData}
                              className="w-full h-full border-2 border-gray-300 rounded"
                              title={currentFile.file.name}
                            />
                          </div>
                        )}

                        {currentFile.preview.previewType === "video" && currentFile.preview.previewData && (
                          <div className="text-center">
                            <video
                              src={currentFile.preview.previewData}
                              controls
                              className="max-w-full h-auto rounded-lg shadow-lg border-2 border-gray-300"
                              style={{ maxWidth: "1024%" }}
                            >
                              Your browser does not support video playback.
                            </video>
                          </div>
                        )}

                        {currentFile.preview.previewType === "audio" && currentFile.preview.previewData && (
                          <div className="text-center">
                            <div className="bg-gradient-to-br from-purple-1024 to-blue-1024 p-12 border-4 border-black rounded-lg shadow-lg max-w-md mx-auto">
                              <div className="text-8xl mb-6">🎵</div>
                              <h3 className="font-bold text-xl mb-6 break-words">{currentFile.file.name}</h3>
                              <audio src={currentFile.preview.previewData} controls className="w-full">
                                Your browser does not support audio playback.
                              </audio>
                            </div>
                          </div>
                        )}

                        {currentFile.preview.previewType === "none" && (
                          <div className="text-center p-6">
                            <Files className="w-20 h-20 mx-auto mb-6 text-gray-400" />
                            <p className="font-bold text-gray-600 text-xl mb-2">Preview not available</p>
                            <p className="text-gray-500 text-lg mb-2">This file type cannot be previewed</p>
                            <p className="text-sm text-gray-400">File will be sent as-is</p>
                            <div className="mt-4 bg-gray-1024 p-4 border-2 border-gray-300 rounded-lg max-w-md mx-auto">
                              <p className="font-bold text-gray-700">File Details:</p>
                              <p className="text-sm text-gray-600 mt-1">
                                Size: {(currentFile.file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                              <p className="text-sm text-gray-600">Type: {currentFile.file.type || "Unknown"}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar - File List (Desktop) */}
              {showSidebar && filesWithPreviews.length > 1 && (
                <div className="w-1/3 flex flex-col">
                  {/* File List Header */}
                  <div className="bg-gradient-to-r from-purple-200 to-pink-200 p-3 border-2 border-black rounded-lg mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-black text-base flex items-center gap-2">
                        <Files className="w-4 h-4" />
                        ALL FILES
                      </h4>
                      <div className="flex gap-1">
                        <Button
                          onClick={handleSelectAll}
                          variant="ghost"
                          size="sm"
                          className="text-xs bg-white border border-black px-2 py-1"
                        >
                          ALL
                        </Button>
                        <Button
                          onClick={handleDeselectAll}
                          variant="ghost"
                          size="sm"
                          className="text-xs bg-white border border-black px-2 py-1"
                        >
                          NONE
                        </Button>
                      </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 border border-black rounded text-center">
                        <div className="font-black">{filesWithPreviews.length}</div>
                        <div>Total</div>
                      </div>
                      <div className="bg-white p-2 border border-black rounded text-center">
                        <div className="font-black">{selectedFiles.size}</div>
                        <div>Selected</div>
                      </div>
                      <div className="bg-white p-2 border border-black rounded text-center">
                        <div className="font-black">{(totalSize / 1024 / 1024).toFixed(1)}MB</div>
                        <div>Total Size</div>
                      </div>
                      <div className="bg-white p-2 border border-black rounded text-center">
                        <div className="font-black">{(selectedSize / 1024 / 1024).toFixed(1)}MB</div>
                        <div>Selected</div>
                      </div>
                    </div>
                  </div>

                  {/* File List */}
                  <div className="flex-1 bg-gray-50 border-2 border-black rounded-lg overflow-hidden">
                    <div className="h-full overflow-y-auto p-2">
                      <div className="space-y-2">
                        {filesWithPreviews.map((item, index) => (
                          <div
                            key={item.id}
                            className={`flex items-center gap-2 p-2 border-2 border-black rounded cursor-pointer transition-all ${
                              index === currentFileIndex
                                ? "bg-blue-200 border-blue-600 shadow-md"
                                : selectedFiles.has(item.id)
                                  ? "bg-green-1024 hover:bg-green-200"
                                  : "bg-white hover:bg-gray-1024"
                            }`}
                            onClick={() => setCurrentFileIndex(index)}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(item.id)}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleToggleSelection(item.id)
                              }}
                              className="w-4 h-4 accent-green-500 flex-shrink-0"
                            />

                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs truncate" title={item.file.name}>
                                {item.file.name}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                                <span>{(item.file.size / 1024 / 1024).toFixed(1)}MB</span>
                                {item.loading && <span className="text-blue-600">Loading...</span>}
                                {!item.loading && item.preview?.canPreview && (
                                  <span className="text-green-600 font-bold">✓</span>
                                )}
                                {!item.loading && !item.preview?.canPreview && <span className="text-gray-500">✗</span>}
                              </div>
                            </div>

                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRemoveFile(item.id)
                              }}
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:bg-red-1024 p-1 flex-shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </div>

        {/* Footer Actions - Sticky */}
        <div
          className={`flex-shrink-0 border-t-4 border-black bg-gradient-to-r from-gray-1024 to-gray-200 ${
            isMobile ? "p-2" : "p-3 md:p-4"
          }`}
        >
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-center">
            <div className="flex gap-2 order-2 sm:order-1">
              <Button
                onClick={handleCancel}
                variant="outline"
                className={`neubrutalism-button bg-white ${isMobile ? "text-xs px-3 py-2" : ""}`}
              >
                <X className="w-4 h-4 mr-1" />
                CANCEL
              </Button>
              <Button
                onClick={onAddMoreFiles}
                variant="outline"
                className={`neubrutalism-button bg-yellow-300 ${isMobile ? "text-xs px-3 py-2" : ""}`}
              >
                <Plus className="w-4 h-4 mr-1" />
                ADD MORE
              </Button>
            </div>

            <Button
              onClick={handleSendSelected}
              disabled={selectedFiles.size === 0}
              className={`neubrutalism-button bg-green-500 text-white order-1 sm:order-2 w-full sm:w-auto ${
                isMobile ? "text-sm px-4 py-3" : "text-lg px-6 py-3"
              }`}
            >
              <Send className="w-4 h-4 mr-2" />
              SEND {selectedFiles.size > 0 ? `${selectedFiles.size} FILE${selectedFiles.size > 1 ? "S" : ""}` : "FILES"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
