import React, { useState } from "react"
import { useSelector } from "react-redux"
import axios from "axios"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/Components/ui/dialog"
import { Button } from "@/Components/ui/button"
import { cn } from "@/lib/utils"
import { getListenSessionId } from "@/lib/listenSession"
import { track, trackException } from "@/lib/telemetry"

const MAX_MESSAGE_LEN = 4000

export default function FeedbackDialog({ open, onOpenChange }) {
  const [message, setMessage] = useState("")
  const [contactOk, setContactOk] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const currentTrack = useSelector((s) => s.player?.currentTrack)
  const playbackSession = useSelector((s) => s.player?.playbackSession)

  function reset() {
    setMessage("")
    setContactOk(false)
    setSubmitting(false)
    setSubmitted(false)
    setError(null)
  }

  function handleOpenChange(next) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        message: message.slice(0, MAX_MESSAGE_LEN),
        contactOk,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        seedKey: playbackSession?.id ?? null,
        seedType: playbackSession?.seed?.type ?? null,
        djId: playbackSession?.djId ?? null,
        trackUri: currentTrack?.uri ?? null,
      }
      await axios.post("/api/feedback", payload)
      track("feedback.submitted.client", {
        seedType: payload.seedType,
        hasTrack: Boolean(payload.trackUri),
        contactOk,
        messageLen: payload.message.length,
      })
      setSubmitted(true)
    } catch (err) {
      trackException(err, { source: "feedback.submit" })
      setError("Couldn't send your report. Please try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  const remaining = MAX_MESSAGE_LEN - message.length
  const listenSessionId = getListenSessionId()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an issue</DialogTitle>
          <DialogDescription>
            Tell us what went wrong — playback dropping, DJ chatter sounding
            off, a missing track. We attach your current listening session id
            so we can find the exact run in our logs.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Thanks — we got it. We&apos;ll dig into the logs for this session.
            </p>
            <DialogFooter className="mt-2 flex-row justify-end gap-2 sm:space-x-0">
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">What happened?</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={MAX_MESSAGE_LEN}
                rows={5}
                required
                placeholder="Playback stopped after the third song on the Afrobeats station…"
                className={cn(
                  "flex w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                )}
              />
              <span className="text-xs text-muted-foreground self-end">
                {remaining} characters left
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={contactOk}
                onChange={(e) => setContactOk(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                It&apos;s OK to follow up by email at the address linked to my
                Spotify account.
              </span>
            </label>

            {error ? (
              <p className="text-xs text-destructive">{error}</p>
            ) : null}

            <p className="text-[11px] text-muted-foreground break-all">
              Session id (attached automatically): {listenSessionId}
            </p>

            <DialogFooter className="mt-1 flex-row justify-end gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !message.trim()}>
                {submitting ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
