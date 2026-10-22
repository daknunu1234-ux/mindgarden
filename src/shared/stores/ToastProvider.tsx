'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/shared/utils/cn'

// Fleeting game notifications ("toasts"). Lives in the root layout, so a toast raised right before a
// navigation (e.g. uprooting a tree, then the redirect to the farm) stays on screen across it.

export type ToastTone = 'leaf' | 'amber' | 'farewell'
// `action`: one button on the toast (e.g. "Undo"); pressing it also dismisses the toast.
// `placement`: 'bottom' for quiet, actionable notes that must not cover the page's header.
export type ToastAction = { label: string; onClick: () => void }
type Toast = { id: number; message: string; icon: string; tone: ToastTone; action?: ToastAction; placement: 'top' | 'bottom' }
type ToastInput = { message: string; icon?: string; tone?: ToastTone; action?: ToastAction; placement?: 'top' | 'bottom' }

// `toast` returns the toast's id, for `dismiss`.
type ToastContextValue = { toast: (input: ToastInput) => number; dismiss: (id: number) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

const DURATION_MS = 4000
const MAX_VISIBLE = 3

const TONES: Record<ToastTone, string> = {
  leaf: 'border-[#2f8f4e] from-[#f2fde9] to-[#c8efae] text-[#12391f] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_5px_0_#237a3f,0_14px_24px_rgba(6,40,30,0.3)]',
  amber: 'border-[#d69e12] from-[#fffdf0] to-[#fde58a] text-[#5a3300] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_5px_0_#b7830c,0_14px_24px_rgba(41,20,5,0.3)]',
  farewell: 'border-[#c9955e] from-[#fffcf3] to-[#f5dcb2] text-[#4a2511] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_5px_0_#b07a45,0_14px_24px_rgba(41,20,5,0.3)]',
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback(({ message, icon = '🌿', tone = 'leaf', action, placement = 'top' }: ToastInput) => {
    const id = ++nextId.current
    setToasts((all) => [...all, { id, message, icon, tone, action, placement }].slice(-MAX_VISIBLE))
    return id
  }, [])
  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Polite live region: announced without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-[max(4.5rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-3 px-4"
      >
        {toasts
          .filter((t) => t.placement === 'top')
          .map((t) => (
            <ToastPod key={t.id} toast={t} onDone={dismiss} />
          ))}
      </div>
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-3 px-4"
      >
        {toasts
          .filter((t) => t.placement === 'bottom')
          .map((t) => (
            <ToastPod key={t.id} toast={t} onDone={dismiss} />
          ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastPod({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(toast.id), DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, onDone])

  return (
    <div
      role="status"
      className={cn(
        'mg-land pointer-events-auto flex max-w-md items-center gap-3 rounded-[22px] border-[3px] bg-gradient-to-b py-2.5 pr-3 pl-2.5 font-game text-base leading-snug font-bold',
        TONES[toast.tone],
      )}
    >
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full border-[2.5px] border-white/80 bg-white/70 text-2xl shadow-[0_2px_0_rgba(0,0,0,0.12)]">
        {toast.icon}
      </span>
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick()
            onDone(toast.id)
          }}
          className="shrink-0 rounded-full border-2 border-current/40 bg-white/80 px-3 py-0.5 text-sm font-extrabold underline-offset-2 hover:bg-white hover:underline focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDone(toast.id)}
        aria-label="Dismiss"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
      >
        ✕
      </button>
    </div>
  )
}

function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export { ToastProvider, useToast }
