export type VerificationStatus = 'valid' | 'invalid' | 'unable_to_verify' | 'verification_pending'

export type VerificationResponse = {
  status: VerificationStatus
  balance: number | null
  currency: string | null
  valid: boolean | null
  timestamp: string | null
  referenceId: string | null
  provider: string
}

export type VerificationRequest = {
  brandId: string
}

const verificationStatuses: VerificationStatus[] = [
  'valid',
  'invalid',
  'unable_to_verify',
  'verification_pending',
]

function isVerificationResponse(value: unknown): value is VerificationResponse {
  if (typeof value !== 'object' || value === null) return false
  const response = value as Record<string, unknown>
  return (
    typeof response.status === 'string' &&
    verificationStatuses.some((status) => status === response.status) &&
    (response.balance === null || (typeof response.balance === 'number' && Number.isFinite(response.balance))) &&
    (response.currency === null || typeof response.currency === 'string') &&
    (response.valid === null || typeof response.valid === 'boolean') &&
    (response.timestamp === null || typeof response.timestamp === 'string') &&
    (response.referenceId === null || typeof response.referenceId === 'string') &&
    typeof response.provider === 'string'
  )
}

export async function verifyCard(
  request: VerificationRequest,
): Promise<VerificationResponse> {
  if (!request.brandId) {
    throw new Error('Select a gift card before starting a verification.')
  }

  let response: Response
  try {
    response = await fetch('/api/cards/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-request': '1' },
      body: JSON.stringify({ brandId: request.brandId }),
    })
  } catch {
    throw new Error('Could not reach the backend. Start it with `npm run dev` in the backend folder.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('The backend returned an invalid response.')
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `The backend request failed with status ${response.status}.`
    throw new Error(message)
  }

  if (!isVerificationResponse(body)) {
    throw new Error('The backend returned an unexpected verification response.')
  }

  return body
}
