import { cn } from "@/lib/utils"
import type { HTMLAttributes } from "react"

export type LoaderProps = HTMLAttributes<HTMLDivElement> & {
	/** Size variant */
	size?: "sm" | "md" | "lg"
}

const sizeClasses = {
	sm: "text-lg",
	md: "text-4xl",
	lg: "text-6xl",
}

/**
 * Surfer loader - rides the waves while waiting
 * Subtle up/down bobbing animation
 */
export const Loader = ({ className, size = "lg", ...props }: LoaderProps) => (
	<div
		className={cn("inline-flex items-center justify-center", sizeClasses[size], className)}
		{...props}
	>
		<span className="animate-surf" role="img" aria-label="Loading">
			🏄‍♂️
		</span>
	</div>
)
