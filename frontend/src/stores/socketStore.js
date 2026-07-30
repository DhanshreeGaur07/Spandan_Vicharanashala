import { create } from 'zustand'
import { io } from 'socket.io-client'
import { SOCKET_URL, API_URL } from '../config.js'

export const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  currentRoom: null,
  participants: 0,
  // The room we should belong to. Kept across reconnects (unlike currentRoom, which is cleared
  // on disconnect) so the 'connect' handler can auto-rejoin after a dropped socket. Cleared only
  // on an explicit leaveRoom()/disconnect().
  joinedRoom: null,

  pulseValue: 0,
  pulseHolding: 0,
  pulseTotal: 0,
  isHolding: false,

  driftPrompt: null,
  driftSummary: null,

  connect: (token) => {
    const { socket: existingSocket } = get()
    // Guard against double-connect: also block if a socket exists but hasn't finished
    // the handshake yet (connected === false while in "connecting" state). Without this,
    // React StrictMode's double-effect invocation creates two simultaneous sockets.
    if (existingSocket) {
      if (existingSocket.connected) {
        console.log('Socket already connected, skipping')
      } else {
        console.log('Socket already exists (connecting), skipping')
      }
      return
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    })

    socket.on('connect', () => {
      console.log('Socket connected')
      set({ isConnected: true })
      socket.emit('authenticate', { token })
      // On a (re)connect, socket.io gives us a NEW underlying connection that is a member of NO
      // rooms — even if we had joined one before the drop. Without this, a student whose socket
      // briefly reconnects silently stops receiving room broadcasts (new_question, leaderboard…)
      // until they manually refresh the page. Re-join the room we were in so delivery self-heals.
      const { joinedRoom } = get()
      if (joinedRoom?.roomCode) {
        socket.emit('room:join', { roomCode: joinedRoom.roomCode, userId: joinedRoom.userId })
      }
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      set({ isConnected: false, currentRoom: null })
    })

    socket.on('authenticated', (data) => {
      if (!data.success) {
        console.error('Socket authentication failed:', data.error)
      }
    })

    socket.on('room:joined', (data) => {
      console.log('Joined room:', data)
      set({ 
        currentRoom: data.roomCode,
        participants: data.participants || 0
      })
    })

    socket.on('room:left', (data) => {
      console.log('Left room:', data)
      set({ 
        currentRoom: null,
        participants: 0
      })
    })

    socket.on('question:started', (data) => {
      console.log('Question started:', data)
    })

    socket.on('question:ended', (data) => {
      console.log('Question ended:', data)
    })

    socket.on('response:new', (data) => {
      console.log('New response:', data)
    })

    socket.on('leaderboard:updated', (data) => {
      console.log('Leaderboard updated:', data)
    })

    socket.on('new_question', (data) => {
      console.log('New question received:', data)
    })

    socket.on('room:pulse', (data) => {
      set({
        pulseValue: data.value,
        pulseHolding: data.holding,
        pulseTotal: data.total,
      })
    })

    socket.on('drift:prompt', (data) => {
      set({ driftPrompt: data })
      const delay = Math.max(0, data.expiresAt - Date.now())
      setTimeout(() => {
        set((s) => s.driftPrompt?.segmentIndex === data.segmentIndex ? { driftPrompt: null } : {})
      }, delay)
    })

    socket.on('drift:updated', (data) => {
      set({ driftSummary: data })
    })

    set({ socket })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
      set({ socket: null, isConnected: false, currentRoom: null, joinedRoom: null })
    }
  },

  joinRoom: (roomCode, userId) => {
    const { socket } = get()
    // Remember the room so the socket auto-rejoins after a reconnect (see the 'connect' handler).
    set({ joinedRoom: { roomCode, userId } })
    if (socket) {
      socket.emit('room:join', { roomCode, userId })
    }
  },

  leaveRoom: (roomCode, userId) => {
    const { socket } = get()
    // Deliberate leave — stop auto-rejoining on future reconnects.
    set({ joinedRoom: null })
    if (socket) {
      socket.emit('room:leave', { roomCode, userId })
      set({ currentRoom: null, participants: 0 })
    }
  },

  submitResponse: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('response:submit', data)
    }
  },

  startQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:start', data)
    }
  },

  endQuestion: (data) => {
    const { socket } = get()
    if (socket) {
      socket.emit('question:end', data)
    }
  },

  emitPulseHold: (holding) => {
    const { socket } = get()
    if (socket) {
      socket.emit('pulse:hold', { holding })
    }
  },
  
  setHolding: (val) => set({ isHolding: val }),

  submitDriftResponse: async (roomId, segmentIndex, selectedOption, dismissed) => {
    try {
      const authData = JSON.parse(localStorage.getItem('auth-storage') || '{}')
      const token = authData?.state?.token
      await fetch(`${API_URL}/drift/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId, segmentIndex, selectedOption, dismissed })
      })
    } catch (e) {
      console.error('Failed to submit drift response:', e)
    }
    set({ driftPrompt: null })
  }
}))

export default useSocketStore