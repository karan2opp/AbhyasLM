import { useState } from "react"
import { CheckCircle2, KeyRound, Loader2, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useSession } from "@/lib/session"

export default function AccountSettings() {
  const api = useApi()
  const { me, reload } = useSession()
  const [apiKey, setApiKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const save = async () => {
    const value = apiKey.trim()
    if (!value.startsWith("sk-")) {
      toast.error('OpenAI keys start with "sk-"')
      return
    }
    setSaving(true)
    try {
      await api("/api/me/openai-key", { method: "POST", body: JSON.stringify({ apiKey: value }) })
      setApiKey("")
      toast.success("Your OpenAI key is saved — generation and grading will use it from now on")
      await reload()
    } catch (err) {
      toast.error((err as Error).message || "Could not save that key")
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setRemoving(true)
    try {
      await api("/api/me/openai-key", { method: "DELETE" })
      toast.success("Key removed — back to the platform's shared key")
      await reload()
    } catch (err) {
      toast.error((err as Error).message || "Could not remove that key")
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <PageHeader title="Your OpenAI key" description="Bring your own key so generation and AI grading bill your account instead of the platform's." />

        <Card className="bg-[#0f0f11] border border-white/10 ring-0">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <KeyRound className="size-4 text-orange-400" /> OpenAI API key
            </CardTitle>
            <CardDescription className="text-gray-400">
              Stored encrypted, never shown again after saving. Without one, your exams use the platform's shared key.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {me?.hasOwnOpenAiKey && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                <CheckCircle2 className="size-4 shrink-0" /> A key is currently set for your account.
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-9 max-w-sm bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 text-sm rounded-lg"
                autoComplete="off"
              />
              <Button
                onClick={() => void save()}
                disabled={saving || !apiKey.trim()}
                className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-3 text-sm font-semibold"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Save</>}
              </Button>
              {me?.hasOwnOpenAiKey && (
                <Button variant="ghost" disabled={removing} onClick={() => void remove()} className="text-red-400 hover:text-red-300 h-9 px-3 text-sm font-semibold">
                  {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1.5" /> Remove</>}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
