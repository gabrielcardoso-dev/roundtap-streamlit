import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { completedEmomRounds, emomLimitMs, emomPhase } from './lib/emom'
import { supabase, turnstileSiteKey } from './lib/supabase'
import type { Preferences, WorkoutDraft, WorkoutMode, WorkoutRecord } from './types'

const modes: Record<WorkoutMode, string> = { rounds: 'Rounds', fortime: 'For Time', amrap: 'AMRAP', emom: 'EMOM' }
const defaultDraft: WorkoutDraft = { name: 'Treino livre', mode: 'rounds', goal: 20, durationSec: 720, workSec: 60, restSec: 0 }
const defaultPreferences: Preferences = { sound: true, vibration: true, wakeLock: true }

type ActiveWorkout = WorkoutDraft & {
  rounds: number
  partialReps: number
  elapsedBase: number
  runningSince: number | null
  running: boolean
  complete: boolean
  autoProcessed: number
}

const freshWorkout = (draft: WorkoutDraft): ActiveWorkout => ({ ...draft, rounds: 0, partialReps: 0, elapsedBase: 0, runningSince: null, running: false, complete: false, autoProcessed: 0 })

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/invalid login/i.test(message)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar.'
  if (/rate limit|too many/i.test(message)) return 'Muitas tentativas. Aguarde alguns minutos.'
  if (/network|fetch/i.test(message)) return 'Não foi possível conectar. Verifique sua internet.'
  return 'Não foi possível concluir a solicitação.'
}

function strongPassword(password: string) {
  return password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)
}

function Logo() {
  return <div className="brand"><img src={`${import.meta.env.BASE_URL}roundtap.svg`} alt="" /><div><strong>RoundTap</strong><span>Seu treino. Seu ritmo.</span></div></div>
}

function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!turnstileSiteKey || !ref.current) return
    let cancelled = false
    const render = () => {
      if (cancelled || !ref.current || !window.turnstile || ref.current.childElementCount) return
      window.turnstile.render(ref.current, { sitekey: turnstileSiteKey, theme: 'dark', callback: onToken, 'expired-callback': () => onToken('') })
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-roundtap-turnstile]')
    if (existing) existing.addEventListener('load', render, { once: true })
    else {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      script.dataset.roundtapTurnstile = '1'
      script.onload = render
      document.head.appendChild(script)
    }
    render()
    return () => { cancelled = true }
  }, [onToken])
  if (!turnstileSiteKey) return null
  return <div className="captcha" ref={ref} />
}

function AuthScreen() {
  const [tab, setTab] = useState<'login' | 'signup' | 'recover'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [captcha, setCaptcha] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const onToken = useCallback((token: string) => setCaptcha(token), [])

  async function submit(event: FormEvent) {
    event.preventDefault(); setNotice(null)
    if (!email.includes('@')) return setNotice({ kind: 'error', text: 'Informe um e-mail válido.' })
    if (turnstileSiteKey && !captcha) return setNotice({ kind: 'error', text: 'Confirme que você não é um robô.' })
    setBusy(true)
    try {
      if (tab === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password, options: { captchaToken: captcha || undefined } })
        if (error) throw error
      } else if (tab === 'signup') {
        if (name.trim().length < 2) throw new Error('Informe seu nome.')
        if (!strongPassword(password)) throw new Error('A senha deve ter 10 caracteres, maiúscula, minúscula, número e símbolo.')
        if (password !== confirm) throw new Error('As senhas não coincidem.')
        const { error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: name.trim() }, captchaToken: captcha || undefined, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL } })
        if (error) throw error
        setNotice({ kind: 'ok', text: 'Cadastro recebido. Confira seu e-mail para confirmar a conta.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin + import.meta.env.BASE_URL, captchaToken: captcha || undefined })
        if (error) throw error
        setNotice({ kind: 'ok', text: 'Se a conta existir, enviaremos as instruções de recuperação.' })
      }
    } catch (error) {
      const direct = error instanceof Error && /Informe|senha deve|coincidem/.test(error.message) ? error.message : safeMessage(error)
      setNotice({ kind: 'error', text: direct })
    } finally { setBusy(false); window.turnstile?.reset(); setCaptcha('') }
  }

  return <main className="auth-shell">
    <Logo />
    <section className="auth-copy"><span>PERFORMANCE TRACKING</span><h1>Entre para começar</h1><p>Treine, acompanhe sua evolução e continue em qualquer aparelho.</p></section>
    <div className="tabs" role="tablist">
      <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>Entrar</button>
      <button className={tab === 'signup' ? 'active' : ''} onClick={() => setTab('signup')}>Criar conta</button>
    </div>
    <form className="card form" onSubmit={submit}>
      {tab === 'recover' && <button type="button" className="back-link" onClick={() => setTab('login')}>← Voltar</button>}
      {tab === 'signup' && <label>Nome<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} required /></label>}
      <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>
      {tab !== 'recover' && <label>Senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required /></label>}
      {tab === 'signup' && <><p className="hint">10+ caracteres com maiúscula, minúscula, número e símbolo.</p><label>Repita a senha<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" required /></label></>}
      <Turnstile onToken={onToken} />
      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Aguarde…' : tab === 'login' ? 'Entrar' : tab === 'signup' ? 'Criar minha conta' : 'Recuperar senha'}</button>
      {tab === 'login' && <button type="button" className="text-button" onClick={() => setTab('recover')}>Esqueci minha senha</button>}
    </form>
    <p className="legal-line">Ao continuar, você concorda com os Termos e a Política de Privacidade.</p>
  </main>
}

function NumericInput({ value, min, max, step = 1, scale = 1, onChange }: { value: number; min: number; max: number; step?: number; scale?: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value / scale))

  useEffect(() => { setText(String(value / scale)) }, [scale, value])

  function commit() {
    const parsed = text.trim() === '' ? min : Number(text)
    const normalized = Math.min(max, Math.max(min, Number.isFinite(parsed) ? parsed : min))
    setText(String(normalized))
    onChange(normalized * scale)
  }

  return <input
    type="number"
    min={min}
    max={max}
    step={step}
    inputMode={step < 1 ? 'decimal' : 'numeric'}
    value={text}
    onChange={event => {
      const next = event.target.value
      setText(next)
      if (next.trim() === '') return
      const parsed = Number(next)
      if (Number.isFinite(parsed)) onChange(parsed * scale)
    }}
    onBlur={commit}
  />
}

function SetupModal({ initial, onClose, onStart }: { initial: WorkoutDraft; onClose: () => void; onStart: (draft: WorkoutDraft) => void }) {
  const [draft, setDraft] = useState(initial)
  const number = (key: keyof WorkoutDraft, value: number) => setDraft(d => ({ ...d, [key]: value }))
  return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
    <header><h2 id="setup-title">Novo treino</h2><button className="close" onClick={onClose} aria-label="Fechar">×</button></header>
    <label>Nome do treino<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></label>
    <fieldset><legend>Modalidade</legend><div className="mode-grid">{(Object.keys(modes) as WorkoutMode[]).map(mode => <button key={mode} className={draft.mode === mode ? 'selected' : ''} onClick={() => setDraft({ ...draft, mode })}>{modes[mode]}<small>{mode === 'emom' ? 'Rounds automáticos' : mode === 'amrap' ? 'Máximo no tempo' : 'Complete sua meta'}</small></button>)}</div></fieldset>
    {draft.mode !== 'amrap' && <label>Meta de rounds<NumericInput min={1} max={999} value={draft.goal} onChange={value => number('goal', value)} /></label>}
    {draft.mode === 'amrap' && <label>Duração em minutos<NumericInput min={1} max={180} scale={60} value={draft.durationSec} onChange={value => number('durationSec', value)} /></label>}
    {draft.mode === 'emom' && <div className="two-cols"><label>Trabalho por round (s)<NumericInput min={5} max={3600} value={draft.workSec} onChange={value => number('workSec', value)} /></label><label>Descanso por round (s)<NumericInput min={0} max={1800} value={draft.restSec} onChange={value => number('restSec', value)} /></label></div>}
    <button className="primary" onClick={() => onStart({ ...draft, name: draft.name.trim() || modes[draft.mode] })}>Começar treino</button>
  </section></div>
}

function feedback(preferences: Preferences, finish = false) {
  if (preferences.vibration && navigator.vibrate) navigator.vibrate(finish ? [80, 50, 140] : 45)
  if (!preferences.sound) return
  try {
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain()
    oscillator.connect(gain); gain.connect(context.destination); oscillator.frequency.value = finish ? 880 : 620
    gain.gain.setValueAtTime(.07, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .16)
    oscillator.start(); oscillator.stop(context.currentTime + .17)
  } catch { /* browser may require prior interaction */ }
}

function WorkoutScreen({ user, preferences, onSaved }: { user: User; preferences: Preferences; onSaved: () => void }) {
  const storageKey = `roundtap-v3-active-${user.id}`
  const [setup, setSetup] = useState(false)
  const [workout, setWorkout] = useState<ActiveWorkout>(() => {
    try { return { ...freshWorkout(defaultDraft), ...JSON.parse(localStorage.getItem(storageKey) || '{}'), running: false, runningSince: null } }
    catch { return freshWorkout(defaultDraft) }
  })
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState('')
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const elapsed = workout.elapsedBase + (workout.running && workout.runningSince ? now - workout.runningSince : 0)
  const limit = workout.mode === 'amrap' ? workout.durationSec * 1000 : workout.mode === 'emom' ? emomLimitMs(workout.goal, workout.workSec, workout.restSec) : Infinity
  const phase = workout.mode === 'emom' ? emomPhase(elapsed, workout.goal, workout.workSec, workout.restSec) : null
  const displayMs = phase && !workout.complete ? phase.remainingMs : Number.isFinite(limit) ? Math.max(0, limit - elapsed) : elapsed

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify({ ...workout, running: false, runningSince: null, elapsedBase: elapsed })) }, [storageKey, workout.name, workout.mode, workout.goal, workout.durationSec, workout.workSec, workout.restSec, workout.rounds, workout.partialReps, workout.running, workout.complete])
  useEffect(() => { if (!workout.running) return; const id = window.setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [workout.running])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 1800); return () => clearTimeout(id) }, [toast])
  useEffect(() => {
    async function wake() {
      try {
        if (workout.running && preferences.wakeLock && 'wakeLock' in navigator) wakeRef.current = await navigator.wakeLock.request('screen')
        else if (wakeRef.current) { await wakeRef.current.release(); wakeRef.current = null }
      } catch { wakeRef.current = null }
    }
    void wake(); return () => { void wakeRef.current?.release(); wakeRef.current = null }
  }, [workout.running, preferences.wakeLock])
  useEffect(() => {
    if (!workout.running || workout.complete) return
    if (workout.mode === 'emom') {
      const completed = completedEmomRounds(elapsed, workout.goal, workout.workSec, workout.restSec)
      if (completed > workout.autoProcessed) {
        const rounds = Math.min(workout.goal, workout.rounds + completed - workout.autoProcessed)
        feedback(preferences); setToast(`Round ${rounds} computado automaticamente`)
        setWorkout(w => ({ ...w, rounds, autoProcessed: completed, partialReps: 0, complete: rounds >= w.goal, running: rounds < w.goal, elapsedBase: rounds >= w.goal ? limit : w.elapsedBase, runningSince: rounds >= w.goal ? null : w.runningSince }))
        return
      }
    }
    if (Number.isFinite(limit) && elapsed >= limit) {
      feedback(preferences, true); setToast('Tempo encerrado!')
      setWorkout(w => ({ ...w, complete: true, running: false, runningSince: null, elapsedBase: limit }))
    }
  }, [elapsed, limit, preferences, workout.autoProcessed, workout.complete, workout.goal, workout.mode, workout.restSec, workout.rounds, workout.running, workout.workSec])

  function toggleTimer() {
    if (workout.complete) return
    if (workout.running) setWorkout(w => ({ ...w, elapsedBase: elapsed, running: false, runningSince: null }))
    else setWorkout(w => ({ ...w, running: true, runningSince: Date.now() }))
  }
  function addRound() {
    if (workout.mode === 'emom') return setToast('No EMOM, a contagem é automática')
    const rounds = workout.rounds + 1; const complete = ['rounds', 'fortime'].includes(workout.mode) && rounds >= workout.goal
    feedback(preferences, complete); setWorkout(w => ({ ...w, rounds, partialReps: 0, running: complete ? false : w.running, runningSince: complete ? null : w.runningSince, elapsedBase: complete ? elapsed : w.elapsedBase, complete }))
  }
  async function save() {
    const finalElapsed = workout.running ? elapsed : workout.elapsedBase
    const payload = { user_id: user.id, name: workout.name, mode: workout.mode, goal: workout.goal, duration_sec: workout.durationSec, work_sec: workout.workSec, rest_sec: workout.restSec, rounds: workout.rounds, partial_reps: workout.partialReps, elapsed_ms: Math.round(finalElapsed), completed_at: new Date().toISOString() }
    const { error } = await supabase.from('workouts').insert(payload)
    if (error) {
      const pending = JSON.parse(localStorage.getItem(`roundtap-v3-pending-${user.id}`) || '[]')
      pending.push({ id: crypto.randomUUID(), userId: user.id, name: workout.name, mode: workout.mode, goal: workout.goal, durationSec: workout.durationSec, workSec: workout.workSec, restSec: workout.restSec, rounds: workout.rounds, partialReps: workout.partialReps, elapsedMs: Math.round(finalElapsed), completedAt: payload.completed_at, pendingSync: true }); localStorage.setItem(`roundtap-v3-pending-${user.id}`, JSON.stringify(pending))
      setToast('Salvo neste aparelho; sincronizaremos quando houver conexão.')
    } else setToast('Treino salvo na nuvem!')
    setWorkout(freshWorkout({ name: workout.name, mode: workout.mode, goal: workout.goal, durationSec: workout.durationSec, workSec: workout.workSec, restSec: workout.restSec })); onSaved()
  }
  const goalMode = workout.mode !== 'amrap'
  const progress = goalMode ? Math.min(100, workout.rounds / workout.goal * 100) : Math.min(100, elapsed / limit * 100)
  return <section className="view">
    <div className="workout-head"><div><span className="mode-badge">{modes[workout.mode]}</span><h2>{workout.name}</h2></div><button className="outline" onClick={() => setSetup(true)}>Novo treino</button></div>
    <div className="timer-card"><div><span>{phase ? phase.kind === 'work' ? `Trabalho • round ${phase.round}` : `Descanso • após round ${phase.round}` : Number.isFinite(limit) ? 'Tempo restante' : 'Tempo de treino'}</span><strong>{formatTime(displayMs)}</strong></div><button className="timer-button" onClick={toggleTimer}>{workout.running ? 'Pausar' : elapsed ? 'Continuar' : 'Iniciar'}</button></div>
    <div className="counter-card"><span>ROUNDS CONCLUÍDOS</span><strong className="counter">{workout.rounds}</strong><p>{goalMode ? workout.rounds >= workout.goal ? `Meta de ${workout.goal} rounds alcançada` : `Faltam ${Math.max(0, workout.goal - workout.rounds)} de ${workout.goal} rounds` : `${workout.rounds} rounds no tempo`}</p><div className="progress"><i style={{ width: `${progress}%` }} /></div><small>{phase ? phase.kind === 'work' ? `Round ${phase.round} • contagem automática` : `Descanso • próximo round ${Math.min(workout.goal, phase.round + 1)}` : ''}</small></div>
    <button className="add-round" disabled={workout.mode === 'emom' || workout.complete} onClick={addRound}>{workout.mode === 'emom' ? '⏱ CONTAGEM AUTOMÁTICA' : '+ CONCLUIR ROUND'}</button>
    <div className="action-grid"><button className="outline" disabled={!workout.rounds} onClick={() => setWorkout(w => ({ ...w, rounds: Math.max(0, w.rounds - 1), complete: false }))}>↶ Desfazer</button><div className="reps"><button onClick={() => setWorkout(w => ({ ...w, partialReps: Math.max(0, w.partialReps - 1) }))}>−</button><span>{workout.partialReps} reps</span><button onClick={() => setWorkout(w => ({ ...w, partialReps: w.partialReps + 1 }))}>+</button></div></div>
    <button className="finish" disabled={!elapsed && !workout.rounds} onClick={save}>Finalizar e salvar treino</button>
    {setup && <SetupModal initial={workout} onClose={() => setSetup(false)} onStart={draft => { setWorkout({ ...freshWorkout(draft), running: true, runningSince: Date.now() }); setSetup(false) }} />}
    {toast && <div className="toast">{toast}</div>}
  </section>
}

function HistoryScreen({ user, refresh }: { user: User; refresh: number }) {
  const [items, setItems] = useState<WorkoutRecord[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      let pending = JSON.parse(localStorage.getItem(`roundtap-v3-pending-${user.id}`) || '[]') as WorkoutRecord[]
      if (navigator.onLine && pending.length) {
        const rows = pending.map(item => ({ id: item.id, user_id: user.id, name: item.name, mode: item.mode, goal: item.goal, duration_sec: item.durationSec, work_sec: item.workSec, rest_sec: item.restSec, rounds: item.rounds, partial_reps: item.partialReps, elapsed_ms: item.elapsedMs, completed_at: item.completedAt }))
        const { error } = await supabase.from('workouts').upsert(rows)
        if (!error) { pending = []; localStorage.removeItem(`roundtap-v3-pending-${user.id}`) }
      }
      const { data } = await supabase.from('workouts').select('*').order('completed_at', { ascending: false }).limit(100)
      const cloud = (data || []).map(row => ({ id: row.id, userId: row.user_id, name: row.name, mode: row.mode, goal: row.goal, durationSec: row.duration_sec, workSec: row.work_sec, restSec: row.rest_sec, rounds: row.rounds, partialReps: row.partial_reps, elapsedMs: row.elapsed_ms, completedAt: row.completed_at } as WorkoutRecord))
      if (active) { setItems([...pending, ...cloud]); setLoading(false) }
    }
    void load(); return () => { active = false }
  }, [refresh, user.id])
  return <section className="view"><h1>Histórico</h1><p className="sub">Seus treinos sincronizados em todos os aparelhos.</p>{loading ? <div className="empty">Carregando…</div> : !items.length ? <div className="empty">Nenhum treino salvo ainda.</div> : <div className="history-list">{items.map(item => <article className="history-card" key={item.id}><header><div><strong>{item.name}</strong><span>{modes[item.mode]}</span></div><time>{new Date(item.completedAt).toLocaleDateString('pt-BR')}</time></header><div><p><span>Rounds</span><b>{item.rounds}{item.partialReps ? ` + ${item.partialReps}` : ''}</b></p><p><span>Tempo</span><b>{formatTime(item.elapsedMs)}</b></p><p><span>Média</span><b>{item.rounds ? formatTime(item.elapsedMs / item.rounds) : '—'}</b></p></div>{item.pendingSync && <small>Pendente de sincronização</small>}</article>)}</div>}</section>
}

function SettingsScreen({ value, onChange }: { value: Preferences; onChange: (value: Preferences) => void }) {
  const setting = (key: keyof Preferences, title: string, description: string) => <label className="setting"><div><strong>{title}</strong><span>{description}</span></div><input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })} /><i /></label>
  return <section className="view"><h1>Ajustes</h1><p className="sub">Escolha como o aplicativo responde durante o treino.</p><div className="settings-card">{setting('sound', 'Som', 'Alerta a cada round e intervalo')}{setting('vibration', 'Vibração', 'Confirma rounds e ações')}{setting('wakeLock', 'Tela sempre ativa', 'Evita bloqueio durante o treino')}</div></section>
}

function LegalScreen({ type, onBack }: { type: 'privacy' | 'terms'; onBack: () => void }) {
  return <section className="view legal"><button className="back-link" onClick={onBack}>← Voltar</button><h1>{type === 'privacy' ? 'Política de Privacidade' : 'Termos de Uso'}</h1>{type === 'privacy' ? <><p>O RoundTap armazena dados de conta e resultados de treinos para sincronização entre dispositivos.</p><h2>Dados tratados</h2><p>Nome, e-mail, configurações e histórico de treinos. Senhas são tratadas pelo Supabase Auth e não ficam disponíveis ao RoundTap.</p><h2>Seus direitos</h2><p>Você pode exportar seus dados ou excluir sua conta pelo perfil. A exclusão remove permanentemente o perfil e os treinos.</p></> : <><p>O RoundTap é uma ferramenta de apoio para contagem e registro de treinos. Ele não substitui orientação profissional.</p><h2>Uso responsável</h2><p>Interrompa o exercício em caso de dor ou mal-estar e procure orientação adequada.</p><h2>Disponibilidade</h2><p>Durante o período de testes, funcionalidades podem ser ajustadas e indisponibilidades temporárias podem ocorrer.</p></>}</section>
}

function ProfileScreen({ user, onBack, onLegal }: { user: User; onBack: () => void; onLegal: (type: 'privacy' | 'terms') => void }) {
  const [name, setName] = useState(String(user.user_metadata.full_name || user.email?.split('@')[0] || 'Atleta'))
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState('')
  async function saveName() {
    if (name.trim().length < 2) return setNotice('Informe um nome válido.')
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: name.trim(), updated_at: new Date().toISOString() })
    if (!error) await supabase.auth.updateUser({ data: { full_name: name.trim() } })
    setNotice(error ? safeMessage(error) : 'Perfil atualizado.')
  }
  async function changePassword() {
    if (!user.email || !currentPassword) return setNotice('Informe sua senha atual.')
    if (!strongPassword(newPassword)) return setNotice('A nova senha deve ter 10 caracteres, maiúscula, minúscula, número e símbolo.')
    if (newPassword !== confirm) return setNotice('As senhas não coincidem.')
    const { error: authError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
    if (authError) return setNotice('A senha atual está incorreta.')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setNotice(error ? safeMessage(error) : 'Senha alterada com sucesso.'); setCurrentPassword(''); setNewPassword(''); setConfirm('')
  }
  async function exportData() {
    const [{ data: profile }, { data: workouts }] = await Promise.all([supabase.from('profiles').select('*').single(), supabase.from('workouts').select('*').order('completed_at')])
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), profile, workouts }, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `roundtap-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href)
  }
  async function deleteAccount() {
    if (prompt('Digite EXCLUIR para apagar permanentemente sua conta e seus treinos.') !== 'EXCLUIR') return
    const { error } = await supabase.rpc('delete_own_account')
    if (error) setNotice(safeMessage(error)); else await supabase.auth.signOut()
  }
  return <section className="view profile"><button className="back-link" onClick={onBack}>← Voltar ao treino</button><div className="profile-title"><div>{name.charAt(0).toUpperCase()}</div><span>PERFIL DO ATLETA<h1>{name}</h1></span></div><div className="profile-data"><label>Nome<input value={name} onChange={e => setName(e.target.value)} maxLength={80} /></label><button className="outline" onClick={saveName}>Salvar nome</button><span>E-mail</span><strong>{user.email}</strong></div><div className="card form"><h2>Alterar senha</h2><label>Senha atual<input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} autoComplete="current-password" /></label><label>Nova senha<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" /></label><label>Confirme a nova senha<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" /></label><button className="primary" onClick={changePassword}>Salvar nova senha</button></div>{notice && <div className="notice ok">{notice}</div>}<div className="profile-actions"><button className="outline" onClick={exportData}>Exportar meus dados</button><button className="outline" onClick={() => onLegal('privacy')}>Privacidade</button><button className="outline" onClick={() => onLegal('terms')}>Termos</button><button className="danger" onClick={() => supabase.auth.signOut({ scope: 'local' })}>Sair do aplicativo</button><button className="text-danger" onClick={deleteAccount}>Excluir minha conta</button></div></section>
}

function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [notice, setNotice] = useState('')
  async function update() {
    if (!strongPassword(password)) return setNotice('A senha deve ter 10 caracteres, maiúscula, minúscula, número e símbolo.')
    if (password !== confirm) return setNotice('As senhas não coincidem.')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setNotice(safeMessage(error)); else { setNotice('Senha redefinida com sucesso.'); window.setTimeout(onDone, 900) }
  }
  return <main className="auth-shell"><Logo /><section className="auth-copy"><span>RECUPERAÇÃO DE CONTA</span><h1>Crie uma nova senha</h1><p>Escolha uma senha forte que você não utiliza em outros serviços.</p></section><div className="card form"><label>Nova senha<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label><label>Repita a senha<input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" /></label>{notice && <div className="notice ok">{notice}</div>}<button className="primary" onClick={update}>Salvar nova senha</button></div></main>
}

function Shell({ session }: { session: Session }) {
  const user = session.user
  const [page, setPage] = useState<'workout' | 'history' | 'settings' | 'profile' | 'privacy' | 'terms'>('workout')
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [preferences, setPreferences] = useState<Preferences>(() => { try { return { ...defaultPreferences, ...JSON.parse(localStorage.getItem(`roundtap-v3-settings-${user.id}`) || '{}') } } catch { return defaultPreferences } })
  useEffect(() => localStorage.setItem(`roundtap-v3-settings-${user.id}`, JSON.stringify(preferences)), [preferences, user.id])
  const content = useMemo(() => {
    if (page === 'profile') return <ProfileScreen user={user} onBack={() => setPage('workout')} onLegal={setPage} />
    if (page === 'privacy' || page === 'terms') return <LegalScreen type={page} onBack={() => setPage('profile')} />
    if (page === 'history') return <HistoryScreen user={user} refresh={historyRefresh} />
    if (page === 'settings') return <SettingsScreen value={preferences} onChange={setPreferences} />
    return <WorkoutScreen user={user} preferences={preferences} onSaved={() => setHistoryRefresh(x => x + 1)} />
  }, [historyRefresh, page, preferences, user])
  return <main className="app-shell"><header className="app-header"><Logo /><button className="profile-button" onClick={() => setPage('profile')} aria-label="Abrir meu perfil"><span>{String(user.user_metadata.full_name || user.email || 'A').charAt(0).toUpperCase()}</span></button></header>{content}{['workout', 'history', 'settings'].includes(page) && <nav><button className={page === 'workout' ? 'active' : ''} onClick={() => setPage('workout')}>◉<span>Treino</span></button><button className={page === 'history' ? 'active' : ''} onClick={() => setPage('history')}>▤<span>Histórico</span></button><button className={page === 'settings' ? 'active' : ''} onClick={() => setPage('settings')}>⚙<span>Ajustes</span></button></nav>}</main>
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((event, next) => { if (event === 'PASSWORD_RECOVERY') setRecovering(true); setSession(next); setLoading(false) })
    return () => data.subscription.unsubscribe()
  }, [])
  if (loading) return <main className="splash"><img src={`${import.meta.env.BASE_URL}roundtap.svg`} alt="RoundTap" /><p>Preparando seu treino…</p></main>
  if (session && recovering) return <ResetPasswordScreen onDone={() => setRecovering(false)} />
  return session ? <Shell session={session} /> : <AuthScreen />
}
