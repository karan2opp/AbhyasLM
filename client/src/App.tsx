import { lazy, Suspense, type ReactNode } from "react"
import { Show } from "@clerk/react"
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router"
import AppLayout from "@/components/AppLayout"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { LoadingRow } from "@/components/workspace"
import { SessionProvider, useRole, useSession } from "@/lib/session"
import type { UserRole } from "@/lib/types"
import CandidateHome from "@/pages/CandidateHome"
import ChooseRole from "@/pages/ChooseRole"
import Dashboard from "@/pages/Dashboard"
import Landing from "@/pages/Landing"
import PipelineDetail from "@/pages/PipelineDetail"

// Loaded on first visit, so e.g. the markdown and maths renderers only download with the pages that use them.
const BookDetail = lazy(() => import("@/pages/BookDetail"))
const Books = lazy(() => import("@/pages/Books"))
const Exams = lazy(() => import("@/pages/Exams"))
const ExamSession = lazy(() => import("@/pages/ExamSession"))
const NewExam = lazy(() => import("@/pages/NewExam"))
const PublishExam = lazy(() => import("@/pages/PublishExam"))
const QuestionBank = lazy(() => import("@/pages/QuestionBank"))
const Users = lazy(() => import("@/pages/Users"))
const Settings = lazy(() => import("@/pages/Settings"))
const Attempt = lazy(() => import("@/pages/Attempt"))
const Result = lazy(() => import("@/pages/Result"))
const PublishedExams = lazy(() => import("@/pages/PublishedExams"))
const PublishedExamDetail = lazy(() => import("@/pages/PublishedExamDetail"))
const EditExam = lazy(() => import("@/pages/EditExam"))
const AccountSettings = lazy(() => import("@/pages/AccountSettings"))

// Keyed by session so moving from one exam to another starts the page fresh
// instead of carrying over the previous exam's chat and plan state.
function ExamSessionRoute() {
  const { sessionId } = useParams()
  return <ExamSession key={sessionId} />
}

/** Sends anyone without the right role back to their own home page. */
function RoleRoute({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const role = useRole()
  if (!role) return null
  return allow.includes(role) ? <>{children}</> : <Navigate to="/" replace />
}

function NotFound() {
  return (
    <div className="p-10 text-center space-y-3">
      <h1 className="text-2xl font-bold text-white">Page not found</h1>
      <Link to="/" className="text-orange-400 hover:text-orange-300 text-sm font-semibold">
        Go home
      </Link>
    </div>
  )
}

const examiners: UserRole[] = ["admin", "examiner"]

function SignedInApp() {
  const { me, loading, error } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <LoadingRow label="Loading your account..." />
      </div>
    )
  }

  if (error || !me) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6">
        <p className="text-sm text-red-400 text-center max-w-md">
          Couldn&apos;t load your account: {error ?? "unknown error"}. Is the API server running on port 8000?
        </p>
      </div>
    )
  }

  // Straight after signing up, before anything else.
  if (!me.role) return <ChooseRole />

  return (
    <AppLayout>
      <ErrorBoundary>
        <Suspense fallback={<LoadingRow label="Loading..." />}>
          <Routes>
            <Route path="/" element={me.role === "candidate" ? <CandidateHome /> : <Dashboard />} />
            <Route path="/exams" element={<RoleRoute allow={examiners}><Exams /></RoleRoute>} />
            <Route path="/exams/new" element={<RoleRoute allow={examiners}><NewExam /></RoleRoute>} />
            <Route path="/exams/:sessionId" element={<RoleRoute allow={examiners}><ExamSessionRoute /></RoleRoute>} />
            <Route path="/exams/:sessionId/publish" element={<RoleRoute allow={examiners}><PublishExam /></RoleRoute>} />
            <Route path="/question-bank" element={<RoleRoute allow={examiners}><QuestionBank /></RoleRoute>} />
            <Route path="/books" element={<RoleRoute allow={examiners}><Books /></RoleRoute>} />
            <Route path="/books/:bookId" element={<RoleRoute allow={examiners}><BookDetail /></RoleRoute>} />
            <Route path="/published" element={<RoleRoute allow={examiners}><PublishedExams /></RoleRoute>} />
            <Route path="/published/:examId" element={<RoleRoute allow={examiners}><PublishedExamDetail /></RoleRoute>} />
            <Route path="/published/:examId/edit" element={<RoleRoute allow={examiners}><EditExam /></RoleRoute>} />
            <Route path="/attempt/:submissionId" element={<RoleRoute allow={["candidate", "admin"]}><Attempt /></RoleRoute>} />
            {/* Candidates see their own result; examiners see any attempt at their exams. */}
            <Route path="/results/:submissionId" element={<Result />} />
            <Route path="/users" element={<RoleRoute allow={["admin"]}><Users /></RoleRoute>} />
            <Route path="/settings" element={<RoleRoute allow={["admin"]}><Settings /></RoleRoute>} />
            <Route path="/account" element={<RoleRoute allow={examiners}><AccountSettings /></RoleRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Show when="signed-out">
          <Routes>
            <Route path="/pipelines/:slug" element={<PipelineDetail />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </Show>
        <Show when="signed-in">
          <SessionProvider>
            <SignedInApp />
          </SessionProvider>
        </Show>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
