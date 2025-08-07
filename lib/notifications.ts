export class NotificationManager {
  private static hasPermission = false
  
  static async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Notifications not supported')
      return false
    }
    
    if (Notification.permission === 'granted') {
      this.hasPermission = true
      return true
    }
    
    if (Notification.permission === 'denied') {
      return false
    }
    
    const permission = await Notification.requestPermission()
    this.hasPermission = permission === 'granted'
    return this.hasPermission
  }
  
  static showChatNotification(message: string, sender: string) {
    if (!this.hasPermission) return
    
    try {
      new Notification(`New message from ${sender}`, {
        body: message.substring(0, 100),
        icon: '/favicon.ico',
        tag: 'chat-message',
        requireInteraction: false
      })
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }
  
  static showFileNotification(fileName: string, type: 'sent' | 'received') {
    if (!this.hasPermission) return
    
    try {
      new Notification(`File ${type}`, {
        body: `${fileName} has been ${type} successfully`,
        icon: '/favicon.ico',
        tag: 'file-transfer',
        requireInteraction: false
      })
    } catch (error) {
      console.error('Failed to show notification:', error)
    }
  }
}
