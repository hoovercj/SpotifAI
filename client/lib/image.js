// Tiny helpers for picking the right size out of the image objects
// returned by /api/content/dj-characters and /api/stations/covers.
//
// Server now returns:
//   image: { src, thumb?: { webp, jpg }, full?: { webp, jpg } } | null
// (or a plain string for older endpoints — handled below for compat).
//
// `getImageUrl(image, size)` returns a plain URL string for the
// requested size, falling back to the next-best available size, then
// to `src`. Returns `null` if nothing is renderable.
//
// `getImageSources(image, size)` returns `{ webp, jpg }` for use in a
// <picture> tag — `webp` may be null when no optimized variant exists.

const SIZE_ORDER = {
  thumb: ["thumb", "full"],
  full: ["full", "thumb"],
}

function getImageUrl(image, size = "thumb") {
  if (!image) return null
  // Compat: plain string still works.
  if (typeof image === "string") return image
  const order = SIZE_ORDER[size] || SIZE_ORDER.thumb
  for (const s of order) {
    const v = image[s]
    if (v?.webp) return v.webp
    if (v?.jpg) return v.jpg
  }
  return image.src || null
}

function getImageSources(image, size = "thumb") {
  if (!image) return { webp: null, jpg: null }
  if (typeof image === "string") return { webp: null, jpg: image }
  const order = SIZE_ORDER[size] || SIZE_ORDER.thumb
  for (const s of order) {
    const v = image[s]
    if (v?.webp || v?.jpg) {
      return { webp: v.webp || null, jpg: v.jpg || image.src || null }
    }
  }
  return { webp: null, jpg: image.src || null }
}

export { getImageUrl, getImageSources }
