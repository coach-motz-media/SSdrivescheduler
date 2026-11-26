"use client";

/** A submit button that asks "are you sure?" first. */
export default function ConfirmButton({ children, question, className = "x danger" }: { children: React.ReactNode; question: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
