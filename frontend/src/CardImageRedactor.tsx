import { useEffect, useState, type DragEvent } from 'react'
import { ArrowRight, ImagePlus, ShieldCheck } from 'lucide-react'

const maxImageBytes = 5 * 1024 * 1024

export default function CardImageRedactor({ onUpload }: { onUpload: (image: File, onProgress: (percent: number) => void) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const selectImage = (selected?: File) => {
    if (!selected) return
    if (!selected.type.startsWith('image/')) {
      setError('Choose an image file supported by your browser.')
      return
    }
    if (selected.size > maxImageBytes) {
      setError('Choose an image that is 5 MB or smaller.')
      return
    }
    setError('')
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
  }

  const submit = async () => {
    if (!file) return
    setError('')
    setSubmitting(true)
    setUploadProgress(0)
    try {
      await onUpload(file, setUploadProgress)
      setFile(null)
      setPreviewUrl('')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The image could not be uploaded.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    selectImage(event.dataTransfer.files?.[0])
  }

  return (
    <section className="account-upload-card" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="account-section-heading">
        <div><span className="eyebrow">PRIVATE SUBMISSION</span><h2>Upload a card image</h2></div>
        <ShieldCheck size={22} />
      </div>
      <label className="redactor-file-button">
        <ImagePlus size={18} /> {file ? 'Choose a different image' : 'Choose card image'}
        <input type="file" accept="image/*" onChange={(event) => { selectImage(event.target.files?.[0]); event.target.value = '' }} />
      </label>
      {previewUrl && <>
        <div className="redactor-preview"><img src={previewUrl} alt="Card image preview" /></div>
        <button type="button" className="button" onClick={() => void submit()} disabled={submitting}>
          {submitting ? `Uploading… ${uploadProgress}%` : <>Upload image <ArrowRight size={16} /></>}
        </button>
        {submitting && <div className="submission-progress" role="status" aria-live="polite">
          <div className="submission-progress-heading"><strong>Uploading your image</strong><span>{uploadProgress}%</span></div>
          <div className="submission-progress-track" role="progressbar" aria-label="Image upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: `${uploadProgress}%` }} /></div>
          <span className="submission-progress-caption">Sending your image securely…</span>
        </div>}
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="redactor-retention">Images are visible to authorized administrators and deleted after 30 days. Only upload images you are allowed to share.</p>
    </section>
  )
}
