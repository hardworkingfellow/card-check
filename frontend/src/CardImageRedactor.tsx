import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight, ImagePlus, RotateCcw, ShieldCheck } from 'lucide-react'

type Mask = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }

const maxImageBytes = 5 * 1024 * 1024
const maxImagePixels = 20_000_000

function getPoint(event: PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000)),
    y: Math.max(0, Math.min(1000, ((event.clientY - bounds.top) / bounds.height) * 1000)),
  }
}

function rectangle(start: Point, end: Point): Mask {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function toUploadFile(previewUrl: string, masks: Mask[]): Promise<File> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > maxImagePixels) {
        reject(new Error('Choose an image with dimensions below 20 megapixels.'))
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Your browser could not prepare the image.'))
        return
      }

      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      context.fillStyle = '#000'
      for (const mask of masks) {
        context.fillRect(
          (mask.x / 1000) * canvas.width,
          (mask.y / 1000) * canvas.height,
          (mask.width / 1000) * canvas.width,
          (mask.height / 1000) * canvas.height,
        )
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Your browser could not export the image.'))
          return
        }
        if (blob.size > maxImageBytes) {
          reject(new Error('The prepared image is larger than 5 MB. Choose a smaller image.'))
          return
        }
        resolve(new File([blob], 'card-image.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.88)
    }
    image.onerror = () => reject(new Error('This image could not be opened.'))
    image.src = previewUrl
  })
}

export default function CardImageRedactor({ onUpload }: { onUpload: (image: File, onProgress: (percent: number) => void) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [masks, setMasks] = useState<Mask[]>([])
  const [start, setStart] = useState<Point | null>(null)
  const [draft, setDraft] = useState<Mask | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'preparing' | 'uploading'>('preparing')
  const [error, setError] = useState('')
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const selectImage = (selected: File | undefined) => {
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
    setMasks([])
  }

  const beginMask = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = getPoint(event)
    setStart(point)
    setDraft({ x: point.x, y: point.y, width: 0, height: 0 })
  }

  const moveMask = (event: PointerEvent<SVGSVGElement>) => {
    if (start) setDraft(rectangle(start, getPoint(event)))
  }

  const finishMask = (event: PointerEvent<SVGSVGElement>) => {
    if (!start) return
    const mask = rectangle(start, getPoint(event))
    if (mask.width >= 8 && mask.height >= 8) {
      setMasks((current) => [...current, mask])
      setError('')
    }
    setStart(null)
    setDraft(null)
  }

  const submit = async () => {
    if (!file || !previewUrl) return
    setError('')
    setSubmitting(true)
    setUploadProgress(0)
    setUploadStage('preparing')
    try {
      const preparedFile = await toUploadFile(previewUrl, masks)
      setUploadStage('uploading')
      await onUpload(preparedFile, setUploadProgress)
      setFile(null)
      setPreviewUrl('')
      setMasks([])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The image could not be uploaded.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="account-upload-card">
      <div className="account-section-heading">
        <div><span className="eyebrow">PRIVATE SUBMISSION</span><h2>Upload a card image</h2></div>
        <ShieldCheck size={22} />
      </div>
      <label className="redactor-file-button">
        <ImagePlus size={18} /> {file ? 'Choose a different image' : 'Choose card image'}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            selectImage(event.target.files?.[0])
            event.target.value = ''
          }}
        />
      </label>
      {previewUrl && (
        <>
          <div className="redactor-preview">
            <img src={previewUrl} alt="Card image preview" />
            <svg
              ref={svgRef}
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              role="application"
              aria-label="Optionally draw black boxes over sensitive areas in the image"
              onPointerDown={beginMask}
              onPointerMove={moveMask}
              onPointerUp={finishMask}
              onPointerCancel={finishMask}
            >
              {masks.map((mask, index) => <rect key={index} {...mask} className="redactor-mask" />)}
              {draft && <rect {...draft} className="redactor-mask redactor-mask-draft" />}
            </svg>
          </div>
          <p className="redactor-help">Optionally click and drag over details to cover them before uploading.</p>
          <div className="redactor-actions">
            <button type="button" className="button button-outline" onClick={() => setMasks([])} disabled={!masks.length}>
              <RotateCcw size={15} /> Clear boxes
            </button>
            <span>{masks.length} box{masks.length === 1 ? '' : 'es'} drawn</span>
          </div>
          <button type="button" className="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? (uploadStage === 'preparing' ? 'Preparing image…' : `Uploading… ${uploadProgress}%`) : <>Upload image <ArrowRight size={16} /></>}
          </button>
          {submitting && (
            <div className="submission-progress" role="status" aria-live="polite">
              <div className="submission-progress-heading"><strong>{uploadStage === 'preparing' ? 'Preparing your image' : 'Uploading your image'}</strong><span>{uploadStage === 'uploading' ? `${uploadProgress}%` : ''}</span></div>
              <div className="submission-progress-track" role="progressbar" aria-label="Image upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadStage === 'preparing' ? 0 : uploadProgress}><span style={{ width: `${uploadStage === 'preparing' ? 4 : uploadProgress}%` }} /></div>
              <span className="submission-progress-caption">{uploadStage === 'preparing' ? 'Optimizing and applying your privacy edits…' : 'Sending your image securely…'}</span>
            </div>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="redactor-retention">Images are visible to authorized administrators and deleted after 30 days. Only upload images you are allowed to share; sensitive details may remain visible unless you cover them.</p>
    </section>
  )
}
