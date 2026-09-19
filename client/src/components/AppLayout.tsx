import { useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router"
import { useClerk, useUser } from "@clerk/react"
import { BookOpen, ChevronsLeft, ChevronsRight, FileText, GraduationCap, LayoutDashboard, Library, LogOut, Menu, Send, Settings as SettingsIcon, Sparkles, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { RoleToggle } from "@/components/RoleToggle"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useRole } from "@/lib/session"
import type { UserRole } from "@/lib/types"

// Each link lists the roles that see it. Admins see everything an examiner
// does, plus user management.
const sidebarLinks: { name: string; href: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["admin", "examiner"] },
  { name: "My Exams", href: "/", icon: GraduationCap, roles: ["candidate"] },
  { name: "Exams", href: "/exams", icon: FileText, roles: ["admin", "examiner"] },
  { name: "Published", href: "/published", icon: Send, roles: ["admin", "examiner"] },
  { name: "Question Bank", href: "/question-bank", icon: Library, roles: ["admin", "examiner"] },
  { name: "Books", href: "/books", icon: BookOpen, roles: ["admin", "examiner"] },
  { name: "Users", href: "/users", icon: Users, roles: ["admin"] },
  { name: "Settings", href: "/settings", icon: SettingsIcon, roles: ["admin"] },
]

const ROLE_LABEL: Record<UserRole, string> = { admin: "Admin", examiner: "Examiner", candidate: "Candidate" }

// Same shell as Abhyas's teacher portal: collapsible black sidebar, user badge and sign-out at the bottom.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const role = useRole()
  const { user } = useUser()
  const { signOut } = useClerk()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "You"

  return (
    <TooltipProvider>
      <div className="flex flex-col md:flex-row h-screen w-full bg-[#050505] text-gray-100 font-sans overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-black border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-1.5 rounded-md shadow-lg shadow-orange-950/40">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">AbhyasLM</span>
          </div>
          <button onClick={() => setIsMobileOpen(true)} className="p-2 -mr-2 text-gray-400 hover:text-white" aria-label="Open menu">
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Overlay */}
        {isMobileOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />}

        {/* Sidebar */}
        <aside
          className={cn(
            "fixed md:relative z-50 h-full border-r border-white/10 flex flex-col bg-black shrink-0 transition-all duration-300",
            isCollapsed ? "md:w-20" : "md:w-64",
            "w-64",
            isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          )}
        >
          <button className="md:hidden absolute top-4 right-4 text-gray-400 hover:text-white z-10" onClick={() => setIsMobileOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden md:block absolute -right-3 top-8 bg-[#18181b] border border-white/10 rounded-full p-1 text-gray-400 hover:text-white hover:bg-white/10 transition-colors z-10 shadow-md"
          >
            {isCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>

          {/* Logo */}
          <div className={cn("p-6 flex items-center gap-3 border-b border-white/10", isCollapsed && "justify-center p-4")}>
            <div className="bg-orange-600 p-2 rounded-lg shadow-lg shadow-orange-950/40 shrink-0">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            {!isCollapsed && (
              <div className="overflow-hidden whitespace-nowrap">
                <p className="font-heading font-bold text-lg leading-tight tracking-tight text-white">AbhyasLM</p>
                <p className="text-[11px] text-gray-400 font-medium tracking-wide uppercase">{role ? ROLE_LABEL[role] : "Exam Studio"}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar" aria-label="Main">
            {sidebarLinks.filter((link) => (role ? link.roles.includes(role) : false)).map((link) => {
              const isActive = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(link.href + "/")
              const Icon = link.icon
              return (
                <NavLink
                  key={link.name}
                  to={link.href}
                  title={isCollapsed ? link.name : undefined}
                  onClick={() => setIsMobileOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isCollapsed ? "justify-center" : "gap-3",
                    isActive ? "bg-orange-600 text-white font-semibold shadow-md shadow-orange-950/40" : "text-white/70 hover:text-white hover:bg-zinc-900/80",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-white" : "text-white/70")} />
                  {!isCollapsed && <span className="whitespace-nowrap">{link.name}</span>}
                </NavLink>
              )
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="p-3 border-t border-white/10 space-y-2 mt-auto">
            {!isCollapsed && <RoleToggle />}
            <div className={cn("flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900/60 border border-white/5", isCollapsed && "justify-center")}>
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full border border-orange-500/40 shrink-0 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-orange-600/30 border border-orange-500/40 text-orange-400 font-bold flex items-center justify-center text-xs shrink-0">
                  {displayName[0]?.toUpperCase() || "U"}
                </div>
              )}
              {!isCollapsed && (
                <div className="overflow-hidden whitespace-nowrap min-w-0">
                  <p className="text-xs font-semibold text-white truncate leading-tight">{displayName}</p>
                  <p className="text-[10px] text-gray-400 truncate leading-tight">{user?.primaryEmailAddress?.emailAddress}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => void signOut({ redirectUrl: "/" })}
              title={isCollapsed ? "Sign Out" : undefined}
              className={cn(
                "w-full flex items-center px-3 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-red-400 hover:bg-[#14151f] transition-all",
                isCollapsed ? "justify-center" : "gap-2.5",
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="whitespace-nowrap">Sign Out</span>}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar relative bg-[#050505]">{children}</main>
      </div>
    </TooltipProvider>
  )
}
