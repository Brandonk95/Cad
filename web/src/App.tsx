import { useEffect, useState } from 'react'
import { listCalibrations, listMaterials, listPrinters, pb } from './lib/pb'
import { useRoute } from './lib/route'
import { useEditor } from './store/editor'
import { Auth } from './screens/Auth'
import { Home } from './screens/Home'
import { Editor } from './screens/Editor'
import { Toasts } from './ui/Toasts'
import { UpdateNotice } from './ui/UpdateNotice'
import { Mark } from './ui/Logo'

function useLibrary(authed: boolean) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!authed) return
    setReady(false)
    Promise.all([listPrinters(), listMaterials().catch(() => []), listCalibrations().catch(() => [])])
      .then(([p, m, c]) => useEditor.getState().setLibrary(p, m, c))
      .catch((e) => console.error('library load failed', e))
      .finally(() => setReady(true))
  }, [authed])
  return ready
}

export default function App() {
  const [authed, setAuthed] = useState(pb.authStore.isValid)
  const route = useRoute()
  const ready = useLibrary(authed)
  const theme = useEditor((s) => s.theme)
  const reduced = useEditor((s) => s.reducedMotion)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full'
  }, [theme, reduced])

  useEffect(() => {
    if (!authed) return
    pb.collection('users').authRefresh().catch(() => {
      pb.authStore.clear()
      setAuthed(false)
    })
    return pb.authStore.onChange(() => setAuthed(pb.authStore.isValid))
  }, [authed])

  return (
    <>
      {!authed ? (
        <Auth onDone={() => setAuthed(true)} />
      ) : !ready ? (
        <div className="auth"><Mark size={32} /></div>
      ) : route.name === 'project' ? (
        <Editor key={route.id} id={route.id} />
      ) : (
        <Home onSignOut={() => setAuthed(false)} />
      )}
      <Toasts />
      <UpdateNotice />
    </>
  )
}
