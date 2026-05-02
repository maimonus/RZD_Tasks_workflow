import { useEffect, useMemo, useRef, useState } from 'react'

export type SearchableSelectOption<TValue extends string | number> = {
  value: TValue
  label: string
  keywords?: string
}

type Props<TValue extends string | number> = {
  label: string
  options: SearchableSelectOption<TValue>[]
  value: TValue | ''
  onChange: (value: TValue | '') => void
  placeholder?: string
  disabled?: boolean
  noResultsLabel?: string
  emptyLabel?: string
}

const normalize = (value: string) => value.trim().toLowerCase()

function SearchableSelect<TValue extends string | number>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Поиск...',
  disabled = false,
  noResultsLabel = 'Ничего не найдено',
  emptyLabel = 'Выберите...',
}: Props<TValue>) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const selectedLabel = useMemo(() => {
    if (value === '') return ''
    return options.find((option) => option.value === value)?.label ?? ''
  }, [options, value])

  const filtered = useMemo(() => {
    const q = normalize(query)
    if (!q) return options
    return options.filter((option) => {
      const haystack = `${option.label} ${option.keywords ?? ''}`
      return normalize(haystack).includes(q)
    })
  }, [options, query])

  const open = () => {
    if (disabled) return
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      const node = containerRef.current
      if (!node) return
      if (event.target instanceof Node && !node.contains(event.target)) {
        close()
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setActiveIndex(0)
  }, [isOpen, query])

  const commit = (next: TValue) => {
    onChange(next)
    close()
  }

  return (
    <div ref={containerRef} className="relative">
      <span className="text-sm font-medium text-slate-700">{label}</span>

      <button
        className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm outline-none transition focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-100"
        disabled={disabled}
        onClick={() => {
          setIsOpen((current) => !current)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        type="button"
      >
        <span className={selectedLabel ? 'text-slate-900' : 'text-slate-400'}>{selectedLabel || emptyLabel}</span>
        <span className="text-slate-400">▾</span>
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-3">
            <input
              ref={inputRef}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-sky-400"
              onChange={(event) => {
                setQuery(event.target.value)
              }}
              onFocus={open}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  close()
                  return
                }

                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)))
                  return
                }

                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setActiveIndex((current) => Math.max(current - 1, 0))
                  return
                }

                if (event.key === 'Enter') {
                  event.preventDefault()
                  const picked = filtered[activeIndex]
                  if (picked) {
                    commit(picked.value)
                  }
                }
              }}
              placeholder={placeholder}
              type="text"
              value={query}
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            <button
              className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                value === '' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => {
                onChange('')
                close()
              }}
              type="button"
            >
              Очистить выбор
            </button>

            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">{noResultsLabel}</div>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <button
                    key={String(option.value)}
                    className={`mt-1 w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                      isSelected ? 'bg-sky-50 text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                    } ${isActive ? 'ring-2 ring-sky-200' : ''}`}
                    onClick={() => commit(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default SearchableSelect
