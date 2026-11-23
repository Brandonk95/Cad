import { useState, type FormEvent } from 'react'
import { pb } from '../lib/pb'
import { Wordmark } from '../ui/Logo'

export function Auth({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      if (mode === 'up') {
        await pb.collection('users').create({ email, password, passwordConfirm: password, name })
      }
      await pb.collection('users').authWithPassword(email, password)
      onDone()
    } catch (e) {
      const data = (e as { response?: { data?: Record<string, { message: string }> } }).response?.data
      const first = data && Object.entries(data)[0]
      setErr(first ? `${first[0]}: ${first[1].message}` : mode === 'in' ? "That email and password don't match." : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form onSubmit={submit}>
        <Wordmark />
        <p className="tagline">CAD that knows your printer.</p>
        {mode === 'up' && (
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
        </label>
        <p className="err" role="alert">{err}</p>
        <button className="btn primary" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn ghost" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr('') }}>
          {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
