import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ObjectId } from 'mongodb'
import { cleanupExpiredSubmissions, createServer, initializeDatabase } from '../src/server.js'

function sameValue(left, right) {
  if (left instanceof ObjectId) return left.equals(right)
  return left === right
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key]
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !(expected instanceof ObjectId)) {
      return Object.entries(expected).every(([operator, value]) => {
        if (operator === '$gt') return actual > value
        if (operator === '$lte') return actual <= value
        return false
      })
    }
    return sameValue(actual, expected)
  })
}

class MemoryCollection {
  documents = []

  async createIndex() {}

  async insertOne(document) {
    if (document.email && this.documents.some((item) => item.email === document.email)) {
      throw Object.assign(new Error('Duplicate key'), { code: 11000 })
    }
    const inserted = { ...document, _id: document._id ?? new ObjectId() }
    this.documents.push(inserted)
    return { insertedId: inserted._id }
  }

  async findOne(filter) {
    return this.documents.find((document) => matches(document, filter)) ?? null
  }

  async updateOne(filter, update, options = {}) {
    let document = this.documents.find((item) => matches(item, filter))
    if (!document && options.upsert) {
      document = { ...update.$setOnInsert, _id: new ObjectId() }
      this.documents.push(document)
    }
    if (!document) return { matchedCount: 0 }
    Object.assign(document, update.$set)
    return { matchedCount: 1 }
  }

  async deleteOne(filter) {
    const index = this.documents.findIndex((document) => matches(document, filter))
    if (index < 0) return { deletedCount: 0 }
    this.documents.splice(index, 1)
    return { deletedCount: 1 }
  }

  async deleteMany(filter) {
    const remaining = this.documents.filter((document) => !matches(document, filter))
    const deletedCount = this.documents.length - remaining.length
    this.documents = remaining
    return { deletedCount }
  }

  find(filter, options = {}) {
    let results = this.documents.filter((document) => matches(document, filter))
    const projection = options.projection
    if (projection) {
      results = results.map((document) => {
        const copy = { ...document }
        for (const [field, excluded] of Object.entries(projection)) {
          if (excluded === 0) delete copy[field]
        }
        return copy
      })
    }
    const cursor = {
      sort: (order) => {
        const [field, direction] = Object.entries(order)[0]
        results = [...results].sort((a, b) => direction * (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0))
        return cursor
      },
      limit: (size) => {
        results = results.slice(0, size)
        return cursor
      },
      toArray: async () => results,
    }
    return cursor
  }
}

class MemoryDatabase {
  collections = new Map()

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new MemoryCollection())
    return this.collections.get(name)
  }
}

const db = new MemoryDatabase()
const tinyJpeg = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
])
let server
let baseUrl
let uploadDir
let imageCounter = 0
const storedImages = new Map()
const imageStorage = {
  async upload(buffer) {
    const publicId = `test/image-${++imageCounter}`
    storedImages.set(publicId, Buffer.from(buffer))
    return { publicId }
  },
  async get(publicId) {
    const buffer = storedImages.get(publicId)
    if (!buffer) throw new Error('Stored image not found.')
    return { buffer, mimeType: 'image/jpeg' }
  },
  async delete(publicId) {
    storedImages.delete(publicId)
  },
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-request': '1' },
    body: JSON.stringify({ email, password }),
  })
  return { response, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] }
}

before(async () => {
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'giftcard-api-'))
  await initializeDatabase(db, {
    adminEmail: 'admin@example.test',
    adminPassword: 'a-long-admin-password',
    retentionDays: 30,
  })
  server = createServer({
    db,
    imageStorage,
    uploadDir,
    adminEmail: 'admin@example.test',
    secureCookies: false,
    authRequestLimit: 100,
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  await rm(uploadDir, { recursive: true, force: true })
})

test('health endpoint reports readiness without caching', async () => {
  const response = await fetch(`${baseUrl}/api/health`)

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('brand endpoint matches the frontend card categories', async () => {
  const response = await fetch(`${baseUrl}/api/cards/brands`)
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body.brands.map(({ id }) => id), ['apple', 'xbox', 'razer', 'visa', 'other'])
})

test('verification accepts brand IDs only and never confirms a card', async () => {
  const response = await fetch(`${baseUrl}/api/cards/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-request': '1' },
    body: JSON.stringify({ brandId: 'apple' }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'unable_to_verify',
    balance: null,
    currency: null,
    valid: null,
    timestamp: null,
    referenceId: null,
    provider: 'No issuer connected',
  })
})

test('only the configured administrator can sign in and receives an HttpOnly session', async () => {
  const success = await login('ADMIN@example.test', 'a-long-admin-password')
  const cookie = success.response.headers.get('set-cookie')?.split(';', 1)[0]
  const result = await success.response.json()
  const wrongPassword = await login('admin@example.test', 'incorrect-password')
  const wrongEmail = await login('other@example.test', 'a-long-admin-password')

  assert.equal(success.response.status, 200)
  assert.equal(result.user.email, 'admin@example.test')
  assert.equal(result.user.role, 'admin')
  assert.equal('passwordHash' in result.user, false)
  assert.match(success.response.headers.get('set-cookie'), /HttpOnly/)
  assert.match(success.response.headers.get('set-cookie'), /SameSite=Strict/)
  assert.equal(wrongPassword.response.status, 401)
  assert.equal(wrongEmail.response.status, 401)

  const session = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { cookie } })
  assert.equal((await session.json()).user.id, result.user.id)
})

test('legacy user authentication routes and public registration are unavailable', async () => {
  const register = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-request': '1' },
    body: JSON.stringify({ name: 'Visitor', email: 'visitor@example.test', password: 'a-long-password' }),
  })
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-request': '1' },
    body: JSON.stringify({ email: 'admin@example.test', password: 'a-long-admin-password' }),
  })

  assert.equal(register.status, 404)
  assert.equal(login.status, 404)
})

test('sign-out revokes the administrator session', async () => {
  const admin = await login('admin@example.test', 'a-long-admin-password')
  const logout = await fetch(`${baseUrl}/api/admin/auth/logout`, {
    method: 'POST',
    headers: { cookie: admin.cookie, 'x-app-request': '1' },
  })
  const session = await fetch(`${baseUrl}/api/admin/auth/me`, { headers: { cookie: admin.cookie } })

  assert.equal(logout.status, 200)
  assert.equal(session.status, 401)
})

test('admin review APIs require administrator authentication', async () => {
  const admin = await fetch(`${baseUrl}/api/admin/submissions`)
  assert.equal(admin.status, 401)
})

test('public visitors can submit images and only admins can view or manage them', async () => {
  const form = new FormData()
  form.append('brandId', 'apple')
  form.append('image', new Blob([tinyJpeg], { type: 'image/jpeg' }), 'redacted.jpg')
  const submitted = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'x-app-request': '1' },
    body: form,
  })
  const { submission } = await submitted.json()

  assert.equal(submitted.status, 201)
  assert.equal(submission.brandId, 'apple')
  assert.equal(submission.status, 'pending_review')

  assert.equal(submission.submittedBy, undefined)
  const forbiddenImage = await fetch(`${baseUrl}${submission.imageUrl}`)
  assert.equal(forbiddenImage.status, 401)

  const admin = await login('admin@example.test', 'a-long-admin-password')
  const records = await fetch(`${baseUrl}/api/admin/submissions`, { headers: { cookie: admin.cookie } })
  const list = await records.json()
  assert.equal(records.status, 200)
  assert.equal(list.submissions.length, 1)
  assert.equal(list.submissions[0].submittedBy, 'Public visitor')
  const storedPublicId = db.collection('submissions').documents[0].cloudinaryPublicId
  assert.equal(storedImages.has(storedPublicId), true)

  const image = await fetch(`${baseUrl}${submission.imageUrl}`, { headers: { cookie: admin.cookie } })
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), tinyJpeg)
  assert.equal(storedImages.has(db.collection('submissions').documents[0].cloudinaryPublicId), true)

  const update = await fetch(`${baseUrl}/api/admin/submissions/${submission.id}/status`, {
    method: 'PATCH',
    headers: { cookie: admin.cookie, 'content-type': 'application/json', 'x-app-request': '1' },
    body: JSON.stringify({ status: 'valid' }),
  })
  assert.equal(update.status, 200)

  const remove = await fetch(`${baseUrl}/api/admin/submissions/${submission.id}`, {
    method: 'DELETE',
    headers: { cookie: admin.cookie, 'x-app-request': '1' },
  })
  assert.equal(remove.status, 200)
  assert.equal(storedImages.has(storedPublicId), false)
  const missingImage = await fetch(`${baseUrl}${submission.imageUrl}`, { headers: { cookie: admin.cookie } })
  assert.equal(missingImage.status, 404)
})

test('uploads reject unknown fields and unsupported image types', async () => {
  const form = new FormData()
  form.append('brandId', 'apple')
  form.append('code', 'not-accepted')
  form.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'card.txt')
  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'x-app-request': '1' },
    body: form,
  })
  assert.equal(response.status, 400)
})

test('uploads larger than 5 MB are rejected', async () => {
  const form = new FormData()
  form.append('brandId', 'apple')
  form.append('image', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }), 'large.jpg')
  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'x-app-request': '1' },
    body: form,
  })

  assert.equal(response.status, 413)
  assert.match((await response.json()).error, /5 MB/)
})

test('uploads reject malformed and excessively large JPEG dimensions', async () => {
  const oversizedJpeg = Buffer.from(tinyJpeg)
  oversizedJpeg.writeUInt16BE(6000, 7)
  oversizedJpeg.writeUInt16BE(4000, 9)
  const form = new FormData()
  form.append('brandId', 'apple')
  form.append('image', new Blob([oversizedJpeg], { type: 'image/jpeg' }), 'large.jpg')
  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'x-app-request': '1' },
    body: form,
  })

  assert.equal(response.status, 413)
  assert.match((await response.json()).error, /20 megapixels/)
})

test('expired submissions remove private image files and metadata', async () => {
  const imageName = '123e4567-e89b-12d3-a456-426614174000.bin'
  const submissionId = new ObjectId()
  await writeFile(path.join(uploadDir, imageName), 'private image')
  db.collection('submissions').documents.push({
    _id: submissionId,
    imageName,
    expiresAt: new Date(Date.now() - 1000),
  })

  assert.equal(await cleanupExpiredSubmissions(db, uploadDir, imageStorage), 1)
  assert.equal(await db.collection('submissions').findOne({ _id: submissionId }), null)
  await assert.rejects(readFile(path.join(uploadDir, imageName)), { code: 'ENOENT' })
})

test('expired Cloudinary submissions delete the remote image and metadata', async () => {
  const { publicId } = await imageStorage.upload(tinyJpeg)
  const submissionId = new ObjectId()
  db.collection('submissions').documents.push({
    _id: submissionId,
    cloudinaryPublicId: publicId,
    expiresAt: new Date(Date.now() - 1000),
  })

  assert.equal(storedImages.has(publicId), true)
  assert.equal(await cleanupExpiredSubmissions(db, uploadDir, imageStorage), 1)
  assert.equal(storedImages.has(publicId), false)
  assert.equal(await db.collection('submissions').findOne({ _id: submissionId }), null)
})

test('state-changing requests require the application request header', async () => {
  const response = await fetch(`${baseUrl}/api/submissions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })

  assert.equal(response.status, 403)
})

test('malformed JSON receives a client error instead of a server error', async () => {
  const response = await fetch(`${baseUrl}/api/cards/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-request': '1' },
    body: '{',
  })

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { error: 'Request body must be valid JSON.' })
})

test('known routes reject unsupported methods and unknown API routes return 404', async () => {
  const method = await fetch(`${baseUrl}/api/cards/brands`, { method: 'POST' })
  const unknown = await fetch(`${baseUrl}/api/missing`)
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'GET')
  assert.equal(unknown.status, 404)
})
