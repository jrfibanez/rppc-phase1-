import Link from 'next/link'
export const dynamic = 'force-static'
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">You are offline</h1>
        <p className="mt-2 text-sm text-stone-600">This page hasn&apos;t been saved on this device yet. You can still log activities and tickets; they will sync when you reconnect.</p>
        <Link href="/activities" className="btn-primary mt-4">Log an activity</Link>
      </div>
    </main>
  )
}
