export type PageKey = 'dashboard-tw' | 'dashboard-us' | 'transactions' | 'holdings' | 'realized' | 'settings'

const items: { key: PageKey; label: string }[] = [
  { key: 'dashboard-tw', label: '台股儀表板' },
  { key: 'dashboard-us', label: '美股儀表板' },
  { key: 'holdings',     label: '持股' },
  { key: 'realized',     label: '已實現損益' },
  { key: 'transactions', label: '交易紀錄' },
  { key: 'settings',     label: '設定' },
]

export function Sidebar({ current, onChange }: { current: PageKey; onChange: (k: PageKey) => void }) {
  return (
    <aside className="w-56 border-r border-slate-200 bg-white p-4">
      <h1 className="mb-6 text-xl font-bold">📈 Finance</h1>
      <nav className="space-y-1">
        {items.map(i => (
          <button
            key={i.key}
            onClick={() => onChange(i.key)}
            className={`block w-full rounded px-3 py-2 text-left text-sm transition ${
              current === i.key ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'
            }`}
          >
            {i.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
