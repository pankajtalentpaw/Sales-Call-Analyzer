'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/analysis-heads', label: 'Analysis Heads' },
  { href: '/admin/call-scenarios', label: 'Call Scenarios' },
  { href: '/admin/master-files', label: 'Master Files' },
]

export default function AdminNav() {
  const pathname = usePathname()
  return (
    <>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
            pathname.startsWith(href)
              ? 'bg-blue-50 text-blue-700 font-medium'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          {label}
        </Link>
      ))}
    </>
  )
}
