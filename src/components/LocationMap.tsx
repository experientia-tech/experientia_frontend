import { MapContainer, TileLayer, Marker, Circle, useMapEvents, Popup } from 'react-leaflet'
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
  center = { lat: 12.9716, lng: 77.5946 },
  zoom = 12,
  value,
  onChange,
  markers = [],
  radiusKm,
  height = 320,
  interactive = true,
}: Props) {
  const mapCenter = value || center
  const circleCenter = value || (radiusKm ? center : null)

  return (
    <div className="map-wrap" style={{ height }}>
      <MapContainer
        key={`${mapCenter.lat.toFixed(5)}-${mapCenter.lng.toFixed(5)}-${radiusKm ?? 0}`}
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={radiusKm ? 13 : zoom}
        style={{ height: '100%', width: '100%', borderRadius: 12 }}
        scrollWheelZoom={interactive}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {interactive && onChange && <ClickHandler onPick={onChange} />}
        {circleCenter && radiusKm ? (
          <Circle
            center={[circleCenter.lat, circleCenter.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#0f6b4c',
              fillColor: '#0f6b4c',
              fillOpacity: 0.12,
              weight: 2,
            }}
          />
        ) : null}
        {value && (
          <Marker position={[value.lat, value.lng]}>
            <Popup>
              Center · {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
              {radiusKm ? ` · ${radiusKm} km radius` : ''}
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
