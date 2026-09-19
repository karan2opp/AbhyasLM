import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react"
import { useApi } from "./api"
import type { Me, UserRole } from "./types"

interface SessionValue {
  me: Me | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const SessionContext = createContext<SessionValue>({ me: null, loading: true, error: null, reload: async () => {} })

/** Loads the signed-in user's role once, for the whole app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"))
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  return <SessionContext value={{ me, loading, error, reload }}>{children}</SessionContext>
}

export function useSession() {
  return use(SessionContext)
}

/** The signed-in user's role; null while loading or before one is chosen. */
export function useRole(): UserRole | null {
  return useSession().me?.role ?? null
}
