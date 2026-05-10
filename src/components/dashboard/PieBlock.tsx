import ReactECharts from 'echarts-for-react'

const COLORS = ['#0f172a','#1e40af','#0e7490','#65a30d','#ca8a04','#c2410c','#be185d','#7c3aed','#0891b2','#16a34a','#475569']

export function PieBlock({ data }: { data: { name: string; fullName: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-slate-500">尚無持股。</p>
  const option = {
    color: COLORS,
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const item = data.find(d => d.name === p.name)
        const full = item?.fullName ?? p.name
        return `<b>${p.marker} ${p.name}</b> ${full !== p.name ? `(${full})` : ''}<br/>` +
               `${p.value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} (${p.percent}%)`
      },
    },
    legend: { type: 'scroll', bottom: 0, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['45%', '72%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      label: { formatter: '{b}\n{d}%', fontSize: 11 },
      labelLine: { length: 8, length2: 8 },
      data: data.map(d => ({ name: d.name, value: d.value })),
    }],
  }
  return <ReactECharts option={option} style={{ height: 360 }} notMerge lazyUpdate />
}
