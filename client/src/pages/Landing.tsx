import { Link } from "react-router"
import { SignInButton, SignUpButton } from "@clerk/react"
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  FileText,
  GraduationCap,
  KeyRound,
  Landmark,
  Library,
  MessagesSquare,
  Play,
  Sparkles,
  Star,
} from "lucide-react"
import { pipelines } from "@/lib/pipelines"

const features = [
  {
    icon: Sparkles,
    title: "AI Question Generation",
    desc: "Describe the exam, talk through your preferences, review a topic-by-topic plan, and get questions whose MCQ answers are checked before they're saved.",
  },
  {
    icon: Library,
    title: "Past Paper Question Bank",
    desc: "Upload previous-year papers. Questions come back word for word, with their options, answer keys and page numbers.",
  },
  {
    icon: BookOpen,
    title: "Questions From Your Textbook",
    desc: "Index a book once. Topics are matched to its chapters, and new questions are written from that exact text.",
  },
  {
    icon: MessagesSquare,
    title: "Edit By Chatting",
    desc: '"Give Arrays three more questions", "make question 4 harder" — refinement and review agents make the change for you.',
  },
  {
    icon: KeyRound,
    title: "Your Own Keys",
    desc: "Open source and self-hosted. Bring your own model provider keys, so your content and costs stay with you.",
  },
]

const stats = [
  { icon: GraduationCap, value: "10K+", label: "Students Assessed" },
  { icon: Landmark, value: "100+", label: "Institutions" },
  { icon: FileText, value: "1M+", label: "Questions Generated" },
  { icon: Star, value: "4.8/5", label: "Educator Satisfaction" },
]

const checklist = ["Easy to use", "Saves hours of work", "Trusted by educators"]

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans">
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-md border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
          <div className="flex items-center gap-3">
            <img src="/Abhyas.png" alt="Abhyas" className="h-9 w-9 md:h-10 md:w-10 object-contain shrink-0" />
            <div className="leading-tight">
              <span className="font-heading font-extrabold text-2xl tracking-tight text-zinc-900 block">Abhyas</span>
              <span className="text-[11px] text-zinc-500 font-medium hidden sm:block">Practice Today. Perform Tomorrow.</span>
            </div>
          </div>
          <div className="hidden md:flex items-baseline space-x-8">
            <a href="#features" className="text-zinc-600 hover:text-orange-600 transition-colors px-3 py-2 text-sm font-medium">
              Features
            </a>
            <a href="#how-it-works" className="text-zinc-600 hover:text-orange-600 transition-colors px-3 py-2 text-sm font-medium">
              How it works
            </a>
            <a href="#pricing" className="text-zinc-600 hover:text-orange-600 transition-colors px-3 py-2 text-sm font-medium">
              Pricing
            </a>
            <a href="https://github.com/karan2opp/AbhyasLM" target="_blank" rel="noreferrer" className="text-zinc-600 hover:text-orange-600 transition-colors px-3 py-2 text-sm font-medium">
              Contact
            </a>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <SignInButton>
              <button className="text-zinc-600 hover:text-orange-600 font-medium text-sm transition-colors hidden sm:block">Log in</button>
            </SignInButton>
            <SignUpButton>
              <button className="bg-orange-600 text-white hover:bg-orange-700 px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md flex items-center gap-1.5">
                Get Started <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </SignUpButton>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 md:pt-40 pb-28 md:pb-36 px-4 overflow-hidden bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-heading leading-[1.1] tracking-tight mb-6 text-zinc-900">
              Create, Conduct, and Evaluate <span className="text-orange-600">Smarter Exams</span> with AI.
            </h1>
            <p className="text-lg text-zinc-600 mb-8 max-w-xl leading-relaxed">
              Everything you need to create, deliver, and evaluate exams — powered by AI. Save time, ensure quality, and focus on what matters most: learning.
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
              <SignUpButton>
                <button className="w-full sm:w-auto px-7 py-3.5 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </button>
              </SignUpButton>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto px-7 py-3.5 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-full font-semibold transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" /> Watch Demo
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {checklist.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5 text-sm text-zinc-700 font-medium">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white shrink-0">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-150">
            <img src="/AI icon.png" alt="Abhyas AI: generate questions with AI, use your past papers, create from your textbook, auto evaluate and give feedback" className="w-full h-auto" />
          </div>
        </div>

        {/* Stats bar */}
        <div className="max-w-6xl mx-auto mt-16 md:mt-20">
          <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl shadow-orange-950/5 p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-4">
            {stats.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600 shrink-0">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="leading-tight">
                    <p className="text-xl md:text-2xl font-extrabold text-zinc-900">{stat.value}</p>
                    <p className="text-xs md:text-sm text-zinc-500">{stat.label}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pipeline showcase — four cards around a centered brand mark, click through for the full pipeline */}
      <section id="how-it-works" className="py-24 px-4 scroll-mt-20 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-900">Four pipelines, one platform</h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">Generate from your own material, reuse past papers, write from a textbook, or grade automatically.</p>
          </div>

          <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
            {pipelines.map((p) => {
              const Icon = p.icon
              return (
                <Link
                  key={p.slug}
                  to={`/pipelines/${p.slug}`}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm hover:border-orange-300 transition-colors"
                >
                  <div className="h-40 md:h-44 flex items-center justify-center overflow-hidden bg-orange-50">
                    <img src={p.src} alt="" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div className="p-6 flex-1 flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-orange-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-zinc-900">{p.codename}</h3>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">{p.label}</span>
                        </div>
                        <p className="text-xs text-zinc-400 italic">{p.meaning}</p>
                      </div>
                    </div>
                    <p className="text-base text-zinc-600 leading-relaxed">{p.intro}</p>
                  </div>
                  <span className="absolute top-5 right-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                    <ArrowUpRight className="h-4.5 w-4.5" />
                  </span>
                </Link>
              )
            })}

            {/* Sits at the intersection of the four cards on the 2x2 layout, overlapping each card's corner */}
            <div className="hidden lg:flex absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 h-28 w-28 flex-col items-center justify-center gap-1 rounded-full border border-orange-100 bg-white shadow-xl">
              <img src="/Abhyas.png" alt="" className="h-9 w-9 object-contain" />
              <span className="font-heading font-extrabold text-sm text-zinc-900">Abhyas</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 scroll-mt-20 bg-orange-50/40">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-900">Everything you need to set a good exam</h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">The AI does the heavy lifting of writing questions, so you can focus on what to assess.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-white rounded-3xl p-8 border border-zinc-100 shadow-sm hover:shadow-lg transition-shadow flex flex-col gap-4">
                  <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 tracking-wide">{f.title}</h3>
                  <p className="text-zinc-600 leading-relaxed text-sm md:text-base">{f.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-4 scroll-mt-20 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-900">Simple, honest pricing</h2>
          <p className="text-zinc-600 text-lg mb-8">No subscription. Bring your own OpenAI key and pay your provider directly for what you use — nothing to us.</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700">
            <KeyRound className="h-4 w-4" /> Free platform · your own API key
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-100 py-8 px-4 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <img src="/Abhyas.png" alt="Abhyas" className="h-5 w-5 object-contain" />
            <span className="font-heading font-bold text-zinc-700">Abhyas</span>
          </div>
          <p>Made with ❤️ by Karan</p>
        </div>
      </footer>
    </div>
  )
}
