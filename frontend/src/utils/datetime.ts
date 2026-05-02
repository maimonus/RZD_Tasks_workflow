export const isoToDateTimeLocal = (iso?: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const dateTimeLocalToIso = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null

  return d.toISOString()
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export const formatIsoDateTimeRu = (iso?: string | null): string => {
  if (!iso) return 'Без дедлайна'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Без дедлайна'
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
