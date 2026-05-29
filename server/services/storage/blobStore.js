/**
 * Blob storage facade.
 *
 * Two adapters with the same interface:
 *
 *   - AzureBlobAdapter: backed by @azure/storage-blob using
 *     DefaultAzureCredential (managed identity in prod, `az login`
 *     creds locally). Enabled by setting AZURE_STORAGE_ACCOUNT (and
 *     optionally AZURE_STORAGE_CONTAINER, default 'audio-intros').
 *
 *   - LocalDiskBlobAdapter: writes to <repo>/runtime/audio/<path> and
 *     returns a relative URL like '/audio/<path>'. Used when the env
 *     var isn't set — local dev with no Azure access still works.
 *
 * Interface:
 *
 *   objectExists(path) -> boolean
 *   uploadBuffer(path, buffer, { contentType, cacheControl }) -> publicUrl
 *   getPublicUrl(path) -> publicUrl
 *
 * Path conventions are the caller's responsibility — see
 * services/intros/introCacheKey.js for the intro-audio scheme.
 */

const fs = require('node:fs')
const path = require('node:path')
const logger = require('../logger')

const ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'audio-intros'

class LocalDiskBlobAdapter {
  constructor() {
    // Mirror the existing TTS output layout so `/audio/<basename>` keeps
    // working via the existing express.static(runtimeDir) mount.
    this.runtimeRoot = path.resolve(__dirname, '..', '..', '..', 'runtime', 'audio')
    this.urlPrefix = '/audio'
  }

  _full(relPath) {
    // Flatten any '/' in the cache key into a deterministic disk name
    // so multi-segment cache paths like
    //   'intros/abc123/station:rock/70s-legends/3.wav'
    // don't escape the runtime dir and don't try to mkdir 4 levels deep.
    const safe = String(relPath).replace(/^\/+/, '').replace(/[\\/:]/g, '_')
    return path.join(this.runtimeRoot, safe)
  }

  _url(relPath) {
    const safe = String(relPath).replace(/^\/+/, '').replace(/[\\/:]/g, '_')
    return `${this.urlPrefix}/${safe}`
  }

  async objectExists(relPath) {
    try {
      await fs.promises.access(this._full(relPath), fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  async uploadBuffer(relPath, buffer /* , opts */) {
    const full = this._full(relPath)
    await fs.promises.mkdir(path.dirname(full), { recursive: true })
    await fs.promises.writeFile(full, buffer)
    return this._url(relPath)
  }

  getPublicUrl(relPath) {
    return this._url(relPath)
  }
}

class AzureBlobAdapter {
  constructor(account, container) {
    const { BlobServiceClient } = require('@azure/storage-blob')
    const { DefaultAzureCredential } = require('@azure/identity')
    this.account = account
    this.container = container
    this.serviceClient = new BlobServiceClient(
      `https://${account}.blob.core.windows.net`,
      new DefaultAzureCredential()
    )
    this.containerClient = this.serviceClient.getContainerClient(container)
  }

  _normalize(relPath) {
    return String(relPath).replace(/^\/+/, '')
  }

  async objectExists(relPath) {
    const blob = this.containerClient.getBlobClient(this._normalize(relPath))
    try {
      return await blob.exists()
    } catch (err) {
      logger.warn({ err: err?.message, blob: relPath }, 'blob.exists failed')
      return false
    }
  }

  async uploadBuffer(relPath, buffer, opts = {}) {
    const blob = this.containerClient.getBlockBlobClient(this._normalize(relPath))
    await blob.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: opts.contentType || 'application/octet-stream',
        blobCacheControl:
          opts.cacheControl || 'public, max-age=31536000, immutable',
      },
    })
    return this.getPublicUrl(relPath)
  }

  getPublicUrl(relPath) {
    return `https://${this.account}.blob.core.windows.net/${this.container}/${this._normalize(relPath)}`
  }
}

let adapter
function getAdapter() {
  if (adapter) return adapter
  if (ACCOUNT) {
    try {
      adapter = new AzureBlobAdapter(ACCOUNT, CONTAINER)
      logger.info({ account: ACCOUNT, container: CONTAINER }, 'blob.adapter.azure')
    } catch (err) {
      logger.error({ err: err?.message }, 'blob.adapter.azure_failed — falling back to local disk')
      adapter = new LocalDiskBlobAdapter()
    }
  } else {
    adapter = new LocalDiskBlobAdapter()
    logger.info('blob.adapter.local (AZURE_STORAGE_ACCOUNT not set)')
  }
  return adapter
}

module.exports = {
  objectExists: (p) => getAdapter().objectExists(p),
  uploadBuffer: (p, buf, opts) => getAdapter().uploadBuffer(p, buf, opts),
  getPublicUrl: (p) => getAdapter().getPublicUrl(p),
  // Exposed for tests
  LocalDiskBlobAdapter,
  AzureBlobAdapter,
}
