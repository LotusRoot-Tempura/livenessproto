import { ButtonHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  return <button {...props} className={`btn btn--${variant} ${props.className ?? ""}`.trim()} />;
}
