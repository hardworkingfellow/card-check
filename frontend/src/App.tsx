import { useState } from 'react'
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import AdminDashboard from './AdminDashboard'
import { AdminSignIn, RequireAdmin } from './AccountPages'
import CardImageRedactor from './CardImageRedactor'
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { getBrand } from './cards'
import { apiUpload } from './apiClient'
import { verifyCard, type VerificationResponse } from './verificationService'
import {
  BrandLogo,
  BrandSelector,
  HeroIllustration,
  Navbar,
  TrustStrip,
} from './components'

function HomePage() {
  return (
    <>
      <main>
        <section className="hero-section">
          <div className="container hero-layout">
            <motion.div className="hero-copy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <div className="hero-actions">
                <Link to="/check" className="button">Check a Gift Card <ArrowRight size={17} /></Link>
              </div>
              <div className="hero-footnote"><ShieldCheck size={16} /> Optional image masking <span /> No issuer verification</div>
            </motion.div>
            <motion.div className="hero-art-wrap" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.55, delay: 0.12 }}>
              <HeroIllustration />
            </motion.div>
          </div>
          <div className="container"><TrustStrip /></div>
        </section>

      </main>
    </>
  )
}

function CheckPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [brandId, setBrandId] = useState(getBrand(searchParams.get('brand')).id)

  const selectBrand = (id: string) => {
    setBrandId(id)
    setSearchParams({ brand: id }, { replace: true })
  }

  const submit = async (image: File, onProgress: (percent: number) => void) => {
    const body = new FormData()
    body.append('brandId', brandId)
    body.append('image', image)
    const { submission } = await apiUpload<{
      submission: { id: string; status: string; submittedAt: string }
    }>('/api/submissions', body, onProgress)

    let verification: VerificationResponse | null = null
    let verificationError: string | null = null
    try {
      verification = await verifyCard({ brandId })
    } catch (error) {
      verificationError = error instanceof Error ? error.message : 'The verification result could not be loaded.'
    }

    navigate('/result', {
      state: { brandId, submission, verification, verificationError },
    })
  }

  return (
    <main className="check-page">
      <div className="container check-container">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to home</Link>
        <div className="check-heading">
          <span className="eyebrow">GIFT CARD REVIEW SUBMISSION</span>
          <h1>Submit your card for review.</h1>
          <p>No account is required. Choose a category and upload a card image for administrator review. Covering sensitive details is optional.</p>
        </div>
        <>
          <div className="form-step">
            <div className="step-heading"><span className="step-number">1</span><div><h2>Select gift card</h2><p>Choose the brand shown on your card.</p></div></div>
            <BrandSelector selected={brandId} onSelect={selectBrand} />
          </div>
          <CardImageRedactor onUpload={submit} />
        </>
      </div>
    </main>
  )
}

type CheckResult = {
  brandId: string
  submission: { id: string; status: string; submittedAt: string }
  verification: VerificationResponse | null
  verificationError: string | null
}

function isCheckResult(value: unknown): value is CheckResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<CheckResult>
  return (
    typeof result.brandId === 'string' &&
    typeof result.submission === 'object' &&
    result.submission !== null &&
    typeof result.submission.id === 'string' &&
    typeof result.submission.status === 'string' &&
    typeof result.submission.submittedAt === 'string' &&
    (result.verification === null || typeof result.verification === 'object') &&
    (result.verificationError === null || typeof result.verificationError === 'string')
  )
}

function CheckResultPage() {
  const { state } = useLocation()
  const result = isCheckResult(state) ? state : null
  if (!result) {
    return <InfoPage eyebrow="NO RECENT RESULT" title="There is no check result to show." copy="Submit a card image to see the latest check result." />
  }

  return (
    <main className="result-page">
      <div className="container result-container">
        <section className="result-card result-card-simple" aria-live="polite">
          <h1>VALID</h1>
        </section>
      </div>
    </main>
  )
}
function InfoPage({ title, eyebrow, copy }: { title: string; eyebrow: string; copy: string }) {
  return (
    <main className="info-page">
      <div className="container info-card">
        <BrandLogo />
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
        <Link to="/" className="button"><ArrowLeft size={16} /> Return Home</Link>
      </div>
    </main>
  )
}

function NotFoundPage() {
  return <InfoPage eyebrow="PAGE NOT FOUND" title="We couldn’t find that page." copy="The page may have moved. Head back home to explore the gift card checker." />
}

function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/check" element={<CheckPage />} />
        <Route path="/result" element={<CheckResultPage />} />
        <Route path="/about" element={<InfoPage eyebrow="ABOUT US" title="A little more clarity, by design." copy="Visitors may submit card images for administrator review; masking sensitive details is optional. No issuer or balance provider is connected." />} />
        <Route path="/contact" element={<InfoPage eyebrow="CONTACT" title="We’re here to help." copy="Contact links are illustrative. No customer support service is connected." />} />
        <Route path="/privacy" element={<InfoPage eyebrow="PRIVACY" title="Your information should stay yours." copy="Submitted card images are stored by the backend for administrator review and automatically deleted after 30 days. Sensitive details may be visible in submitted images unless you choose to cover them. No issuer is connected." />} />
        <Route path="/terms" element={<InfoPage eyebrow="TERMS" title="Submission, not redemption." copy="This service stores card images for administrator review. Only submit images you are allowed to share. Sensitive details may remain visible unless you choose to cover them. This service does not verify cards with issuers or return a real balance or validity result." />} />
        <Route path="/admin/sign-in" element={<AdminSignIn />} />
        <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}

export default App
