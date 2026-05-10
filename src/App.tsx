import { useState } from 'react'
import { Sidebar, type PageKey } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Transactions } from './pages/Transactions'
import { Holdings } from './pages/Holdings'
import { Realized } from './pages/Realized'
import { Settings } from './pages/Settings'

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard-tw')

  return (
    <div className="flex h-full bg-slate-50 text-slate-800">
      <Sidebar current={page} onChange={setPage} />
      <main className="flex-1 overflow-auto p-6">
        {page === 'dashboard-tw'  && <Dashboard market="TW" />}
        {page === 'dashboard-us'  && <Dashboard market="US" />}
        {page === 'transactions'  && <Transactions />}
        {page === 'holdings'      && <Holdings />}
        {page === 'realized'      && <Realized />}
        {page === 'settings'      && <Settings />}
      </main>
    </div>
  )
}
