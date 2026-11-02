import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "link" | "danger" | "secondary";
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  if (variant === "link") {
    return (
      <button
        type="button"
        className={`text-blue-700 hover:text-blue-800 text-sm font-medium hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:no-underline ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "danger") {
    return (
      <button
        type="button"
        className={`text-red-700 hover:text-red-800 text-sm font-medium hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (variant === "secondary") {
    return (
      <button
        type="button"
        className={`border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition cursor-pointer disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }

  // Primary default: single deep blue
  return (
    <button
      className={`bg-blue-700 hover:bg-blue-800 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition shadow-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
