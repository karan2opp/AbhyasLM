import { useRef, useState } from "react"
import { Loader2, UploadCloud } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useApi } from "@/lib/api"
import { fieldClass } from "./workspace"

/** The "Upload a paper / Upload a book" side panel from Abhyas's PYQ and Source flows. */
export function UploadPanel<T>({
  heading,
  endpoint,
  hint,
  buttonText,
  successText,
  onUploaded,
}: {
  heading: string
  endpoint: string
  hint?: string
  buttonText: string
  successText: string
  onUploaded: (result: T) => void | Promise<void>
}) {
  const api = useApi()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async () => {
    if (!file) {
      toast.error("Choose a PDF to upload")
      return
    }
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      if (title.trim()) body.append("title", title.trim())
      const result = await api<T>(endpoint, { method: "POST", body })
      toast.success(successText)
      setFile(null)
      setTitle("")
      if (fileRef.current) fileRef.current.value = ""
      await onUploaded(result)
    } catch (err) {
      toast.error((err as Error).message || "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4 space-y-3">
      <h3 className="text-sm font-bold text-white flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-orange-400" /> {heading}
      </h3>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        aria-label="PDF file"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-white/15"
      />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" aria-label="Title" className={fieldClass} />
      {hint && <p className="text-[11px] text-gray-500">{hint}</p>}
      <Button onClick={() => void upload()} disabled={uploading || !file} className="w-full bg-orange-600 hover:bg-orange-700 text-white h-9 text-sm font-semibold">
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonText}
      </Button>
    </div>
  )
}
