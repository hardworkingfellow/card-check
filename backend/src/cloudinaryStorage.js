import { randomUUID } from 'node:crypto'
import { v2 as cloudinary } from 'cloudinary'

const maxImageBytes = 5 * 1024 * 1024
const publicIdPattern = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/

export function createCloudinaryStorage({ cloudName, apiKey, apiSecret, folder = 'giftcard-submissions' }) {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.')
  }
  if (!publicIdPattern.test(folder)) {
    throw new Error('CLOUDINARY_FOLDER must contain only letters, numbers, underscores, hyphens, and slashes.')
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  })

  return {
    async upload(buffer) {
      const requestedPublicId = randomUUID()
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          resource_type: 'image',
          type: 'authenticated',
          public_id: requestedPublicId,
          overwrite: false,
          unique_filename: false,
        }, (error, uploaded) => {
          if (error) {
            reject(error)
            return
          }
          resolve(uploaded)
        })
        stream.end(buffer)
      })

      if (!result?.public_id || !publicIdPattern.test(result.public_id)) {
        throw new Error('Cloudinary returned an invalid image reference.')
      }
      return { publicId: result.public_id }
    },

    async get(publicId) {
      if (typeof publicId !== 'string' || !publicIdPattern.test(publicId)) {
        throw new Error('Stored Cloudinary image reference is invalid.')
      }

      const url = cloudinary.url(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        sign_url: true,
        secure: true,
        format: 'jpg',
      })
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Cloudinary image retrieval failed with status ${response.status}.`)
      }

      const contentLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
        throw new Error('Stored Cloudinary image exceeds the allowed size.')
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > maxImageBytes || response.headers.get('content-type') !== 'image/jpeg') {
        throw new Error('Cloudinary returned an invalid card image.')
      }
      return { buffer, mimeType: 'image/jpeg' }
    },

    async delete(publicId) {
      if (typeof publicId !== 'string' || !publicIdPattern.test(publicId)) {
        throw new Error('Stored Cloudinary image reference is invalid.')
      }
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        invalidate: true,
      })
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error(`Cloudinary image deletion failed: ${result.result ?? 'unknown result'}.`)
      }
    },
  }
}
