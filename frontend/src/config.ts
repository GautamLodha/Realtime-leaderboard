// Single source of truth for all HTTP and Socket.IO connections.
// Vite exposes only environment variables that begin with VITE_.
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000').replace(/\/$/, '')
