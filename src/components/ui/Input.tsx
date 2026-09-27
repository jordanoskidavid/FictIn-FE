import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

function FieldWrapper({ label, error, hint, children }: FieldWrapperProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-slate-700">{label}</span>}
      {children}
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = "", ...rest }: InputProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <input
        className={`rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-slate-500 ${
          error ? "border-red-400" : "border-slate-300"
        } ${className}`}
        {...rest}
      />
    </FieldWrapper>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Select({ label, error, hint, className = "", children, ...rest }: SelectProps) {
  return (
    <FieldWrapper label={label} error={error} hint={hint}>
      <select
        className={`rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-slate-500 ${
          error ? "border-red-400" : "border-slate-300"
        } ${className}`}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
}
