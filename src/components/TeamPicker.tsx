import { useMemo, useState, type ReactNode } from 'react'
import type { User } from '../types'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

interface TeamPickerProps {
  people: User[]
  selected: string[]
  onChange: (ids: string[]) => void
  emptyMessage?: ReactNode
  roleLabel?: string
}

export function TeamPicker({
  people,
  selected,
  onChange,
  emptyMessage,
  roleLabel = 'Member',
}: TeamPickerProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        p.phone.includes(q) ||
        p.first_name.toLowerCase().includes(q) ||
        p.last_name.toLowerCase().includes(q)
    )
  }, [people, query])

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((p) => selected.includes(p.id))

  const toggle = (id: string) => {
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    )
  }

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      const visible = new Set(filtered.map((p) => p.id))
      onChange(selected.filter((id) => !visible.has(id)))
    } else {
      const merged = new Set([...selected, ...filtered.map((p) => p.id)])
      onChange(Array.from(merged))
    }
  }

  if (!people.length) {
    return <div className="team-picker-empty">{emptyMessage}</div>
  }

  return (
    <div className="team-picker">
      <div className="team-picker-toolbar">
        <input
          className="team-picker-search"
          type="search"
          placeholder="Search by name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn ghost small" onClick={toggleAllVisible}>
          {allVisibleSelected ? 'Clear shown' : 'Select all shown'}
        </button>
      </div>

      <p className="team-picker-meta muted small">
        {selected.length} selected · {filtered.length} shown
      </p>

      <ul className="team-picker-list" role="listbox" aria-multiselectable="true">
        {filtered.length === 0 ? (
          <li className="team-picker-empty">No matches for “{query}”</li>
        ) : (
          filtered.map((person) => {
            const isSelected = selected.includes(person.id)
            return (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`team-picker-row${isSelected ? ' selected' : ''}`}
                  onClick={() => toggle(person.id)}
                >
                  <span className="team-picker-avatar" aria-hidden>
                    {initials(person.full_name)}
                  </span>
                  <span className="team-picker-info">
                    <strong>{person.full_name}</strong>
                    <span className="team-picker-phone">{person.phone}</span>
                  </span>
                  <span className="team-picker-role">{roleLabel}</span>
                  <span className={`team-picker-check${isSelected ? ' on' : ''}`} aria-hidden>
                    {isSelected ? '✓' : ''}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
