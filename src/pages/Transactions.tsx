import { useEffect, useState } from 'react'
import type { Account, Security, Transaction } from '../types'
import { Button, Card } from '../components/ui'
import { TransactionForm } from '../components/TransactionForm'

const TYPE_LABEL: Record<Transaction['type'], string> = {
  BUY: '買進', SELL: '賣出', DIVIDEND: '股息', FEE: '費用', SPLIT: '拆分',
}

export function Transactions() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [securities, setSecurities] = useState<Security[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [showCash, setShowCash] = useState(false)

  async function refresh() {
    const [tx, ac, sc] = await Promise.all([
      window.api.transactions.list(),
      window.api.accounts.list(),
      window.api.securities.list(),
    ])
    setRows(tx); setAccounts(ac); setSecurities(sc)
  }
  useEffect(() => { refresh() }, [])

  async function remove(id: number) {
    if (!confirm('確定刪除此筆交易?')) return
    await window.api.transactions.remove(id)
    refresh()
  }

  function startEdit(t: Transaction) {
    setEditing(t)
    setShowForm(false)
  }

  const secMap = new Map(securities.map(s => [s.id, s]))
  const acMap  = new Map(accounts.map(a => [a.id, a]))
  const cashIds = new Set(securities.filter(s => s.symbol === 'CASH').map(s => s.id))
  const cashCount = rows.filter(r => cashIds.has(r.security_id)).length
  const visibleRows = showCash ? rows : rows.filter(r => !cashIds.has(r.security_id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">交易紀錄</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={async () => {
            const r = await window.api.csv.importFile()
            if (r.ok) { alert(`匯入 ${r.imported} 筆,略過 ${r.skipped}`); refresh() }
            else if (r.message) alert(r.message)
          }}>匯入 CSV</Button>
          <Button variant="ghost" onClick={async () => {
            const r = await window.api.csv.exportFile()
            if (r.ok) alert(`已匯出 ${r.count} 筆 → ${r.path}`)
          }}>匯出 CSV</Button>
          <Button onClick={() => { setShowForm(s => !s); setEditing(null) }}>
            {showForm ? '收起' : '+ 新增交易'}
          </Button>
        </div>
      </div>

      {editing && (
        <Card title={`編輯交易 #${editing.id}`}>
          <TransactionForm
            key={editing.id}
            accounts={accounts}
            securities={securities}
            initial={editing}
            onSaved={() => { setEditing(null); refresh() }}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {showForm && !editing && (
        <Card title="新增交易">
          <TransactionForm
            accounts={accounts}
            securities={securities}
            onSaved={() => { refresh(); setShowForm(false) }}
          />
        </Card>
      )}

      <Card
        title={`股票交易 (${visibleRows.length} 筆)${cashCount > 0 ? ` · 已隱藏 ${cashCount} 筆現金` : ''}`}
        action={cashCount > 0 ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showCash} onChange={e => setShowCash(e.target.checked)} />
            顯示現金紀錄
          </label>
        ) : undefined}
      >
        {visibleRows.length === 0 ? (
          <p className="text-sm text-slate-500">尚無交易。點右上角「新增交易」開始記錄。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">日期</th>
                <th className="p-2">帳戶</th>
                <th className="p-2">類型</th>
                <th className="p-2">代號</th>
                <th className="p-2">名稱</th>
                <th className="p-2 text-right">數量</th>
                <th className="p-2 text-right">價格</th>
                <th className="p-2 text-right">手續/稅</th>
                <th className="p-2 text-right">匯率</th>
                <th className="p-2">備註</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => {
                const s = secMap.get(r.security_id)
                const a = acMap.get(r.account_id)
                const isCash = s?.symbol === 'CASH'
                return (
                  <tr key={r.id} className={`border-t hover:bg-slate-50 ${editing?.id === r.id ? 'bg-amber-50' : ''} ${isCash ? 'text-slate-500' : ''}`}>
                    <td className="p-2">{r.trade_date}</td>
                    <td className="p-2">{a?.name ?? '-'}</td>
                    <td className="p-2">{isCash ? (r.type === 'BUY' ? '存入' : '提領') : TYPE_LABEL[r.type]}</td>
                    <td className="p-2 font-mono">{s?.symbol ?? '-'}</td>
                    <td className="p-2">{s?.name ?? '-'}</td>
                    <td className="p-2 text-right">{r.quantity}</td>
                    <td className="p-2 text-right">{r.price}</td>
                    <td className="p-2 text-right">{r.fee + r.tax}</td>
                    <td className="p-2 text-right">{r.fx_rate ?? '-'}</td>
                    <td className="p-2 max-w-xs truncate text-slate-600" title={r.reason ?? r.note ?? ''}>
                      {r.reason ?? r.note ?? ''}
                    </td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button variant="ghost" onClick={() => startEdit(r)}>編輯</Button>
                      <Button variant="danger" onClick={() => remove(r.id)}>刪除</Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
