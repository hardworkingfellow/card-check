export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
  }
}

export function apiUpload<T>(path: string, body: FormData, onProgress: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', path)
    request.withCredentials = true
    request.setRequestHeader('x-app-request', '1')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
    }
    request.onerror = () => reject(new Error('Could not reach the backend. Start it with `npm run dev` in the backend folder.'))
    request.onload = () => {
      let result: unknown
      try { result = JSON.parse(request.responseText) } catch {
        reject(new Error(request.status >= 500 ? 'The backend is unavailable. Check that MongoDB and the backend server are running.' : 'The backend returned an invalid response.'))
        return
      }
      if (request.status < 200 || request.status >= 300) {
        const message = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string' ? result.error : `The backend request failed with status ${request.status}.`
        reject(new ApiRequestError(message, request.status))
        return
      }
      onProgress(100)
      resolve(result as T)
    }
    request.send(body)
  })
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(options.headers)
    if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method ?? 'GET').toUpperCase())) {
      headers.set('x-app-request', '1')
    }
    response = await fetch(path, { ...options, headers, credentials: 'same-origin' })
  } catch {
    throw new Error('Could not reach the backend. Start it with `npm run dev` in the backend folder.')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    if (!response.ok) {
      const message = response.status >= 500
        ? 'The backend is unavailable. Check that MongoDB and the backend server are running.'
        : `The backend request failed with status ${response.status}.`
      throw new ApiRequestError(message, response.status)
    }
    throw new Error('The backend returned an invalid response.')
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `The backend request failed with status ${response.status}.`
    throw new ApiRequestError(message, response.status)
  }

  return body as T
}
