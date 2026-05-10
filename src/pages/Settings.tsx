import { useEffect, useState } from 'react'
import type { Account } from '../types'
import { Button, Input, Select, Field, Card } from '../components/ui'

export function Settings() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [name, setName] = useState('')
  const [market, setMarket] = useState<'TW'|'US'>('TW')

  async function refresh() {
    setAccounts(await window.api.accounts.list())
  }
  useEffect(() => { refresh() }, [])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const currency = market === 'TW' ? 'TWD' : 'USD'
    await window.api.accounts.create({ name: name.trim(), market, currency })
    setName('')
    refresh()
  }

  async function remove(id: number) {
    if (!confirm('確定刪除此帳戶?其下所有交易也會刪除。')) return
    await window.api.accounts.remove(id)
    refresh()
  }

  async function backup() {
    const r = await window.api.backup.exportDb()
    if (r.ok) alert(`備份成功 (${(r.size! / 1024).toFixed(1)} KB)\n\n${r.path}`)
    else if (r.message) alert('備份失敗: ' + r.message)
  }

  async function restore() {
    if (!confirm('還原會用備份檔覆蓋目前的資料庫,當前資料會自動先存成 .bak。\n還原後 App 會重啟。確定繼續嗎?')) return
    const r = await window.api.backup.restoreDb()
    if (!r.ok) {
      if (r.message) alert('還原失敗: ' + r.message)
      return
    }
    let msg = '還原成功,App 將重啟。'
    if (r.backupPath) msg += `\n\n當前資料已先備份到:\n${r.backupPath}`
    alert(msg)
    await window.api.app.relaunch()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">設定</h2>

      <Card title="資料庫備份 / 還原">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={backup}>備份資料庫</Button>
            <Button variant="ghost" onClick={restore}>還原資料庫</Button>
          </div>
          <p className="text-xs text-slate-500">
            備份會把目前所有交易、帳戶、股價快取等等存成單一 .db 檔。
            還原會用選擇的 .db 取代當前資料庫,還原前會自動把當前 DB 存成 .bak。
          </p>
        </div>
      </Card>

      <Card title="帳戶">
        <form onSubmit={add} className="mb-4 flex items-end gap-2">
          <Field label="名稱">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例: 富邦證券" />
          </Field>
          <Field label="市場">
            <Select value={market} onChange={e => setMarket(e.target.value as 'TW'|'US')}>
              <option value="TW">台股 (TWD)</option>
              <option value="US">美股 (USD)</option>
            </Select>
          </Field>
          <Button type="submit">新增</Button>
        </form>

        {accounts.length === 0 ? (
          <p className="text-sm text-slate-500">尚無帳戶,請先新增。</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-2">名稱</th>
                <th className="p-2">市場</th>
                <th className="p-2">幣別</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{a.name}</td>
                  <td className="p-2">{a.market}</td>
                  <td className="p-2">{a.currency}</td>
                  <td className="p-2 text-right">
                    <Button variant="danger" onClick={() => remove(a.id)}>刪除</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
