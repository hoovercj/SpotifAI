import React from "react"
import { Outlet } from "react-router-dom"
import { Sparkles } from "lucide-react"
import BottomTabBar from "./BottomTabBar"
import AccountMenu from "./AccountMenu"

/**
 * AppShell is the mobile-only layout that wraps the three authenticated tabs.
 * It composes:
 *  - sticky header with the SpotifAI wordmark + AccountMenu
 *  - main scroll area (route Outlet)
 *  - BottomTabBar
 *
 * Mobile-only: on viewports ≥768px the entire shell is centered in a
 * max-width column. Real desktop layout lands in the vNext desktop phase.
 */
export default function AppShell() {
  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col border-x border-border/40">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-foreground shadow-md shadow-fuchsia-900/40">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Spotif<span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">AI</span>
            </span>
          </div>
          <AccountMenu />
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(var(--player-offset,0px)+72px+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>

        <BottomTabBar />
      </div>
    </div>
  )
}
