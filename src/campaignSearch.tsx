import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

interface CampaignSearchValue {
  query: string
  setQuery: (q: string) => void
}

const CampaignSearchContext = createContext<CampaignSearchValue | null>(null)

export function CampaignSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('')
  const value = useMemo(() => ({ query, setQuery }), [query])
  return (
    <CampaignSearchContext.Provider value={value}>{children}</CampaignSearchContext.Provider>
  )
}

export function useCampaignSearch() {
  const ctx = useContext(CampaignSearchContext)
  if (!ctx) throw new Error('useCampaignSearch must be used within CampaignSearchProvider')
  return ctx
}

export function useCampaignSearchOptional() {
  return useContext(CampaignSearchContext)
}
