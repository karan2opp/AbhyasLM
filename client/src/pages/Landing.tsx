import { useState } from "react"
import { SignInButton, SignUpButton } from "@clerk/react"
import { ArrowRight, BookOpen, ChevronDown, KeyRound, Library, MessagesSquare, Sparkles } from "lucide-react"

const features = [
  {
    icon: Sparkles,
    title: "AI Question Generation",
    desc: "Describe the exam, talk through your preferences, review a topic-by-topic plan, and get questions whose MCQ answers are checked before they're saved.",
    tone: "from-orange-500/50 via-orange-500/10 to-transparent",
  },
  {
    icon: Library,
    title: "Past Paper Question Bank",
    desc: "Upload previous-year papers. Questions come back word for word, with their options, answer keys and page numbers.",
    tone: "from-amber-500/50 via-amber-500/10 to-transparent",
  },
  {
    icon: BookOpen,
    title: "Questions From Your Textbook",
    desc: "Index a book once. Topics are matched to its chapters, and new questions are written from that exact text.",
    tone: "from-emerald-500/50 via-emerald-500/10 to-transparent",
  },
  {
    icon: MessagesSquare,
    title: "Edit By Chatting",
    desc: '"Give Arrays three more questions", "make question 4 harder" — refinement and review agents make the change for you.',
    tone: "from-orange-500/50 via-orange-500/10 to-transparent",
  },
  {
    icon: KeyRound,
    title: "Your Own Keys",
    desc: "Open source and self-hosted. Bring your own model provider keys, so your content and costs stay with you.",
    tone: "from-amber-500/50 via-amber-500/10 to-transparent",
  },
]

const steps = [
  { title: "Pick a mode", body: "AI generated, from past papers, or from a textbook." },
  { title: "Share preferences", body: "A short conversation about style, emphasis and sample questions." },
  { title: "Review the plan", body: "Adjust topics, subtopics and question counts by hand or by chat." },
  { title: "Generate and refine", body: "Questions are written, checked, and edited until you're happy." },
]

const faqs = [
  { q: "What subjects can I create exams for?", a: "Any. Questions are planned from the subjects and topics you enter, or from the chapters of a book you upload." },
  { q: "Can I change the generated questions?", a: "Yes. Adjust the plan before generating, then ask the Question Review Agent to reword, replace, add or remove questions." },
  { q: "Do I need a paid AI plan?", a: "You use your own API keys, so you pay your model provider directly for what you use." },
]

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <div className="border-b border-zinc-800 py-4 last:border-b-0">
      <button onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-4 text-left">
        <h3 className="text-lg font-medium text-zinc-100">{question}</h3>
        <ChevronDown className={`w-5 h-5 shrink-0 text-zinc-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <p className="pt-4 text-zinc-300 animate-in fade-in slide-in-from-top-1 duration-200">{answer}</p>}
    </div>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <nav className="fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 bg-orange-600 rounded-md text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-heading font-bold text-2xl tracking-tight text-zinc-50">AbhyasLM</span>
          </div>
          <div className="hidden md:flex items-baseline space-x-8">
            <a href="#features" className="text-zinc-300 hover:text-orange-400 transition-colors px-3 py-2 text-sm font-medium">
              Features
            </a>
            <a href="#how-it-works" className="text-zinc-300 hover:text-orange-400 transition-colors px-3 py-2 text-sm font-medium">
              How it works
            </a>
            <a href="#faq" className="text-zinc-300 hover:text-orange-400 transition-colors px-3 py-2 text-sm font-medium">
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <SignInButton>
              <button className="text-zinc-300 hover:text-orange-400 font-medium text-sm transition-colors">Log in</button>
            </SignInButton>
            <SignUpButton>
              <button className="bg-orange-600 text-white hover:bg-orange-700 px-4 sm:px-5 py-2.5 rounded-full text-sm font-semibold transition-all shadow-md">Get Started</button>
            </SignUpButton>
          </div>
        </div>
      </nav>

      <section className="pt-40 pb-24 md:pt-52 md:pb-32 px-4">
        <div className="max-w-4xl mx-auto text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-300 mb-6">
            <KeyRound className="h-3.5 w-3.5" /> Open source · bring your own keys
          </span>
          <h1 className="text-5xl md:text-7xl font-bold font-heading leading-[1.1] tracking-tight mb-6 text-zinc-50">
            Build exams from <br className="hidden md:block" />
            <span className="text-orange-500">your own material</span>
          </h1>
          <p className="text-lg md:text-xl text-zinc-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Generate questions with AI, reuse past papers, and write new questions straight from your textbooks.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <SignUpButton>
              <button className="w-full sm:w-auto px-8 py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-full font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-orange-950/40">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </button>
            </SignUpButton>
            <a href="#how-it-works" className="w-full sm:w-auto px-8 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-full font-semibold transition-all flex items-center justify-center">
              See How it Works
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 px-4 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-50">Everything you need to set a good exam</h2>
            <p className="text-zinc-300 text-lg max-w-2xl mx-auto">The AI does the heavy lifting of writing questions, so you can focus on what to assess.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.title} className="relative group">
                  <div className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${f.tone} opacity-30 group-hover:opacity-100 transition-opacity blur-md`} />
                  <div className="relative h-full bg-zinc-950 rounded-3xl p-8 border border-zinc-800/50 flex flex-col gap-4">
                    <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center">
                      <Icon className="h-6 w-6 text-orange-400" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-100 tracking-wide">{f.title}</h3>
                    <p className="text-zinc-400 leading-relaxed text-sm md:text-base">{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-24 px-4 bg-black scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-50">How it works</h2>
            <p className="text-zinc-300 text-lg max-w-2xl mx-auto">From a list of topics to a reviewed question paper in four steps.</p>
          </div>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-white/10 bg-[#0f0f11] p-6 space-y-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-orange-500/40 bg-orange-500/10 text-sm font-bold text-orange-300 tabular-nums">{i + 1}</span>
                <h3 className="text-lg font-bold text-white">{step.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="faq" className="py-24 px-4 bg-zinc-900 border-t border-zinc-800 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-bold font-heading mb-4 text-zinc-50">Frequently Asked Questions</h2>
          </div>
          <div className="bg-zinc-950 p-6 rounded-2xl border border-zinc-800">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-8 px-4 bg-zinc-950">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-zinc-500 text-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            <span className="font-heading font-bold text-zinc-300">AbhyasLM</span>
          </div>
          <p>Open source exam generation.</p>
        </div>
      </footer>
    </div>
  )
}
