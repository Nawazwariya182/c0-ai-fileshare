// Enhanced WebRTC configuration for maximum performance
export class EnhancedWebRTC {
  static getOptimizedConfiguration(): RTCConfiguration {
    const baseIceServers = [
      // Google STUN servers
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      
      // Cloudflare STUN servers
      { urls: "stun:stun.cloudflare.com:3478" },
      
      // Other reliable STUN servers
      { urls: "stun:stun.nextcloud.com:443" },
      { urls: "stun:stun.sipgate.net:3478" },
      { urls: "stun:stun.ekiga.net" },
      { urls: "stun:stun.ideasip.com" },
      { urls: "stun:stun.schlund.de" },
      { urls: "stun:stun.voiparound.com" },
      { urls: "stun:stun.voipbuster.com" },
      { urls: "stun:stun.voipstunt.com" },
      { urls: "stun:stun.voxgratia.org" },
    ];

    return {
      iceServers: [
        ...baseIceServers,
        // Add TURN servers if available
        ...(process.env.NEXT_PUBLIC_TURN_SERVER ? [{
          urls: process.env.NEXT_PUBLIC_TURN_SERVER,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_PASSWORD
        }] : [])
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceTransportPolicy: "all"
    }
  }

  static getOptimizedDataChannelConfig(): RTCDataChannelInit {
    return {
      ordered: true,
      maxRetransmits: 3, // Only use maxRetransmits, not maxPacketLifeTime
      // Remove maxPacketLifeTime to avoid conflict
    }
  }

  static setupOptimizedDataChannel(channel: RTCDataChannel): void {
    channel.binaryType = "arraybuffer"
    
    // Set optimal buffer thresholds based on connection
    const optimizer = ConnectionOptimizer.getInstance()
    channel.bufferedAmountLowThreshold = optimizer.getOptimalBufferThreshold()
    
    // Enable efficient buffer management
    channel.onbufferedamountlow = () => {
      console.log("📡 Data channel buffer low - ready for more data")
    }
  }
}

// Import this in your main component
import { ConnectionOptimizer } from './connection-optimizer'
