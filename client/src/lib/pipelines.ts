import { BookOpen, ClipboardCheck, Library, Sparkles, type LucideIcon } from "lucide-react"

export interface Pipeline {
  slug: string
  /** The agent's name — Sanskrit-rooted, same family as "Abhyas" itself. */
  codename: string
  /** What "codename" means, shown as a short gloss next to it. */
  meaning: string
  label: string
  desc: string
  intro: string
  steps: string[]
  icon: LucideIcon
  src: string
  alt: string
}

export const pipelines: Pipeline[] = [
  {
    slug: "ai-generation",
    codename: "Srijan",
    meaning: "creation",
    label: "AI Generation",
    desc: "Describe the exam and let AI plan, generate, and verify every question.",
    intro: "No source material needed — describe the exam you want, and the AI plans, writes, and checks every question from its own knowledge.",
    steps: ["Describe Your Exam", "AI Plans the Exam", "AI Generates Questions", "Verified & Ready"],
    icon: Sparkles,
    src: "/Ai generation.png",
    alt: "AI Question Generation pipeline: describe your exam, AI plans it, AI generates questions, verified and ready",
  },
  {
    slug: "past-papers",
    codename: "Smriti",
    meaning: "memory",
    label: "Past Papers",
    desc: "Upload previous papers once — matching questions are retrieved and reused instantly.",
    intro: "Upload your previous-year papers once. Every question is extracted, classified, and stored in a searchable bank you can pull from for any future exam.",
    steps: ["Upload Past Papers", "Extract & Organize", "Store as a Searchable Bank", "Retrieve & Create Exam"],
    icon: Library,
    src: "/past-paper.png",
    alt: "Past Papers pipeline: upload PDFs, extract and organize questions, store as a searchable bank, retrieve to create a new exam",
  },
  {
    slug: "textbook",
    codename: "Gyan",
    meaning: "knowledge",
    label: "Textbook",
    desc: "Index a book once, and new questions are written straight from its content.",
    intro: "Upload a textbook once. Its chapters are indexed and matched to your topics, and new questions are generated grounded in that exact text.",
    steps: ["Upload Your Textbook", "Process the Content", "Map Topics", "Generate Questions", "Exam Ready"],
    icon: BookOpen,
    src: "/book.png",
    alt: "Textbook pipeline: upload a textbook, process the content, map topics, generate questions, exam ready",
  },
  {
    slug: "evaluation",
    codename: "Nirnay",
    meaning: "judgment",
    label: "Evaluation",
    desc: "MCQs auto-marked instantly; written answers AI-graded and reviewable by you.",
    intro: "Once candidates submit, MCQs are marked instantly and written answers are AI-graded against a rubric — with every mark reviewable and overridable by you.",
    steps: ["Submit Answers", "Auto-Mark MCQs", "AI Grade Descriptive", "Review & Override", "Final Results"],
    icon: ClipboardCheck,
    src: "/Evaluation.png",
    alt: "Evaluation pipeline: submit answers, auto-mark MCQs, AI grade descriptive answers, examiner review and override, final results",
  },
]

export function getPipeline(slug: string | undefined) {
  return pipelines.find((p) => p.slug === slug)
}
