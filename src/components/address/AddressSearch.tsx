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
        <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
          <input
            type="text"
            value={address}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            className="field-input min-w-0 flex-1 sm:border-r-0"
            disabled={isPending}
            autoComplete="postal-code"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={5}
          />
          <button
            type="submit"
            disabled={isPending || address.length !== 5}
            className="field-button whitespace-nowrap"
          >
            {isPending ? 'Looking up' : `Find ${browseLabel.replace(/^Browse by /, '')}`}
          </button>
        </form>

        {address.length > 0 && address.length < 5 && (
          <div className="absolute left-0 right-0 top-full z-10 border-x-2 border-b-2 border-[var(--line)] bg-[var(--panel)]">
            {filteredZipSuggestions.length > 0 ? (
              filteredZipSuggestions.map((zip) => (
                <button
                  key={zip}
                  type="button"
                  onClick={() => selectZipCode(zip)}
                  className="block w-full border-t border-[rgba(17,17,17,0.16)] px-4 py-3 text-left text-sm text-[var(--ink)] transition hover:bg-[rgba(0,87,255,0.05)]"
                >
                  {zip}
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-[var(--muted)]">
                No ZIP codes for {cityName} match that prefix.
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--red)]">{error}</p>
      )}

      {districtLinks.length > 0 && (
        <div className="district-link-section">
          <span className="district-link-label">{browseLabel}</span>
          {districtLinks.map(({ ward, label }) => (
            <a
              key={ward}
              href={`/${cityKey}/ward/${ward}`}
              className="link-plain pill-link"
            >
              {label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
