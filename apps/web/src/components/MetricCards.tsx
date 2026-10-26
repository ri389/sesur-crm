export interface MetricCardItem {
  label: string
  value: string | number
  detail?: string
  tone?: 'blue' | 'mint' | 'violet' | 'amber'
}

export function MetricCards({ items, label = 'Indicateurs clés' }: { items: MetricCardItem[]; label?: string }) {
  if (items.length === 0) return null

  return (
    <section className="stats-grid" aria-label={label}>
      {items.map((item) => (
        <article className={`stat-card${item.tone ? ` stat-${item.tone}` : ''}`} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail && <small>{item.detail}</small>}
        </article>
      ))}
    </section>
  )
}
