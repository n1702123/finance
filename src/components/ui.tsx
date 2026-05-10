import { type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react'

export function Button({ className = '', variant = 'primary', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'ghost'|'danger' }) {
  const base = 'rounded px-3 py-1.5 text-sm font-medium transition disabled:opacity-50'
  const styles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-700',
    ghost:   'text-slate-700 hover:bg-slate-100',
    danger:  'text-red-600 hover:bg-red-50',
  }[variant]
  return <button className={`${base} ${styles} ${className}`} {...rest} />
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select className={`rounded border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none ${className}`} {...rest}>
      {children}
    </select>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
