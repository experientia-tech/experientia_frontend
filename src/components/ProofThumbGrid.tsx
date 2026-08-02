import { memo, useState } from 'react'
import type { ProofImage } from '../types'
import { formatCoords, formatDateTime, slotLabel } from '../types'
import { mediaUrl } from '../utils/mediaUrl'
import { LocationMap } from './LocationMap'

interface ProofThumbGridProps {
  images: ProofImage[]
  interactive: boolean
  onSelect?: (slot: string) => void
  showMapToggle?: boolean
  /** Fallback when an individual proof was saved without GPS */
  fallbackLatitude?: number | null
  fallbackLongitude?: number | null
}

export const ProofThumbGrid = memo(function ProofThumbGrid({
  images,
  interactive,
  onSelect,
  showMapToggle = true,
  fallbackLatitude = null,
  fallbackLongitude = null,
}: ProofThumbGridProps) {
  const [mapSlots, setMapSlots] = useState<Record<string, boolean>>({})

  const toggleMap = (slot: string) => {
    setMapSlots((prev) => ({ ...prev, [slot]: !prev[slot] }))
  }

  return (
    <div className="proof-grid large">
      {images.map((img) => {
        const lat = img.latitude ?? fallbackLatitude
        const lng = img.longitude ?? fallbackLongitude
        const hasCoords =
          lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        const mapOpen = !!mapSlots[img.slot]

        return (
          <figure key={img.slot} className="proof-thumb">
            <button
              type="button"
              className="proof-thumb-btn"
              onClick={() => interactive && onSelect?.(img.slot)}
              disabled={!interactive}
            >
              <img src={mediaUrl(img.url)} alt={slotLabel(img.slot)} loading="lazy" decoding="async" />
            </button>
            <figcaption>
              <strong>{slotLabel(img.slot)}</strong>
              {img.captured_at && (
                <span className="proof-thumb-meta muted">Captured {formatDateTime(img.captured_at)}</span>
              )}
              {hasCoords && (
                <span className="proof-thumb-meta coords-inline">{formatCoords(lat, lng)}</span>
              )}
              {showMapToggle && (
                <button
                  type="button"
                  className={`btn ghost small proof-thumb-map-toggle${mapOpen ? ' active' : ''}`}
                  onClick={() => toggleMap(img.slot)}
                  disabled={!hasCoords}
                  title={hasCoords ? undefined : 'No GPS data for this photo'}
                >
                  {mapOpen ? 'Hide map view' : 'Enable map view'}
                </button>
              )}
              {mapOpen && hasCoords && (
                <div className="proof-thumb-map">
                  <LocationMap
                    center={{ lat: lat!, lng: lng! }}
                    value={{ lat: lat!, lng: lng! }}
                    markers={[{ lat: lat!, lng: lng!, label: slotLabel(img.slot) }]}
                    interactive={false}
                    height={160}
                    zoom={16}
                  />
                </div>
              )}
              {showMapToggle && !hasCoords && (
                <span className="proof-thumb-meta muted">No GPS data captured</span>
              )}
            </figcaption>
          </figure>
        )
      })}
    </div>
  )
})
