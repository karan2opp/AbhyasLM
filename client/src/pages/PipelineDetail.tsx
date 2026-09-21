import { Link, Navigate, useParams } from "react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { SignUpButton } from "@clerk/react"
import { getPipeline } from "@/lib/pipelines"

export default function PipelineDetail() {
  const { slug } = useParams()
  const pipeline = getPipeline(slug)

  if (!pipeline) return <Navigate to="/" replace />

  const Icon = pipeline.icon

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-20">
          <Link to="/" className="flex items-center gap-3">
            <img src="/Abhyas.png" alt="Abhyas" className="h-9 w-9 object-contain shrink-0" />
            <span className="font-heading font-extrabold text-2xl tracking-tight text-zinc-900">Abhyas</span>
          </Link>
          <SignUpButton>
            <button className="bg-orange-600 text-white hover:bg-orange-700 px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md flex items-center gap-1.5">
              Get Started <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </SignUpButton>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 hover:text-orange-600 transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to all pipelines
        </Link>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Icon className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-3xl md:text-4xl font-bold font-heading text-zinc-900">{pipeline.codename}</h1>
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600 bg-orange-50 rounded-full px-2.5 py-1">{pipeline.label}</span>
            </div>
            <p className="text-sm text-zinc-400 italic">{pipeline.meaning}</p>
          </div>
        </div>
        <p className="text-lg text-zinc-600 max-w-2xl leading-relaxed mb-6">{pipeline.intro}</p>

        <ol className="flex flex-wrap gap-2 mb-10">
          {pipeline.steps.map((step, i) => (
            <li key={step} className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-sm font-semibold text-orange-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white text-[11px] font-bold tabular-nums shrink-0">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>

        <div className="rounded-3xl border border-zinc-100 shadow-lg shadow-orange-950/5 overflow-hidden bg-white">
          <img src={pipeline.src} alt={pipeline.alt} className="w-full h-auto" />
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <SignUpButton>
            <button className="px-7 py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20">
              Try it free <ArrowRight className="w-4 h-4" />
            </button>
          </SignUpButton>
        </div>
      </div>
    </div>
  )
}
