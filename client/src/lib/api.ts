import { useAuth } from '@clerk/react'
import { useCallback } from 'react'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

// Empty in development: paths stay relative ("/api/books") and Vite's dev
// proxy forwards them to the API server (see vite.config.ts). In production
// the frontend and API are on different domains (e.g. Amplify + App Runner),
// so the build needs to be told where the API actually lives — set
// VITE_API_BASE_URL (no trailing slash, e.g. "https://xyz.awsapprunner.com")
// as a build-time environment variable on the hosting platform.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * Calls the Express API with the signed-in user's Clerk session token.
 */
export function useApi() {
  const { getToken } = useAuth()

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getToken()
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

      const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
      const body = (await res.json().catch(() => null)) as ApiResponse<T> | null
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || `Request failed (${res.status})`)
      }
      return body.data as T
    },
    [getToken],
  )
}
