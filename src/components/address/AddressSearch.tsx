'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface DistrictLink {
  ward: number
  label: string
}

interface AddressSearchProps {
  cityKey?: string
  cityName?: string
  districtLinks?: DistrictLink[]
  placeholder?: string
  browseLabel?: string
  zipSuggestions?: string[]
}

export default function AddressSearch({
  cityKey = 'chicago',
  cityName = 'this city',
  districtLinks = [],
  placeholder = 'Enter zip code',
  browseLabel = 'Browse by District',
  zipSuggestions = [],
}: AddressSearchProps) {
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const filteredZipSuggestions = address.length > 0 && address.length < 5
    ? zipSuggestions.filter((zip) => zip.startsWith(address)).slice(0, 12)
    : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address) return

    if (!/^\d{5}$/.test(address)) {
      setError('Enter a valid 5-digit ZIP code.')
      return
    }

    if (zipSuggestions.length > 0 && !zipSuggestions.includes(address)) {
      setError(`Enter a valid ZIP code for ${cityName}.`)
      return
    }

    setError('')

    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, cityKey }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Could not find that address')
        return
      }

      startTransition(() => {
        router.push(`/${cityKey}/ward/${data.ward}?address=${encodeURIComponent(data.formattedAddress)}&lat=${data.lat}&lng=${data.lng}`)
      })
    } catch {
      setError('Network error — please try again')
    }
  }

  const handleChange = (value: string) => {
    const nextValue = value.replace(/\D/g, '').slice(0, 5)
    setAddress(nextValue)

    if (!nextValue) {
      setError('')
      return
    }

    if (nextValue.length === 5 && zipSuggestions.length > 0 && !zipSuggestions.includes(nextValue)) {
      setError(`Enter a valid ZIP code for ${cityName}.`)
      return
    }

    setError('')
  }

  const selectZipCode = (zipCode: string) => {
    setAddress(zipCode)
    setError('')
  }

  return (
    <div className="w-full">
      <div className="relative w-full max-w-lg">
        <form onSubmit={handleSubmit} className="flex items-stretch gap-0 border border-gray-300 w-full">
          <input
            type="text"
            value={address}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-white border-r border-gray-300"
            disabled={isPending}
            autoComplete="postal-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
          />
          <button
            type="submit"
            disabled={isPending || address.length !== 5}
            className="bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-1.5 whitespace-nowrap"
          >
            {isPending ? 'Looking up...' : 'Find District'}
          </button>
        </form>

        {address.length > 0 && address.length < 5 && (
          <div className="absolute left-0 right-0 top-full z-10 border border-t-0 border-gray-300 bg-white shadow-sm">
            {filteredZipSuggestions.length > 0 ? (
              filteredZipSuggestions.map((zip) => (
                <button
                  key={zip}
                  type="button"
                  onClick={() => selectZipCode(zip)}
                  className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-blue-50"
                >
                  {zip}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No ZIP codes for {cityName} match that prefix.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}

      {districtLinks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 items-center">
          <span className="text-xs text-gray-400">{browseLabel}:</span>
          {districtLinks.map(({ ward, label }) => (
            <a
              key={ward}
              href={`/${cityKey}/ward/${ward}`}
              className="text-xs px-2 py-0.5 border border-gray-300 text-blue-700 hover:bg-blue-50 hover:border-blue-400"
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
