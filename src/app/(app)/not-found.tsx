import Link from 'next/link'
export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-6 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-stone-600">This record doesn&apos;t exist, or your role can&apos;t see it.</p>
      <Link href="/" className="btn-primary mt-4">Go to dashboard</Link>
    </div>
  )
}
