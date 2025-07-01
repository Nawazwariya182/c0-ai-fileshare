# P2P File Sharing Application

A secure, real-time peer-to-peer file sharing web application built with Next.js 14, WebRTC, and WebSocket signaling. Features Neubrutalism UI design and Clerk authentication.

## 🚨 Quick Fix for WebSocket Issues

If you see "WebSocket connection failed" or "DISCONNECTED", follow these steps:

### 1. Check if Signaling Server is Running
\`\`\`bash
npm run check-server
\`\`\`

### 2. Start the Signaling Server
\`\`\`bash
# In one terminal
npm run dev:signaling

# In another terminal  
npm run dev:next
\`\`\`

### 3. Or Start Both Together
\`\`\`bash
npm run dev
\`\`\`

### 4. Verify Connection
- Open browser console (F12)
- Look for "✅ WebSocket connected" message
- If you see connection errors, the server isn't running

---

## 🚀 Features

- **Peer-to-Peer File Transfer**: Direct browser-to-browser file sharing using WebRTC
- **Session-Based Sharing**: Create or join sessions with 6-digit codes
- **QR Code Support**: Generate and scan QR codes for easy session joining
- **Real-time Progress**: Live file transfer progress with chunked streaming
- **Security First**: File type validation, size limits, and input sanitization
- **Authentication**: Secure user authentication with Clerk
- **Neubrutalism UI**: Bold, modern design with thick borders and shadows
- **Mobile Responsive**: Works seamlessly on all devices

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Authentication**: Clerk
- **Real-time**: WebRTC for P2P, WebSocket for signaling
- **UI Components**: shadcn/ui with custom Neubrutalism styling
- **QR Codes**: qrcode.react

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Clerk account for authentication

## 🔧 Setup Instructions

### 1. Clone and Install

\`\`\`bash
git clone <repository-url>
cd p2p-file-sharing
npm install
\`\`\`

### 2. Environment Setup

Create `.env.local` file:

\`\`\`env
# Clerk Authentication (Get from https://clerk.com)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here

# Clerk URLs
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/create
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard/create

# WebSocket Server
NEXT_PUBLIC_WS_URL=ws://localhost:8080
\`\`\`

### 3. Clerk Setup

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new application
3. Copy your publishable and secret keys
4. Configure sign-in/sign-up settings
5. Add your domain to allowed origins

### 4. Development

**IMPORTANT**: You need to run BOTH servers:

\`\`\`bash
# Option 1: Run both together (recommended)
npm run dev

# Option 2: Run separately
# Terminal 1 - Signaling Server
npm run dev:signaling

# Terminal 2 - Next.js App  
npm run dev:next
\`\`\`

This runs:
- Next.js app on `http://localhost:3000`
- WebSocket signaling server on `ws://localhost:8080`

### 5. Verify Setup

\`\`\`bash
# Check if signaling server is running
npm run check-server
\`\`\`

You should see: "✅ Signaling server is running on ws://localhost:8080"

## 🐛 Troubleshooting

### WebSocket Connection Issues

**Problem**: "WebSocket connection failed" or "DISCONNECTED"

**Solutions**:
1. **Check if signaling server is running**:
   \`\`\`bash
   npm run check-server
   \`\`\`

2. **Start the signaling server**:
   \`\`\`bash
   npm run dev:signaling
   \`\`\`

3. **Check port availability**:
   \`\`\`bash
   # On Windows
   netstat -an | findstr :8080
   
   # On Mac/Linux  
   lsof -i :8080
   \`\`\`

4. **Try different ports**: Edit `signaling-server/index.ts` and change port from 8080 to 8081

5. **Firewall issues**: Ensure port 8080 is not blocked by firewall

### WebRTC Connection Fails

**Problem**: "WAITING FOR PEER" never changes to "CONNECTED"

**Solutions**:
1. **Check browser console** for WebRTC errors
2. **Try different browsers** (Chrome/Firefox work best)
3. **Network issues**: Both users behind strict NAT may need TURN servers
4. **Same network**: Try connecting from different networks

### File Transfer Stuck

**Problem**: File transfer progress stops

**Solutions**:
1. **Check file size** (max 100MB)
2. **Verify file type** is allowed
3. **Stable connection** required for large files
4. **Browser memory**: Refresh page for very large files

### Authentication Issues

**Problem**: Can't sign in or routes not protected

**Solutions**:
1. **Verify Clerk keys** in `.env.local`
2. **Check Clerk dashboard** configuration
3. **Domain whitelist**: Add localhost:3000 to allowed origins
4. **Clear browser cache** and cookies

## 🔍 Debug Mode

The app includes debug information in development mode. Check the browser console for:
- WebSocket connection logs
- WebRTC connection state
- File transfer progress
- Error messages

## 🚀 Production Deployment

### Deploy Next.js App (Vercel)

\`\`\`bash
npm run build
# Deploy to Vercel or your preferred platform
\`\`\`

### Deploy WebSocket Server

For production, deploy the signaling server separately:

\`\`\`bash
# On your server
npm install -g pm2
pm2 start signaling-server/index.ts --name "p2p-signaling"
\`\`\`

Update environment variables for production WebSocket URL.

## 🎯 Usage Guide

### Creating a Session

1. Sign in to your account
2. Click "CREATE SESSION" 
3. Share the 6-digit code or QR code with your friend
4. Click "START SESSION" to enter the sharing room

### Joining a Session

1. Sign in to your account
2. Click "JOIN SESSION"
3. Enter the 6-digit code OR scan the QR code
4. Click "JOIN SESSION" to connect

### Sharing Files

1. Once connected, drag & drop files or click "CHOOSE FILES"
2. Files are validated for security (max 100MB, no executables)
3. Watch real-time progress as files transfer directly
4. Received files download automatically

## 🔒 Security Features

- **File Type Validation**: Blocks executable files (.exe, .bat, .sh, etc.)
- **Size Limits**: Maximum 100MB per file
- **Session Expiration**: Sessions auto-expire after 10 minutes of inactivity
- **Input Sanitization**: All user inputs are validated and sanitized
- **Secure WebSocket**: Uses WSS in production
- **Authentication Required**: Only authenticated users can share files

## 🏗️ Architecture

\`\`\`
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser A     │    │  WebSocket       │    │   Browser B     │
│   (Sender)      │◄──►│  Signaling       │◄──►│   (Receiver)    │
│                 │    │  Server          │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               │
         └───────────────► WebRTC P2P ◄─────────────────┘
                        (Direct File Transfer)
\`\`\`

## 📁 Project Structure

\`\`\`
app/
├── page.tsx                 # Landing page
├── layout.tsx              # Root layout with Clerk
├── globals.css             # Global styles + Neubrutalism
├── dashboard/
│   ├── create/page.tsx     # Create session page
│   └── join/page.tsx       # Join session page
└── session/[id]/page.tsx   # Active session page

signaling-server/
└── index.ts                # WebSocket signaling server

components/ui/              # shadcn/ui components
lib/
└── utils.ts               # Utility functions

scripts/
└── check-server.ts        # Server health check

middleware.ts              # Clerk auth middleware
\`\`\`

## 📊 Performance

- **File Chunking**: 16KB chunks prevent memory issues
- **Progress Tracking**: Real-time progress updates
- **Connection Pooling**: Efficient WebSocket connection management
- **Session Cleanup**: Automatic cleanup of expired sessions

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
- Check the troubleshooting section above
- Run `npm run check-server` to verify setup
- Open browser console (F12) for error messages
- Open an issue on GitHub
- Review Clerk documentation for auth issues
- Check WebRTC compatibility for browser issues

---

**Built with ❤️ using Next.js, WebRTC, and modern web technologies**
