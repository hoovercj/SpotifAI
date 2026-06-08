import React, { useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useNavigate } from "react-router-dom"
import { LogOut, UserCircle2, ShieldCheck, MessageSquareWarning } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/Components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/Components/ui/avatar"
import { logoutUser, showProfile } from "../../store/userSlice"
import FeedbackDialog from "./FeedbackDialog"

/**
 * Small avatar button in the app header. Click → dropdown with Profile + Logout.
 * Profile opens the existing UserProfile dialog (still hosted in AppAuthWrapper).
 */
export default function AccountMenu() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const profile = useSelector((s) => s.user?.profile)
  const details = useSelector((s) => s.user?.details)
  const displayName = profile?.name || details?.displayName || details?.id || "Account"
  const avatarSrc = details?.images?.[0]?.url || details?.avatarUrl
  const initials = (displayName || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="rounded-full ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Avatar className="h-9 w-9 border border-border/60">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={displayName} /> : null}
              <AvatarFallback>{initials || "?"}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => dispatch(showProfile())}>
            <UserCircle2 />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setFeedbackOpen(true)}>
            <MessageSquareWarning />
            Report an issue
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/privacy")}>
            <ShieldCheck />
            Privacy
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => dispatch(logoutUser())}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
