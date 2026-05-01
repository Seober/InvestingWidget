import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AddItemModalRoute } from './routes/AddItemModalRoute'
import { SettingsModalRoute } from './routes/SettingsModalRoute'
import { ListEditModalRoute } from './routes/ListEditModalRoute'
import './styles.css'

function parseRoute(): { kind: string; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  return { kind: path ?? '', params: new URLSearchParams(qs ?? '') }
}

const { kind, params } = parseRoute()

const root = document.getElementById('root')!

let element: React.ReactNode
if (kind === 'add-item') {
  element = <AddItemModalRoute />
} else if (kind === 'edit-item') {
  element = <AddItemModalRoute itemId={params.get('id') ?? undefined} />
} else if (kind === 'settings') {
  element = <SettingsModalRoute />
} else if (kind === 'list-edit') {
  element = <ListEditModalRoute />
} else {
  element = <App />
}

createRoot(root).render(<StrictMode>{element}</StrictMode>)

if (kind) {
  document.body.classList.add('modal-window')
}
