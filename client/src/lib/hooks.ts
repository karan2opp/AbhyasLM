import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from './api'

export interface Resource<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => Promise<void>
  setData: (data: T) => void
}

/**
 * Loads a GET endpoint. When `pollMs(data)` returns a number, reloads after
 * that many milliseconds — used to follow background jobs (PDF processing,
 * book indexing, blueprint and question generation) until they finish.
 */
export function useResource<T>(path: string | null, pollMs?: (data: T) => number | null): Resource<T> {
  const api = useApi()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const pollRef = useRef(pollMs)
  useEffect(() => {
    pollRef.current = pollMs
  })

  const reload = useCallback(async () => {
    if (!path) return
    try {
      setData(await api<T>(path))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [api, path])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (data === null || !pollRef.current) return
    const delay = pollRef.current(data)
    if (delay === null) return
    const timer = setTimeout(() => void reload(), delay)
    return () => clearTimeout(timer)
  }, [data, reload])

  return { data, error, loading, reload, setData }
}

/** Wraps an async action with busy/error state for buttons and forms. */
export function useAction<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setBusy(true)
      setError(null)
      try {
        return await fn(...args)
      } catch (err) {
        setError((err as Error).message)
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [fn],
  )

  return { run, busy, error, setError }
}

/** Splits a comma- or newline-separated field into trimmed, non-empty items. */
export const splitList = (value: string) =>
  value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
