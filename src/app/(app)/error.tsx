'use client'
import Link from 'next/link'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">This page isn&apos;t available</h1>
      <p className="mt-2 text-sm text-stone-600">Your role may not have access to it, or something went wrong while loading. If you think you should have access, ask an administrator.</p>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" className="btn-secondary" onClick={() => reset()}>Try again</button>
        <Link href="/" className="btn-primary">Go to dashboard</Link>
      </div>
    </div>
  )
}
