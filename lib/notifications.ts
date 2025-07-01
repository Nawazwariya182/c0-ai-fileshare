// Desktop notifications
export type NotificationType = 'connection' | 'file' | 'chat' | 'warning'

export interface NotificationOptions {
  title: string
  body: string
  type: NotificationType
  icon?: string
  tag?: string
  requireInteraction?: boolean
}

export class NotificationManager {
  private static permission: NotificationPermission = 'default'
  private static _isSupported = typeof window !== 'undefined' && 'Notification' in window

  static async requestPermission(): Promise<boolean> {
    if (!this._isSupported) {
      console.warn('Notifications not supported')
      return false
    }

    if (this.permission === 'granted') {
      return true
    }

    try {
      this.permission = await Notification.requestPermission()
      return this.permission === 'granted'
    } catch (error) {
      console.error('Failed to request notification permission:', error)
      return false
    }
  }

  static async show(options: NotificationOptions): Promise<Notification | null> {
    if (!this._isSupported || this.permission !== 'granted') {
      return null
    }

    try {
      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || this.getDefaultIcon(options.type),
        tag: options.tag,
        requireInteraction: options.requireInteraction || false,
        silent: false
      })

      // Auto-close after 5 seconds unless requireInteraction is true
      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close()
        }, 5000)
      }

      return notification
    } catch (error) {
      console.error('Failed to show notification:', error)
      return null
    }
  }

  static async showConnectionNotification(connected: boolean, peerInfo?: string): Promise<void> {
    await this.show({
      type: 'connection',
      title: connected ? 'Peer Connected' : 'Peer Disconnected',
      body: connected 
        ? `Connected to ${peerInfo || 'peer'}. Ready to share files!`
        : 'Peer has disconnected from the session.',
      tag: 'connection-status'
    })
  }

  static async showFileNotification(fileName: string, completed: boolean, error?: string): Promise<void> {
    await this.show({
      type: 'file',
      title: completed ? 'File Transfer Complete' : 'File Transfer Failed',
      body: completed 
        ? `Successfully transferred: ${fileName}`
        : `Failed to transfer ${fileName}: ${error || 'Unknown error'}`,
      tag: `file-${fileName}`,
      requireInteraction: !completed // Keep error notifications visible
    })
  }

  static async showChatNotification(message: string, sender: string): Promise<void> {
    await this.show({
      type: 'chat',
      title: 'New Message',
      body: `${sender}: ${message.length > 50 ? message.substring(0, 50) + '...' : message}`,
      tag: 'chat-message'
    })
  }

  static async showWarningNotification(title: string, message: string): Promise<void> {
    await this.show({
      type: 'warning',
      title,
      body: message,
      requireInteraction: true,
      tag: 'warning'
    })
  }

  private static getDefaultIcon(type: NotificationType): string {
    const icons = {
      connection: '🔗',
      file: '📁',
      chat: '💬',
      warning: '⚠️'
    }
    
    // Convert emoji to data URL (simple fallback)
    const emoji = icons[type]
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = '24px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(emoji, 16, 16)
    }
    
    return canvas.toDataURL()
  }

  static get hasPermission(): boolean {
    return this.permission === 'granted'
  }

  static get isSupported(): boolean {
    return this._isSupported
  }
}
