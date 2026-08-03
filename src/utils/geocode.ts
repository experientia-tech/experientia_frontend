import api from '../api'
import type { LatLng } from '../components/LocationMap'

export interface GeocodeResult extends LatLng {
  label: string
  pincode?: string
}

export async function lookupIndianPincode(pincode: string): Promise<GeocodeResult> {
  const pin = pincode.trim()
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('Enter a valid 6-digit Indian pincode')
  }
  const { data } = await api.get<GeocodeResult>(`/geo/pincode/${pin}`, {
    meta: { silent: true, skipErrorDialog: true },
  })
  if (!data?.lat || !data?.lng) {
    throw new Error('Could not find that pincode on the map')
  }
  return data
}
