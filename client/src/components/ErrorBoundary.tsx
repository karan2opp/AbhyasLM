import { Component, type ErrorInfo, type ReactNode } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, an uncaught render error (a failed lazy-page import after a
 * dev-server restart, a bad API response, anything) unmounts the whole React
 * tree and leaves a blank page with no way back — see the harness's own React
 * docs link for why. This turns that into a message and a reload button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    // A stale dynamic import after the dev server restarts or redeploys —
    // reloading fetches the current build and clears it.
    const isStaleChunk = /dynamically imported module|Failed to fetch/i.test(this.state.error.message)

    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="h-12 w-12 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <h1 className="text-lg font-bold text-white">Something went wrong</h1>
          <p className="text-sm text-gray-400">
            {isStaleChunk ? "This page was updated since you loaded it. Reloading will fetch the current version." : this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white h-10 px-5 font-semibold rounded-xl"
          >
            <RotateCw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    )
  }
}
