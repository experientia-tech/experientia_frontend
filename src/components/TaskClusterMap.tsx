import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLng } from './LocationMap'
import { ensureMarkerCluster, markerClusterGroup } from '../utils/leafletCluster'

export interface TaskMapPoint {
  id: string
  lat: number
  lng: number
  label: string
}

function clusterColor(count: number) {
  if (count >= 500) return '#22c55e'
  if (count >= 100) return '#eab308'
  return '#3b82f6'
}

function taskDotIcon() {
  return L.divIcon({
    className: 'task-point-marker',
    html: '<div class="task-point-dot"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

function buildMarkers(tasks: TaskMapPoint[]) {
  return tasks.map((t) => {
    const marker = L.marker([t.lat, t.lng], { icon: taskDotIcon() })
    marker.bindPopup(`<strong>${t.label}</strong><br/>${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`)
    return marker
  })
}

function ClusterLayer({
  tasks,
  center,
  radiusKm,
}: {
  tasks: TaskMapPoint[]
  center: LatLng
  radiusKm: number
}) {
  const map = useMap()
  const tasksKey = useMemo(
    () => tasks.map((t) => `${t.id}:${t.lat}:${t.lng}`).join('|'),
    [tasks]
  )

  useEffect(() => {
    let cancelled = false
    let layer: L.Layer | null = null

    const fitToTasks = () => {
      if (tasks.length > 0) {
        const bounds = L.latLngBounds(tasks.map((t) => [t.lat, t.lng] as [number, number]))
        bounds.extend([center.lat, center.lng])
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 })
      } else {
        map.setView([center.lat, center.lng], radiusKm ? 13 : 12)
      }
    }

    const addPlainGroup = () => {
      const group = L.layerGroup(buildMarkers(tasks))
      map.addLayer(group)
      return group
    }

    const mount = async () => {
      try {
        await ensureMarkerCluster()
        if (cancelled) return
        const group = markerClusterGroup({
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          maxClusterRadius: 52,
          disableClusteringAtZoom: 17,
          iconCreateFunction(cluster) {
            const count = cluster.getChildCount()
            const size = count < 10 ? 34 : count < 100 ? 40 : 46
            const color = clusterColor(count)
            return L.divIcon({
              html: `<div class="task-cluster-bubble" style="--cluster-color:${color};--cluster-size:${size}px"><span>${count}</span></div>`,
              className: 'task-cluster-marker',
              iconSize: [size, size],
            })
          },
        })
        buildMarkers(tasks).forEach((m) => group.addLayer(m))
        if (cancelled) return
        map.addLayer(group)
        layer = group
      } catch {
        if (cancelled) return
        layer = addPlainGroup()
      }
      if (!cancelled) fitToTasks()
    }

    void mount()

    return () => {
      cancelled = true
      if (layer) {
        try {
          map.removeLayer(layer)
        } catch {
          /* map may already be destroyed */
        }
      }
    }
  }, [map, tasksKey, center.lat, center.lng, radiusKm, tasks])

  return null
}

function MapControls({ center }: { center: LatLng }) {
  const map = useMap()
  const frameRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    frameRef.current = map.getContainer().closest('.task-cluster-map-frame') as HTMLElement | null
  }, [map])

  return (
    <div className="task-cluster-controls">
      <button type="button" aria-label="Zoom in" onClick={() => map.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => map.zoomOut()}>
        −
      </button>
      <button
        type="button"
        aria-label="Recenter map"
        onClick={() => map.setView([center.lat, center.lng], 13)}
        title="Recenter"
      >
        ⊕
      </button>
      <button
        type="button"
        aria-label="Full screen"
        onClick={() => {
          const el = frameRef.current
          if (!el) return
          if (document.fullscreenElement) void document.exitFullscreen()
          else void el.requestFullscreen()
        }}
      >
        ⤢
      </button>
    </div>
  )
}

interface TaskClusterMapProps {
  center: LatLng
  radiusKm: number
  tasks: TaskMapPoint[]
  totalCount: number
  height?: number | string
}

export function TaskClusterMap({
  center,
  radiusKm,
  tasks,
  totalCount,
  height = 520,
}: TaskClusterMapProps) {
  const onMap = tasks.length
  const tracked = totalCount

  // Only remount when the campaign center changes — not when task points load,
  // so markers can update in place without losing the map instance.
  const mapKey = useMemo(
    () => `${center.lat.toFixed(5)}-${center.lng.toFixed(5)}`,
    [center.lat, center.lng]
  )

  return (
    <div className="task-cluster-map-shell">
      <p className="task-cluster-map-heading">
        Showing {onMap} Of {tracked} Completed Tasks On Map
      </p>
      <div className="task-cluster-map-frame" style={{ height }}>
        <MapContainer
          key={mapKey}
          center={[center.lat, center.lng]}
          zoom={13}
          className="task-cluster-map"
          scrollWheelZoom
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <Circle
            center={[center.lat, center.lng]}
            radius={radiusKm * 1000}
            pathOptions={{
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.06,
              weight: 1.5,
              dashArray: '4 6',
            }}
          />
          <ClusterLayer tasks={tasks} center={center} radiusKm={radiusKm} />
          <MapControls center={center} />
        </MapContainer>

        <div className="task-cluster-legend">
          <p className="task-cluster-legend-title">
            <span className="legend-live-dot" aria-hidden />
            {tracked} Completed Tasks Tracked
          </p>
          <ul>
            <li>
              <span className="legend-swatch blue" /> &lt; 100 Tasks
            </li>
            <li>
              <span className="legend-swatch yellow" /> 100–500 Tasks
            </li>
            <li>
              <span className="legend-swatch green" /> 500+ Tasks
            </li>
          </ul>
          <p className="task-cluster-legend-hint">💡 Click clusters to zoom in</p>
        </div>
      </div>
    </div>
  )
}
