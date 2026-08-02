import L from 'leaflet'

type ClusterGroup = L.LayerGroup & {
  addLayer: (layer: L.Layer) => ClusterGroup
}

type LeafletWithCluster = typeof L & {
  markerClusterGroup?: (opts?: Record<string, unknown>) => ClusterGroup
}

let markerClusterReady: Promise<void> | null = null

/** leaflet.markercluster is UMD and expects `window.L`. */
export function ensureMarkerCluster(): Promise<void> {
  const existing = (window as Window & { L?: LeafletWithCluster }).L
  if (typeof window !== 'undefined' && typeof existing?.markerClusterGroup === 'function') {
    return Promise.resolve()
  }
  if (markerClusterReady) return markerClusterReady
  markerClusterReady = (async () => {
    ;(window as Window & { L: typeof L }).L = L
    await import('leaflet.markercluster/dist/leaflet.markercluster.js')
    await import('leaflet.markercluster/dist/MarkerCluster.css')
    await import('leaflet.markercluster/dist/MarkerCluster.Default.css')
    const clusterFn = (window as Window & { L?: LeafletWithCluster }).L?.markerClusterGroup
    if (typeof clusterFn !== 'function') {
      markerClusterReady = null
      throw new Error('leaflet.markercluster failed to register')
    }
  })().catch((err) => {
    markerClusterReady = null
    throw err
  })
  return markerClusterReady
}

export function markerClusterGroup(options?: Record<string, unknown>): ClusterGroup {
  const leaflet = window.L as LeafletWithCluster
  if (typeof leaflet?.markerClusterGroup !== 'function') {
    throw new Error('leaflet.markercluster is not available')
  }
  return leaflet.markerClusterGroup(options)
}
