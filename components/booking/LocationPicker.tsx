'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LocateFixed, MapPin, Search, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  KITCHEN,
  distanceKm,
  formatPinnedAddress,
  parsePinnedAddress,
} from '@/lib/kitchen'

const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#F6E3D3] text-sm text-[#2B1D16]/60">
      Loading map…
    </div>
  ),
})

type Props = {
  /** Stored value: "Address [pin: lat, lng]" or '' */
  value: string
  onChange: (value: string) => void
  inputClass: string
  notesPlaceholder?: string
}

type Hit = { display_name: string; lat: string; lon: string }

async function reverse(lat: number, lng: number): Promise<string> {
  const r = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`,
    { headers: { 'Accept-Language': 'en' } }
  )
  if (!r.ok) throw new Error('reverse failed')
  const j = await r.json()
  return j.display_name ?? ''
}

export function LocationPicker({ value, onChange, inputClass, notesPlaceholder }: Props) {
  const parsed = parsePinnedAddress(value)
  const [center, setCenter] = useState({
    lat: parsed?.lat ?? KITCHEN.lat,
    lng: parsed?.lng ?? KITCHEN.lng,
  })
  const [address, setAddress] = useState(parsed?.address ?? '')
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(
    parsed ? { lat: parsed.lat, lng: parsed.lng } : null
  )
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNext = useRef(true) // ignore the initial moveend

  const commit = useCallback(
    (addr: string, lat: number, lng: number) => {
      setAddress(addr)
      setPin({ lat, lng })
      onChange(addr ? formatPinnedAddress(addr, lat, lng) : '')
    },
    [onChange]
  )

  const handleMoveEnd = useCallback(
    (lat: number, lng: number) => {
      if (skipNext.current && !parsed) {
        skipNext.current = false
        return
      }
      skipNext.current = false
      setPin({ lat, lng })
      if (timer.current) clearTimeout(timer.current)
      // debounce: Nominatim allows ~1 request/second
      timer.current = setTimeout(async () => {
        setBusy(true)
        setError('')
        try {
          commit(await reverse(lat, lng), lat, lng)
        } catch {
          setError('Could not look up the address. You can type it below.')
          commit(address, lat, lng)
        } finally {
          setBusy(false)
        }
      }, 900)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit, parsed?.lat]
  )

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const search = async () => {
    if (query.trim().length < 3) return
    setSearching(true)
    setError('')
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ph&q=${encodeURIComponent(query)}`
      )
      const j: Hit[] = await r.json()
      setHits(j)
      if (j.length === 0) setError('No matching places found.')
    } catch {
      setError('Search is unavailable right now. Drag the map instead.')
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError('Location is not supported on this device.')
    navigator.geolocation.getCurrentPosition(
      (p) => setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Location permission denied.')
    )
  }

  const km = pin ? distanceKm(KITCHEN.lat, KITCHEN.lng, pin.lat, pin.lng) : null

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#2B1D16]/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
            placeholder="Search a place or street"
            className={`${inputClass} pl-9`}
          />
        </div>
        <Button
          type="button"
          onClick={search}
          disabled={searching}
          className="h-[42px] rounded-lg bg-[#C8431B] text-white hover:bg-[#A93615]"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
        </Button>
      </div>

      {hits.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-[#E8D8C4] bg-white">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button
                type="button"
                onClick={() => {
                  setCenter({ lat: Number(h.lat), lng: Number(h.lon) })
                  setHits([])
                }}
                className="w-full px-3 py-2 text-left text-sm text-[#2B1D16] hover:bg-[#F6E3D3]"
              >
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative isolate z-0 h-72 overflow-hidden rounded-xl border border-[#E8D8C4]">
        <LocationMap center={center} onMoveEnd={handleMoveEnd} />
        {/* fixed center pin; the map moves underneath it */}
        <MapPin
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] h-10 w-10 -translate-x-1/2 -translate-y-full fill-[#C8431B] text-white drop-shadow-lg"
          strokeWidth={1.5}
        />
        <button
          type="button"
          onClick={useMyLocation}
          className="absolute bottom-3 right-3 z-[1000] flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#C8431B] shadow-md hover:bg-[#F6E3D3]"
        >
          <LocateFixed className="h-4 w-4" /> Use my location
        </button>
      </div>

      <div className="rounded-lg bg-[#F6E3D3] p-3 text-sm text-[#2B1D16]">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#C8431B]">
          Drop-off location
        </p>
        <p className="mt-1 flex items-start gap-2">
          {busy && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
          <span>{address || 'Move the map to place the pin on your drop-off point.'}</span>
        </p>
        {km !== null && (
          <p className="mt-1 text-xs text-[#2B1D16]/70">
            About {km.toFixed(1)} km from the kitchen
          </p>
        )}
      </div>

      <input
        type="text"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value)
          if (pin) onChange(e.target.value ? formatPinnedAddress(e.target.value, pin.lat, pin.lng) : '')
        }}
        placeholder={notesPlaceholder ?? 'Edit address / add unit, floor or landmark'}
        className={inputClass}
      />
      {error && <p className="text-xs text-[#C8431B]">{error}</p>}
    </div>
  )
}
