import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { PageHeader, Section } from '@/components/ui'
import { ImportForm } from './import-form'

export const metadata: Metadata = { title: 'Import' }

export default async function ImportPage() {
  await requireUser('import:run')
  return (
    <>
      <PageHeader title="Import from CSV" subtitle="Run a dry run first: it checks every row and writes nothing." />
      <Section title="Upload"><ImportForm /></Section>
    </>
  )
}
