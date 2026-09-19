import { useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingRow, PageHeader, selectClass } from "@/components/workspace"
import { useApi } from "@/lib/api"
import { useResource } from "@/lib/hooks"
import { useSession } from "@/lib/session"
import type { UserRole, UserSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

const ROLE_LABELS: Record<UserRole, string> = { admin: "Admin", examiner: "Examiner", candidate: "Candidate" }
const ROLE_TONES: Record<UserRole, string> = {
  admin: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  examiner: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  candidate: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
}

function UserRow({ user, isSelf, onChanged }: { user: UserSummary; isSelf: boolean; onChanged: () => void }) {
  const api = useApi()
  const [saving, setSaving] = useState(false)

  const setRole = async (role: UserRole) => {
    setSaving(true)
    try {
      await api(`/api/admin/users/${user.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) })
      toast.success(`${user.email ?? "User"} is now ${ROLE_LABELS[role].toLowerCase()}`)
      onChanged()
    } catch (err) {
      toast.error((err as Error).message || "Could not change the role")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#0b0b0d] p-3 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">
          {user.name || user.email || user.id}
          {isSelf && <span className="ml-2 text-[11px] text-gray-500">(you)</span>}
        </p>
        {user.name && user.email && <p className="truncate text-xs text-gray-500">{user.email}</p>}
      </div>
      <div className="flex items-center gap-2">
        {user.role ? (
          <span className={cn("text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border", ROLE_TONES[user.role])}>{ROLE_LABELS[user.role]}</span>
        ) : (
          <span className="text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider border border-white/10 bg-white/5 text-gray-400">No role yet</span>
        )}
        <select
          value={user.role ?? ""}
          disabled={saving || isSelf}
          aria-label={`Role for ${user.email ?? user.id}`}
          onChange={(e) => void setRole(e.target.value as UserRole)}
          className={cn(selectClass, "w-36", isSelf && "opacity-50 cursor-not-allowed")}
        >
          <option value="" disabled>
            Set role…
          </option>
          <option value="admin">Admin</option>
          <option value="examiner">Examiner</option>
          <option value="candidate">Candidate</option>
        </select>
        {saving && <Loader2 className="size-4 animate-spin text-gray-400" />}
      </div>
    </div>
  )
}

export default function Users() {
  const { me } = useSession()
  const users = useResource<UserSummary[]>("/api/admin/users")
  const list = users.data ?? []

  return (
    <div className="p-6 md:p-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <PageHeader title="Users" description="Everyone who has signed in. Change a role to give or remove access." />

        <Card className="bg-[#0f0f11] border border-white/10 ring-0">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <ShieldCheck className="size-4 text-orange-400" /> Roles
            </CardTitle>
            <CardDescription className="text-gray-400">
              Examiners create and publish exams. Candidates take them. Admins do both and manage users. You can&apos;t change your own role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {users.loading ? (
              <LoadingRow label="Loading users..." />
            ) : users.error ? (
              <p className="text-sm text-red-400">{users.error}</p>
            ) : list.length === 0 ? (
              <p className="text-xs italic text-gray-500">No users yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {list.map((user) => (
                  <UserRow key={user.id} user={user} isSelf={user.id === me?.id} onChanged={() => void users.reload()} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
