import { useEditor } from '../store/editor'
import { I } from './Icons'

export function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  const dismiss = useEditor((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? 'info'}`} onClick={() => dismiss(t.id)}>
          {t.tone === 'ok' ? <I.checkCircle /> : t.tone === 'warn' ? <I.warn /> : <I.info />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  )
}
