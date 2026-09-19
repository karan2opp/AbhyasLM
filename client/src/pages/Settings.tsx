import { useEffect, useState } from "react"
import { Loader2, RotateCcw, Save, Settings as SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { LoadingRow, PageHeader } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import type { PlatformSetting } from "@/lib/types"

const inputClass = "bg-[#14151f] border border-white/15 text-white placeholder:text-zinc-500 h-9 text-sm rounded-lg max-w-sm"

const GROUPS: { title: string; description: string; keys: string[] }[] = [
  {
    title: "Models",
    description: "Which model each pipeline calls. Anything your OpenAI- or Mistral-compatible key can serve works here.",
    keys: ["GENERATION_MODEL", "EVALUATION_MODEL", "GUARDRAIL_MODEL", "EMBEDDING_MODEL", "REALTIME_MODEL", "REALTIME_VOICE"],
  },
  {
    title: "Upload limits",
    description: "The largest PDF each upload will accept, in megabytes.",
    keys: ["QUESTION_BANK_MAX_MB", "BOOK_MAX_MB"],
  },
]

export default function Settings() {
  const api = useApi()
  const settings = useResource<PlatformSetting[]>("/api/admin/settings")
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!settings.data) return
    setDrafts((prev) => {
      const next = { ...prev }
      for (const s of settings.data!) if (!(s.key in next)) next[s.key] = s.value
      return next
    })
  }, [settings.data])

  const byKey = new Map((settings.data ?? []).map((s) => [s.key, s]))

  const save = async (key: string) => {
    const value = drafts[key]?.trim()
    if (!value) {
      toast.error("This can't be empty")
      return
    }
    setSaving((prev) => ({ ...prev, [key]: true }))
    try {
      await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ settings: { [key]: value } }) })
      toast.success(`${byKey.get(key)?.label ?? key} updated`)
      await settings.reload()
    } catch (err) {
      toast.error((err as Error).message || "Could not save that setting")
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }))
    }
  }

  const reset = (key: string) => {
    const def = byKey.get(key)
    if (def) setDrafts((prev) => ({ ...prev, [key]: def.default }))
  }

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <PageHeader title="Platform settings" description="Change these without touching the server's environment or restarting it." />

        {settings.loading ? (
          <LoadingRow label="Loading settings..." />
        ) : settings.error ? (
          <p className="text-sm text-red-400">{settings.error}</p>
        ) : (
          GROUPS.map((group) => (
            <Card key={group.title} className="bg-[#0f0f11] border border-white/10 ring-0">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <SettingsIcon className="size-4 text-orange-400" /> {group.title}
                </CardTitle>
                <CardDescription className="text-gray-400">{group.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {group.keys.map((key) => {
                  const def = byKey.get(key)
                  if (!def) return null
                  const value = drafts[key] ?? def.value
                  const changed = value !== def.value
                  const isDefault = def.value === def.default
                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="block">
                        <span className="text-sm font-semibold text-gray-200">{def.label}</span>
                        <p className="text-xs text-gray-500 mt-0.5 mb-2">{def.description}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input value={value} onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))} className={inputClass} />
                          <Button onClick={() => void save(key)} disabled={!changed || saving[key]} className="bg-orange-600 hover:bg-orange-700 text-white h-9 px-3 text-sm font-semibold">
                            {saving[key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1.5" /> Save</>}
                          </Button>
                          {!isDefault && (
                            <Button variant="ghost" onClick={() => reset(key)} className="text-gray-400 hover:text-white h-9 px-2 text-xs font-semibold">
                              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to default ({def.default})
                            </Button>
                          )}
                        </div>
                      </label>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
