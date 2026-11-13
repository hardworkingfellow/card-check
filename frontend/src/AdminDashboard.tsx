import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowDownUp,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  FileImage,
  Filter,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from './apiClient'
import { useAuth } from './useAuth'
import { getBrand } from './cards'
import { BrandLogo, BrandMark } from './components'

type ReviewStatus = 'pending_review' | 'valid' | 'invalid' | 'unable_to_verify'
type Submission = {
  id: string
  brandId: string
  submittedAt: string
  status: ReviewStatus
  submittedBy: string
  imageUrl: string
}

const statusOptions: ReviewStatus[] = ['pending_review', 'valid', 'invalid', 'unable_to_verify']
const statusLabel: Record<ReviewStatus, string> = {
  pending_review: 'Pending review',
  valid: 'Reviewed',
  invalid: 'Needs attention',
  unable_to_verify: 'Unable to verify',
}
const statusClass: Record<ReviewStatus, string> = {
  pending_review: 'admin-status-pending',
  valid: 'admin-status-valid',
  invalid: 'admin-status-invalid',
  unable_to_verify: 'admin-status-unable',
}

export default function AdminDashboard() {
  const { user, signOut } = useAuth()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | ReviewStatus>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest<{ submissions: Submission[] }>('/api/admin/submissions')
      .then((result) => {
        if (active) setSubmissions(result.submissions)
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Could not load submissions.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return submissions.filter((submission) => {
      const brand = getBrand(submission.brandId)
      const matchesQuery = !query || [submission.id, brand.name, submission.submittedBy].some((value) => value.toLowerCase().includes(query))
      return matchesQuery && (filter === 'all' || submission.status === filter)
    })
  }, [filter, search, submissions])

  const selectedSubmission = submissions.find((item) => item.id === selectedId)
  const countForStatus = (status: ReviewStatus) => submissions.filter((item) => item.status === status).length

  const updateStatus = async (id: string, status: ReviewStatus) => {
    setError('')
    try {
      await apiRequest(`/api/admin/submissions/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setSubmissions((items) => items.map((item) => item.id === id ? { ...item, status } : item))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update submission status.')
    }
  }

  const deleteSubmission = async (submission: Submission) => {
    if (!window.confirm('Delete this submission and its image permanently?')) return
    setError('')
    try {
      await apiRequest(`/api/admin/submissions/${submission.id}`, { method: 'DELETE' })
      setSubmissions((items) => items.filter((item) => item.id !== submission.id))
      setSelectedId(null)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete the submission.')
    }
  }

  const logout = async () => {
    try {
      await signOut()
      window.location.assign('/')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not sign out.')
    }
  }

  return (
    <main className="admin-page">
      <div className="admin-container">
        <header className="admin-topbar">
          <BrandLogo />
          <div className="admin-topbar-right">
            <span className="admin-role-chip"><i /> ADMIN · {user?.email}</span>
            <button type="button" className="admin-back-link admin-logout" onClick={() => void logout()}>Sign out</button>
            <Link to="/" className="admin-back-link"><ArrowLeft size={15} /> Public site</Link>
          </div>
        </header>

        <section className="admin-heading">
          <div><span className="admin-kicker">OPERATIONS</span><h1>Card submissions</h1><p>Review public visitor uploads and update their status.</p></div>
          <span className="admin-readonly"><ShieldCheck size={14} /> No issuer integration connected</span>
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}

        <section className="admin-stat-grid" aria-label="Submission summary">
          <article className="admin-stat-card"><span>Total submissions</span><strong>{submissions.length}</strong><small><FileImage size={13} /> Private uploads</small></article>
          <article className="admin-stat-card"><span>Pending review</span><strong>{countForStatus('pending_review')}</strong><small><Clock3 size={13} /> Awaiting admin action</small></article>
          <article className="admin-stat-card"><span>Reviewed</span><strong>{countForStatus('valid')}</strong><small><ShieldCheck size={13} /> Admin status only</small></article>
          <article className="admin-stat-card"><span>Needs attention</span><strong>{countForStatus('invalid') + countForStatus('unable_to_verify')}</strong><small><ShieldAlert size={13} /> No issuer result</small></article>
        </section>

        <section className="admin-list-panel">
          <div className="admin-list-heading">
            <div><h2>Recent submissions</h2><p>Images are privately served and automatically removed after 30 days.</p></div>
            <span className="admin-record-count">{filteredSubmissions.length} records</span>
          </div>
          <div className="admin-toolbar">
            <label className="admin-search"><Search size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID, card, or status" aria-label="Search submissions" /></label>
            <label className="admin-filter"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | ReviewStatus)} aria-label="Filter by status"><option value="all">All statuses</option>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select><ChevronDown size={14} /></label>
            <span className="admin-sort-label"><ArrowDownUp size={14} /> Newest first</span>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>SUBMISSION</th><th>CARD IMAGE</th><th>CARD CATEGORY</th><th>SUBMITTED</th><th>STATUS</th><th>ACTION</th></tr></thead>
              <tbody>
                {filteredSubmissions.map((submission) => {
                  const brand = getBrand(submission.brandId)
                  return (
                    <tr key={submission.id}>
                      <td><strong className="admin-id">{submission.id.slice(-8).toUpperCase()}</strong><span className="admin-cell-sub">{submission.submittedBy}</span></td>
                      <td><button type="button" className="admin-thumb-button admin-real-thumb" onClick={() => setSelectedId(submission.id)} aria-label={`View card image for ${submission.id}`}><img src={submission.imageUrl} alt="Submitted card image" /></button></td>
                      <td><span className="admin-brand-cell"><BrandMark brand={brand} /><span><strong>{brand.name}</strong></span></span></td>
                      <td className="admin-date-cell">{new Date(submission.submittedAt).toLocaleString()}</td>
                      <td><label className="visually-hidden" htmlFor={`status-${submission.id}`}>Set status for {submission.id}</label><select id={`status-${submission.id}`} className={`admin-select ${statusClass[submission.status]}`} value={submission.status} onChange={(event) => void updateStatus(submission.id, event.target.value as ReviewStatus)}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></td>
                      <td><button type="button" className="admin-view-button" onClick={() => setSelectedId(submission.id)}><Eye size={14} /> View</button></td>
                    </tr>
                  )
                })}
                {!loading && filteredSubmissions.length === 0 && <tr><td className="admin-empty" colSpan={6}><Search size={18} /><strong>No submissions found</strong><span>Try a different search or status filter.</span></td></tr>}
                {loading && <tr><td className="admin-empty" colSpan={6}>Loading submissions…</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="admin-panel-footer"><span>Showing public visitor submissions</span><span>Images expire after 30 days</span></div>
        </section>
      </div>

      {selectedSubmission && (
        <div className="admin-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null) }}>
          <aside className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="submission-title">
            <div className="admin-drawer-head"><div><span className="admin-kicker">PUBLIC SUBMISSION</span><h2 id="submission-title">{selectedSubmission.id.slice(-8).toUpperCase()}</h2></div><button type="button" className="admin-icon-button" aria-label="Close submission details" onClick={() => setSelectedId(null)}><X size={19} /></button></div>
            <img className="admin-full-image" src={selectedSubmission.imageUrl} alt="Submitted card image" />
            <div className="admin-record-brand"><BrandMark brand={getBrand(selectedSubmission.brandId)} /><div><span className="admin-kicker">CARD CATEGORY</span><strong>{getBrand(selectedSubmission.brandId).name}</strong></div></div>
            <div className="admin-detail-list"><div><span>Submitted by</span><strong>{selectedSubmission.submittedBy}</strong></div><div><span>Submitted</span><strong>{new Date(selectedSubmission.submittedAt).toLocaleString()}</strong></div><div><span>Issuer balance</span><strong>Not available</strong></div></div>
            <label className="admin-kicker admin-status-label" htmlFor="detail-status">REVIEW STATUS</label>
            <select id="detail-status" className={`admin-select admin-select-wide ${statusClass[selectedSubmission.status]}`} value={selectedSubmission.status} onChange={(event) => void updateStatus(selectedSubmission.id, event.target.value as ReviewStatus)}>{statusOptions.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select>
            <p className="admin-drawer-note"><ShieldCheck size={15} /> Review status is not a gift-card verification result.</p>
            <button type="button" className="admin-delete-button" onClick={() => void deleteSubmission(selectedSubmission)}><Trash2 size={16} /> Delete submission and image</button>
            <button type="button" className="admin-done-button" onClick={() => setSelectedId(null)}><Check size={16} /> Done</button>
          </aside>
        </div>
      )}
    </main>
  )
}
