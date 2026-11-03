'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

type Props = {
  center: { lat: number; lng: number }
  onMoveEnd: (lat: number, lng: number) => void
}

function Events({ onMoveEnd }: { onMoveEnd: Props['onMoveEnd'] }) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter()
      onMoveEnd(c.lat, c.lng)
    },
  })
  return null
}

function Recenter({ center }: { center: Props['center'] }) {
  const map = useMap()
  useEffect(() => {
    const c = map.getCenter()
    if (Math.abs(c.lat - center.lat) > 1e-6 || Math.abs(c.lng - center.lng) > 1e-6) {
      map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng])
  return null
}

export default function LocationMap({ center, onMoveEnd }: Props) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={16}
      scrollWheelZoom
      className="z-0 h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Events onMoveEnd={onMoveEnd} />
      <Recenter center={center} />
    </MapContainer>
  )
}
