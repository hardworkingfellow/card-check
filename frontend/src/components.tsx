import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileImage,
  FileText,
  Fingerprint,
  ImagePlus,
  Info,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type { CardBrand } from './cards'
import { cardBrands } from './cards'

const currentYear = new Date().getFullYear()

export function BrandMark({ brand, large = false }: { brand: CardBrand; large?: boolean }) {
  return (
    <span
      className={`brand-mark${large ? ' brand-mark-large' : ''}`}
      style={{ color: brand.accent }}
      aria-hidden="true"
    >
      {brand.icon ? (
        <svg viewBox="0 0 24 24" role="presentation">
          <path fill="currentColor" d={brand.icon.path} />
        </svg>
      ) : brand.shortName ? (
        <span className="xbox-mark">{brand.shortName}</span>
      ) : (
        <CreditCard size={large ? 30 : 24} strokeWidth={1.8} />
      )}
    </span>
  )
}

export function BrandLogo() {
  return (
    <Link to="/" className="brand-logo" aria-label="GiftCard Checker home">
      <span className="logo-symbol"><Check size={18} strokeWidth={3} /></span>
      <span>GiftCard<span className="logo-light"> Checker</span></span>
    </Link>
  )
}

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="site-header">
      <div className="container nav-shell">
        <BrandLogo />
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={`main-nav${menuOpen ? ' main-nav-open' : ''}`} aria-label="Main navigation">
          <NavLink to="/" onClick={closeMenu}>Home</NavLink>
          <Link to="/check" onClick={closeMenu}>Check Gift Card</Link>
          <Link to="/#supported" onClick={closeMenu}>Supported Cards</Link>
          <Link to="/#how-it-works" onClick={closeMenu}>How It Works</Link>
          <Link to="/#faq" onClick={closeMenu}>FAQ</Link>
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <BrandLogo />
            <p>Public card-image submissions for administrator review.</p>
          </div>
          <div className="footer-links">
            <div><strong>Explore</strong><Link to="/about">About us</Link><Link to="/#supported">Supported gift cards</Link><Link to="/#how-it-works">How it works</Link><Link to="/admin">Admin dashboard</Link></div>
            <div><strong>Help</strong><Link to="/#faq">FAQ</Link><Link to="/contact">Contact</Link></div>
            <div><strong>Legal</strong><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of service</Link></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {currentYear} GiftCard Checker. All rights reserved.</span>
          <span><ShieldCheck size={14} /> Image review only. Never redemption.</span>
        </div>
      </div>
    </footer>
  )
}

export function GiftCardGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`gift-grid${compact ? ' gift-grid-compact' : ''}`}>
      {cardBrands.map((brand, index) => (
        <motion.article
          key={brand.id}
          className={`gift-card${index === 0 && !compact ? ' gift-card-featured' : ''}`}
          whileHover={{ y: -5 }}
          transition={{ duration: 0.18 }}
        >
          <div className="gift-card-top">
            <BrandMark brand={brand} large />
            {index === 0 && !compact && <span className="popular-tag">POPULAR</span>}
          </div>
          <h3>{brand.name}</h3>
          <p>{brand.description}</p>
          <Link className="text-link" to={`/check?brand=${brand.id}`}>
            Submit a card <ArrowRight size={15} />
          </Link>
        </motion.article>
      ))}
    </div>
  )
}

export function ImageUploader({
  file,
  onChange,
  onRemove,
  onError,
  error,
}: {
  file: File | null
  onChange: (file: File | null) => void
  onRemove: () => void
  onError: (message: string) => void
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [preview, setPreview] = useState('')

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const acceptFile = (selected: File | undefined) => {
    if (!selected) return
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(selected.type)) {
      onError('Choose a JPG, JPEG, PNG, or WEBP image.')
      return
    }
    if (selected.size > 10 * 1024 * 1024) {
      onError('Image must be 10 MB or smaller.')
      return
    }
    onError('')
    setPreview(URL.createObjectURL(selected))
    onChange(selected)
    setProgress(0)
    window.setTimeout(() => setProgress(55), 100)
    window.setTimeout(() => setProgress(100), 430)
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFile(event.target.files?.[0])
    event.target.value = ''
  }
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    acceptFile(event.dataTransfer.files[0])
  }
  const remove = () => {
    setProgress(0)
    onError('')
    setPreview('')
    onRemove()
  }

  return (
    <div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={onInputChange}
        aria-label="Choose a gift card image"
      />
      {file ? (
        <div className="upload-preview">
          <img src={preview} alt="Preview of selected gift card" />
          <div className="upload-file-info">
            <div className="file-name"><FileImage size={17} /> <span>{file.name}</span></div>
            <span className="file-size">{(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to check</span>
            <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
            <div className="preview-actions">
              <button type="button" className="subtle-button" onClick={() => inputRef.current?.click()}>Replace image</button>
              <button type="button" className="remove-button" onClick={remove}>Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`upload-dropzone${dragging ? ' is-dragging' : ''}${error ? ' has-error' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
          role="button"
          tabIndex={0}
          aria-label="Upload a gift card picture"
        >
          <div className="upload-icon"><ImagePlus size={24} /></div>
          <strong>Drop your gift card image here</strong>
          <span>or <span className="browse-link">browse files</span> from your device</span>
          <span className="upload-types">JPG, JPEG, PNG or WEBP · Up to 10 MB</span>
        </div>
      )}
      {error && <p className="inline-error"><CircleHelp size={14} /> {error}</p>}
      <p className="upload-instructions">Upload a clear picture of your gift card. Ensure the relevant card details are visible.</p>
      <p className="upload-privacy"><LockKeyhole size={13} /> Preview stays in this browser.</p>
    </div>
  )
}

export function ManualCodeInput({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="manual-code-wrap">
      <label className="field-label" htmlFor="gift-code">Gift card code</label>
      <div className={`code-input-shell${error ? ' has-error' : ''}`}>
        <input
          id="gift-code"
          autoComplete="off"
          spellCheck={false}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter the code printed on your card"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'code-error' : undefined}
        />
        {value && <button type="button" aria-label="Clear gift card code" className="input-icon-button" onClick={() => onChange('')}><X size={17} /></button>}
        <button type="button" className="show-code-button" onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
      </div>
      {error && <p className="inline-error" id="code-error">{error}</p>}
      <p className="field-helper"><LockKeyhole size={13} /> Your code is not sent or stored.</p>
    </div>
  )
}

export function VerificationNotice() {
  return (
    <div className="notice-stack">
      <div className="intact-notice">
        <span className="notice-icon"><Fingerprint size={21} /></span>
        <div>
          <strong>YOUR GIFT CARD REMAINS INTACT</strong>
          <p>Checking your gift card through an authorized verification service does not redeem it or deduct funds. Your available balance remains on the card.</p>
        </div>
      </div>
      <div className="receipt-notice"><Info size={17} /><p><strong>Receipt required? No.</strong> For supported checks, only your gift card picture or gift card code is needed. Do not upload purchase receipts.</p></div>
    </div>
  )
}

export function HowItWorks() {
  const steps = [
    { number: '01', icon: <CreditCard />, title: 'Choose a category', copy: 'No account or sign-in is required to submit a card.' },
    { number: '02', icon: <FileImage />, title: 'Upload an image', copy: 'Choose a browser-supported image and optionally cover sensitive details.' },
    { number: '03', icon: <CheckCircle2 />, title: 'Submit for review', copy: 'An administrator can review the image; no issuer is connected.' },
  ]
  return (
    <div className="steps-grid">
      {steps.map((step, index) => (
        <motion.div key={step.number} className="step-card" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.08 }}>
          <div className="step-top"><span>{step.number}</span><div className="step-icon">{step.icon}</div></div>
          <h3>{step.title}</h3><p>{step.copy}</p>
        </motion.div>
      ))}
    </div>
  )
}

const faqItems = [
  { q: 'Does checking my gift card redeem it?', a: 'No. This service does not redeem cards or change their value. It is not connected to an issuer and cannot verify card balances.' },
  { q: 'Will money be deducted from my gift card?', a: 'No. The backend is not connected to an issuer and does not redeem, spend, transfer, or deduct funds.' },
  { q: 'Should I cover sensitive details?', a: 'Covering details is optional. You can draw black boxes over card numbers, PINs, barcodes, and QR codes; if left uncovered, those details may be visible to administrators.' },
  { q: 'Can I upload a gift card picture?', a: 'Yes. Choose an image your browser can open; it is converted to JPEG before upload. You can optionally cover details in the preview.' },
  { q: 'Can I enter the code manually?', a: 'No. Gift-card numbers and PINs are not accepted as text, but they may be visible in an image you submit.' },
  { q: 'Which gift cards are supported?', a: 'The submission form lists Apple, Xbox, Razer Gold, Visa, and Other categories. No issuer integration is active, so none can be verified.' },
  { q: 'Why does the result say unable to verify?', a: 'No authorized issuer is connected. Administrators can review submissions but cannot confirm validity or balance.' },
  { q: 'How long are images retained?', a: 'Images are stored privately and automatically deleted after 30 days. Administrators can delete them earlier.' },
  { q: 'Is my gift card information stored?', a: 'Submitted images and their category/status metadata are stored by the backend for up to 30 days. Any details visible in an image may be seen by administrators.' },
]

export function FAQAccordion() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="faq-list">
      {faqItems.map((item, index) => (
        <div className={`faq-item${open === index ? ' faq-open' : ''}`} key={item.q}>
          <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
            <span>{item.q}</span><ChevronDown size={18} />
          </button>
          <AnimatePresence initial={false}>
            {open === index && <motion.div className="faq-answer" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p>{item.a}</p></motion.div>}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function TrustStrip() {
  const items = [
    { icon: <ShieldCheck />, text: 'No redemption' },
    { icon: <LockKeyhole />, text: 'No account required' },
    { icon: <FileText />, text: 'Optional image masking' },
    { icon: <CheckCircle2 />, text: 'Clear review status' },
  ]
  return <div className="trust-strip">{items.map((item) => <div key={item.text}><span>{item.icon}</span><span>{item.text}</span></div>)}</div>
}

export function SectionHeading({ eyebrow, title, copy, light = false }: { eyebrow: string; title: string; copy?: string; light?: boolean }) {
  return <div className={`section-heading${light ? ' section-heading-light' : ''}`}><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>
}

export function Section({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return <section id={id} className={`page-section ${className}`}>{children}</section>
}

export function HeroIllustration() {
  return (
    <div className="hero-visual" aria-label="Illustration of supported gift cards">
      <div className="visual-glow" />
      <div className="floating-chip chip-one"><ShieldCheck size={16} /> Verification only</div>
      <div className="floating-chip chip-two"><CheckCircle2 size={16} /> No redemption</div>
      <div className="gift-stack">
        <div className="visual-card visa-visual"><BrandMark brand={cardBrands[3]} /><span className="card-spark">✦</span><small>GIFT CARD</small></div>
        <div className="visual-card xbox-visual"><BrandMark brand={cardBrands[1]} /><small>GIFT CARD</small></div>
        <div className="visual-card apple-visual"><BrandMark brand={cardBrands[0]} /><b>Apple Gift Card</b><small>ONE CARD. ALL THINGS APPLE.</small></div>
        <div className="visual-card razer-visual"><BrandMark brand={cardBrands[2]} /><strong>GOLD</strong><small>GAME ON</small></div>
      </div>
      <div className="visual-note"><span className="note-icon"><Sparkles size={16} /></span><span><b>Every dollar stays yours.</b><small>Check without spending a cent.</small></span></div>
    </div>
  )
}

export function VerificationLoader() {
  return <div className="verification-loader" role="status"><span className="loader-ring" /><span>Preparing your result…</span></div>
}

export function BrandSelector({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="brand-selector" role="group" aria-label="Select gift card brand">
      {cardBrands.map((brand) => (
        <button type="button" key={brand.id} className={`brand-option${selected === brand.id ? ' brand-option-selected' : ''}`} onClick={() => onSelect(brand.id)}>
          <BrandMark brand={brand} />
          <span>{brand.name}</span>
          {selected === brand.id && <CheckCircle2 size={15} className="option-check" />}
        </button>
      ))}
    </div>
  )
}

export function ImageErrorMessage({ message }: { message?: string }) {
  if (!message) return null
  return <p className="inline-error image-error"><CircleHelp size={14} /> {message}</p>
}

export function DecorativeArrow() {
  return <ArrowDown size={18} className="decorative-arrow" />
}
