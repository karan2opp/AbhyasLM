import { ClerkProvider } from "@clerk/react"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "@/components/ui/sonner"
import "./index.css"
import App from "./App.tsx"

// A lazy-loaded page can fail to fetch if the dev server restarted (or a new
// build was deployed) since this tab loaded — Vite's module graph moved on,
// so the old chunk URL 404s. Reloading fetches the current build instead of
// leaving the ErrorBoundary's fallback up. This never fires in a normal
// production visit — only after the app itself has been updated underneath
// an open tab.
window.addEventListener("vite:preloadError", () => {
  window.location.reload()
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorPrimary: "#ea580c",
          colorPrimaryForeground: "#ffffff",
          colorBackground: "#09090b",
          colorForeground: "#fafafa",
          colorMutedForeground: "#a1a1aa",
          colorInput: "#14151f",
          colorInputForeground: "#fafafa",
          colorBorder: "#27272a",
          colorNeutral: "#fafafa",
        },
      }}
    >
      <App />
      <Toaster position="top-center" />
    </ClerkProvider>
  </StrictMode>,
)
