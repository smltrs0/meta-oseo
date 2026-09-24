import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as Button } from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-background hover:bg-destructive/90 focus-visible:ring-destructive",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Objetivo táctil mínimo de 44 px (2.75rem). Las variantes compactas solo se
        // reducen con puntero fino (ratón); con el dedo vuelven a 44 px.
        "default": "h-11 px-5 py-2 has-[>svg]:px-4",
        "xs": "h-8 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 pointer-coarse:h-11 pointer-coarse:px-3 [&_svg:not([class*='size-'])]:size-3",
        "sm": "h-9 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:h-11",
        "lg": "h-12 rounded-md px-6 text-base has-[>svg]:px-4",
        "icon": "size-11",
        "icon-xs": "size-8 rounded-md pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9 pointer-coarse:size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)
export type ButtonVariants = VariantProps<typeof buttonVariants>
