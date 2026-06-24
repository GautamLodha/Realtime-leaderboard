// Single source of truth for the backend host used by HTTP proxying and Socket.IO.
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'
