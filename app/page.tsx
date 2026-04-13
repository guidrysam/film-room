'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markRoomHost } from '@/lib/room-host'

/** YouTube video IDs are 11 characters from this character set. */
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

function normalizeVideoId(segment: string | null | undefined): string | null {
  if (segment == null) return null
  const id = segment.trim()
  if (!YOUTUBE_ID_RE.test(id)) return null
  return id
}

/**
 * Parses common YouTube URL shapes and returns a clean 11-character video id, or null.
 */
function extractYouTubeVideoId(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    url = new URL(withScheme)
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase()

  if (host === 'youtu.be') {
    const first = url.pathname.split('/').filter(Boolean)[0] ?? ''
    return normalizeVideoId(first.split('?')[0])
  }

  const isYoutube =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com'

  if (!isYoutube) return null

  const { pathname, searchParams } = url

  if (pathname === '/watch' || pathname.startsWith('/watch/')) {
    return normalizeVideoId(searchParams.get('v'))
  }

  if (pathname.startsWith('/embed/')) {
    const rest = pathname.slice('/embed/'.length)
    const id = rest.split('/')[0] ?? ''
    return normalizeVideoId(id)
  }

  if (pathname.startsWith('/shorts/')) {
    const rest = pathname.slice('/shorts/'.length)
    const id = rest.split('/')[0] ?? ''
    return normalizeVideoId(id)
  }

  return null
}

export default function Home() {
  const [url, setUrl] = useState('')
  const router = useRouter()

  const createRoom = () => {
    if (!url) return

    const roomId = Math.random().toString(36).substring(2, 8)
    const videoId = extractYouTubeVideoId(url)

    if (!videoId) {
      alert('Invalid YouTube link')
      return
    }

    markRoomHost(roomId)
    router.push(`/room/${roomId}?video=${encodeURIComponent(videoId)}`)
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white px-4">
      <h1 className="text-4xl font-bold mb-6 text-center">
        Film Room
      </h1>

      <p className="mb-6 text-center text-gray-400">
        Watch film together, anywhere
      </p>

      <input
        type="text"
        placeholder="Paste YouTube link"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 bg-white px-3 py-2 text-black caret-black scheme-light placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <button
        onClick={createRoom}
        className="bg-blue-600 px-6 py-3 rounded font-semibold"
      >
        Start Session
      </button>
    </div>
  )
}
