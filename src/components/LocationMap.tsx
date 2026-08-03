import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

export interface LatLng {
  lat: number
  lng: number
}

function ClickHandler({ onPick }: { onPick: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

/** Pan/zoom without remounting the map (remounts were making clicks feel broken). */
function MapViewSync({
  target,
  zoom,
  radiusKm,
}: {
  target: LatLng
  zoom: number
  radiusKm?: number
}) {
  const map = useMap()
  const last = useRef<string>('')

  useEffect(() => {
    const key = `${target.lat.toFixed(5)},${target.lng.toFixed(5)},${zoom},${radiusKm ?? 0}`
    if (last.current === key) return
    last.current = key
    if (radiusKm && radiusKm > 0) {
      const meters = radiusKm * 1000
      map.fitBounds(
        L.latLng(target.lat, target.lng).toBounds(meters * 2.2),
        { animate: true, padding: [24, 24] }
      )
    } else {
      map.setView([target.lat, target.lng], zoom, { animate: true })
    }
  }, [target.lat, target.lng, zoom, radiusKm, map])

  return null
}

interface Props {
  center?: LatLng
  zoom?: number
  value?: LatLng | null
  onChange?: (pos: LatLng) => void
  markers?: Array<LatLng & { label?: string }>
  /** Radius in kilometres drawn as a circle around `value` or `center` */
  radiusKm?: number
  height?: number | string
  interactive?: boolean
}

export function LocationMap({
  center = { lat: 20.5937, lng: 78.9629 },
  zoom = 5,
  value,
  onChange,
  markers = [],
  radiusKm,
  height = 320,
  interactive = true,
}: Props) {
  const pin = value || null
  const viewTarget = pin || center
  const viewZoom = pin ? (radiusKm ? 13 : zoom) : zoom
  // Stable mount center — never remount MapContainer when the pin moves.
  const initialCenter = useMemo(() => viewTarget, [])

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={pin && radiusKm ? 13 : zoom}
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewSync target={viewTarget} zoom={viewZoom} radiusKm={pin ? radiusKm : undefined} />
        {interactive && onChange && <ClickHandler onPick={onChange} />}
        {pin && radiusKm ? (
          <Circle
            center={[pin.lat, pin.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#0f6b4c',
              fillColor: '#0f6b4c',
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ) : null}
        {pin && (
          <Marker position={[pin.lat, pin.lng]}>
            <Popup>
              Campaign center · {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              {radiusKm ? ` · ${radiusKm} km capture zone` : ''}
            </Popup>
          </Marker>
        )}
        {markers.map((m, i) => (
          <Marker key={i} position={[m.lat, m.lng]}>
            {m.label && <Popup>{m.label}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
