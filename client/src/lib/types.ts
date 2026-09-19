// Mirrors of the API's response shapes (see server/src/module/*). Kept to the
// fields the UI actually reads.

export type JobStatus = 'pending' | 'processing' | 'in_progress' | 'completed' | 'failed'
export type QuestionType = 'mcq' | 'descriptive'
export type Difficulty = 'easy' | 'medium' | 'hard'

export const EDUCATION_CATEGORIES = [
  'Lower Middle School',
  'Middle School',
  'High School',
  'Senior Secondary',
  'Undergraduate',
  'Postgraduate',
  'Professional',
  'Not Specified',
] as const
export type EducationCategory = (typeof EDUCATION_CATEGORIES)[number]

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

// ── Question generation ─────────────────────────────────────────────────────

export type TopicInput = string | { topic: string; subtopics?: string[] }

export interface ExamSectionInput {
  name: string
  subject: string
  question_count: number
  question_type: QuestionType
  marks: number
  topics: TopicInput[]
}

export interface ExamInput {
  title?: string
  instructions?: string[]
  difficulty?: Difficulty
  educationLevel?: { value: string; category: EducationCategory }
  bookId?: string
  sections: ExamSectionInput[]
}

export interface ConversationSummary {
  globalInstructions: string[]
  topicSpecificInstructions: { topic: string; instructions: string[] }[]
}

export interface BlueprintSubtopic {
  name: string
  weight: number
  allocatedQuestions: number
  sourceNodeIds?: string[]
}

export interface BlueprintTopic {
  topic: string
  weight: number
  allocatedQuestions: number
  subtopics: BlueprintSubtopic[]
}

export interface BlueprintSection {
  name: string
  subject: string
  topics: BlueprintTopic[]
  unmatchedTopics?: string[]
}

export type ContentBlock =
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }

interface StoredQuestionBase {
  id: string
  topic: string
  subtopic: string
  marks: number
  question_text: string
  content_blocks: ContentBlock[]
}

export type StoredQuestion =
  | (StoredQuestionBase & { type: 'mcq'; options: { text: string; isCode: boolean }[]; correct_option: 'A' | 'B' | 'C' | 'D' })
  | (StoredQuestionBase & {
      type: 'descriptive'
      rubric: { categories: { name: string; weight: number; key_points: string[] }[] }
    })

export interface GeneratedExam {
  sections: { name: string; subject: string; topics: { topic: string; questions: StoredQuestion[] }[] }[]
}

type StageStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface SessionSummary {
  id: string
  title: string | null
  sectionCount: number
  bookId: string | null
  status: 'in_progress' | 'completed'
  blueprintStatus: StageStatus
  questionsStatus: StageStatus
  createdBy: string
  /** Set when an admin is looking at another examiner's session. */
  ownerEmail: string | null
  createdAt: string
}

/** GET /api/generation-agents/sessions — search and pagination both run server-side. */
export interface SessionListResponse {
  sessions: SessionSummary[]
  total: number
  page: number
  pageSize: number
}

export interface Session {
  id: string
  examInput: ExamInput
  status: 'in_progress' | 'completed'
  summary: ConversationSummary | null
  blueprintStatus: StageStatus
  blueprint: { sections: BlueprintSection[] } | null
  blueprintError: string | null
  questionsStatus: StageStatus
  questions: GeneratedExam | null
  questionsError: string | null
  intentHistory: ChatTurn[]
}

export interface IntentTurnResult {
  sessionId: string
  done: boolean
  message: string
  summary: ConversationSummary | null
}

// ── Past papers (question bank) ─────────────────────────────────────────────

export interface PaperDocument {
  id: string
  title: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  totalChunks: number
  error: string | null
  createdBy: string
  ownerEmail: string | null
  createdAt: string
}

export interface RetrievedQuestion {
  id: string
  type: QuestionType
  topic: string
  question_text: string
  marks: number
  options?: string[]
  correct_option?: string
  source: { documentId: string; questionNumber: string | null; pageStart: number }
}

export interface QuestionBankSearchResult {
  score: number
  chunk: {
    id: string
    documentId: string
    questionNumber: string | null
    rawText: string
    subject: string | null
    topics: string[] | null
    description: string | null
    pageStart: number
    pageEnd: number
    images: { url: string; page: number }[]
    tables: { page: number; header: string[] | null; rows: (string | null)[][] }[]
  }
}

export interface RetrievedTopicGroup {
  tier: 'high' | 'mid' | 'low'
  topic: string
  allocatedQuestions: number
  questions: RetrievedQuestion[]
}

// ── Books ───────────────────────────────────────────────────────────────────

export interface BookProgress {
  stage: 'extracting' | 'indexing' | 'merging' | 'saving'
  windowsDone: number
  windowsTotal: number
}

export interface BookSummary {
  id: string
  title: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: BookProgress | null
  pageCount: number | null
  error: string | null
  createdBy: string
  ownerEmail: string | null
  createdAt: string
}

export interface BookTocSubsection {
  id: string
  name: string
  description: string
  keyConcepts: string[]
  pages: [number, number]
}

export interface BookToc {
  title: string
  chapters: {
    id: string
    title: string
    titleGenerated: boolean
    pages: [number, number]
    sections: { id: string; heading: string; headingGenerated: boolean; pages: [number, number]; subsections: BookTocSubsection[] }[]
  }[]
}

export interface Book extends BookSummary {
  toc: BookToc | null
}

export interface SubsectionContent {
  node: { id: string; title: string; pageStart: number; pageEnd: number }
  markdown: string
}

// ── Users & roles ───────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'examiner' | 'candidate'

export interface Me {
  id: string
  email: string | null
  /** null until the user picks a role right after signing up. */
  role: UserRole | null
  /** Whether this examiner has set their own OpenAI key (see AccountSettings.tsx). */
  hasOwnOpenAiKey: boolean
}

export interface UserSummary {
  id: string
  email: string | null
  name: string | null
  role: UserRole | null
  createdAt: string
}

// ── Published exams & attempts ──────────────────────────────────────────────

export type ExamStatus = 'draft' | 'published' | 'closed'
export type SubmissionStatus = 'in_progress' | 'evaluating' | 'submitted'

export interface PublishedExam {
  id: string
  title: string
  joinCode: string
  status: ExamStatus
  durationMinutes: number
  totalMarks: number
  opensAt: string | null
  closesAt: string | null
  resultsVisible: boolean
  questionCount: number
  submissionCount: number
  createdAt: string
}

export interface MySubmission {
  id: string
  examId: string
  title: string
  status: SubmissionStatus
  score: number | null
  totalMarks: number
  resultsVisible: boolean
  deadlineAt: string
  submittedAt: string | null
  startedAt: string
}

export interface ExamSubmissionRow {
  id: string
  userId: string
  name: string | null
  email: string | null
  status: SubmissionStatus
  score: number | null
  startedAt: string
  submittedAt: string | null
  autoSubmitted: boolean
}

export interface PaperQuestion {
  id: string
  type: QuestionType
  description: string
  contentBlocks: ContentBlock[]
  marks: number
  position: number
  options: { id: string; value: string; isCode: boolean }[]
}

export interface CandidatePaper {
  exam: { id: string; title: string; instructions: string[]; durationMinutes: number; totalMarks: number }
  submission: { id: string; status: SubmissionStatus; startedAt: string; deadlineAt: string }
  sections: { id: string; title: string; subject: string; questions: PaperQuestion[] }[]
  answers: { questionId: string; optionIds: string[]; textAnswer: string | null }[]
}

export interface ResultQuestion extends Omit<PaperQuestion, 'options' | 'position'> {
  rubric: { categories: { name: string; weight: number; key_points: string[] }[] } | null
  options: { id: string; value: string; isCode: boolean; isCorrect: boolean }[]
  answer: {
    id: string
    optionIds: string[]
    textAnswer: string | null
    isCorrect: boolean | null
    marksAwarded: number | null
    feedback: string | null
    markedBy: 'auto' | 'ai' | 'examiner' | null
  } | null
}

export interface SubmissionResult {
  exam: { id: string; title: string; totalMarks: number; resultsVisible: boolean }
  candidate: { name: string | null; email: string | null } | null
  submission: {
    id: string
    status: SubmissionStatus
    score: number | null
    submittedAt: string | null
    autoSubmitted: boolean
    evaluationError: string | null
  }
  sections: { id: string; title: string; subject: string; questions: ResultQuestion[] }[]
  withheld: boolean
  canGrade?: boolean
}

// ── Platform settings (admin) ───────────────────────────────────────────────

export interface PlatformSetting {
  key: string
  label: string
  description: string
  default: string
  value: string
}

/** The raw exam row (GET /api/exams/:examId), used by the Edit screen. */
export interface ExamDetail {
  id: string
  title: string
  instructions: string[] | null
  durationMinutes: number
  totalMarks: number
  opensAt: string | null
  closesAt: string | null
  status: ExamStatus
  resultsVisible: boolean
  joinCode: string
}
