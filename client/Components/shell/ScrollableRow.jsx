import React from "react"
import { cn } from "@/lib/utils"

/**
 * Horizontal-scroll row used across HomeTab. Renders a header (with optional
 * "See all" affordance) and a horizontally scrollable list of children.
 */
export default function ScrollableRow({
  title,
  subtitle,
  action,
  children,
  className,
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <header className="flex items-end justify-between px-4">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </header>
      <div
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        {React.Children.map(children, (child) => (
          <div className="snap-start shrink-0" role="listitem">
            {child}
          </div>
        ))}
      </div>
    </section>
  )
}
