import React from "react"
import { NavLink } from "react-router-dom"
import { Home, Search, Library } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/search", label: "Search", icon: Search },
  { to: "/library", label: "Library", icon: Library },
]

/**
 * Three-tab bottom nav. Active tab gets the violet→fuchsia gradient text
 * and icon treatment, matching the brand.
 */
export default function BottomTabBar() {
  return (
    <nav
      className="border-t border-border/40 bg-background/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-3">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent [&_svg]:text-fuchsia-400"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              <Icon className="h-6 w-6" strokeWidth={2.2} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
