import { useAuth } from '@clerk/react'
import { useCallback } from 'react'
import type { ApiResponse } from './api'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

/**
 * Like useApi, but for file uploads that need a real progress percentage.
 * fetch() has no upload-progress event, so this uses XMLHttpRequest instead.
 */
export function useUpload() {
  const { getToken } = useAuth()

  return useCallback(
    async <T,>(path: string, formData: FormData, onProgress?: (pct: number) => void): Promise<T> => {
      const token = await getToken()
      return new Promise<T>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE_URL}${path}`)
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
        }

        xhr.onload = () => {
          let body: ApiResponse<T> | null = null
          try {
            body = JSON.parse(xhr.responseText)
          } catch {
            body = null
          }
          if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
            resolve(body.data as T)
          } else {
            reject(new Error(body?.message || `Request failed (${xhr.status})`))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))

        xhr.send(formData)
      })
    },
    [getToken],
  )
}
