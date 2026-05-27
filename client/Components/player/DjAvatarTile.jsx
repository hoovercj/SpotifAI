import React from "react"

/**
 * Square DJ avatar tile.
 *
 * - If `dj.details?.image` is a non-empty data URI (the persona has had
 *   `npm run seed:dj-avatars` run for it), render that image.
 * - Otherwise fall back to a 2-letter initials tile on a gradient
 *   derived from the DJ's id (deterministic, so each DJ gets a stable
 *   color until their avatar is baked).
 *
 * `selected` toggles a ring highlight. `onClick` makes the tile a
 * button when supplied; otherwise it's a static visual.
 */

function initialsFor(name) {
  if (!name) return "?"
  const parts = String(name)
    .replace(/["'`’]/g, "")
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// 8 fixed gradient pairs. We mod by id so a DJ keeps the same color
// across renders without needing a server-side palette assignment.
const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-rose-500 to-orange-500",
  "from-amber-500 to-pink-500",
  "from-emerald-500 to-cyan-500",
  "from-sky-500 to-indigo-500",
  "from-teal-400 to-emerald-600",
  "from-lime-500 to-emerald-500",
  "from-fuchsia-500 to-pink-500",
]

function gradientFor(id) {
  if (!Number.isFinite(id)) return GRADIENTS[0]
  return GRADIENTS[Math.abs(id) % GRADIENTS.length]
}

const SIZE_CLASSES = {
  sm: "h-12 w-12 text-sm",
  md: "h-16 w-16 text-base",
  lg: "h-20 w-20 text-lg",
  xl: "h-28 w-28 text-xl",
}

export default function DjAvatarTile({
  dj,
  size = "md",
  selected = false,
  showName = false,
  onClick,
  className = "",
  ariaLabel,
}) {
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const ringCls = selected
    ? "ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-background"
    : "ring-1 ring-border/40"

  const img = dj?.details?.image || null
  const name = dj?.djName || ""
  const initials = initialsFor(name)
  const gradient = gradientFor(dj?.id)

  const tile = (
    <div
      className={`grid place-items-center overflow-hidden rounded-xl ${sizeCls} ${ringCls} ${className}`}
      aria-label={ariaLabel || name}
    >
      {img ? (
        <img
          src={img}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div
          className={`grid h-full w-full place-items-center bg-gradient-to-br ${gradient} font-semibold text-white`}
        >
          {initials}
        </div>
      )}
    </div>
  )

  const wrapped = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1 focus:outline-none"
      aria-label={ariaLabel || `Pick ${name}`}
    >
      {tile}
      {showName && (
        <span className="line-clamp-1 max-w-[6rem] text-center text-[11px] text-foreground">
          {name}
        </span>
      )}
    </button>
  ) : (
    <div className="flex flex-col items-center gap-1">
      {tile}
      {showName && (
        <span className="line-clamp-1 max-w-[6rem] text-center text-[11px] text-foreground">
          {name}
        </span>
      )}
    </div>
  )

  return wrapped
}
