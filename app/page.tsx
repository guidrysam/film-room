'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [url, setUrl] = useState('')
  const router = useRouter()

  const createRoom = () => {
    if (!url) return

    // generate simple room id
    const roomId = Math.random().toString(36).substring(2, 8)

    // extract YouTube video ID
    let videoId = ''

    if (url.includes('youtube.com/watch?v=')) {
      videoId = url.split('v=')[1].split('&')[0]
    } else if (url.includes('youtu.be/')) {
      videoId = url.split('youtu.be/')[1]
    }

    if (!videoId) {
      alert('Invalid YouTube link')
      return
    }

    router.push(`/room/${roomId}?video=${videoId}`)
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
        className="w-full max-w-md p-3 rounded text-black mb-4"
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