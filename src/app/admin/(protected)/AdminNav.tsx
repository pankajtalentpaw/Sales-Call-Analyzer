'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CONFIG_LINKS = [
  { href: '/admin/employees',      label: 'Employees' },
  { href: '/admin/analysis-heads', label: 'Analysis Heads' },
  { href: '/admin/call-scenarios', label: 'Call Scenarios' },
  { href: '/admin/master-files',   label: 'Master Files' },
]

const OPS_LINKS = [
  { href: '/calls',   label: 'Call Library' },
  { href: '/analyze', label: 'Analyze' },
]

function NavLink({ href, label, pathname }: { href: string; label: string; pathname: string }) {
  const active = pathname === href || pathname.startsWith(href + '/')
  return (
    <Link
      href={href}
      className={`flex items-center px-3 py-2 text-sm rounded-lg transition-colors ${
        active
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {label}
    </Link>
  )
}

export default function AdminNav() {
  const pathname = usePathname()
  return (
    <div className="space-y-5">
      <div>
        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Configuration</p>
        <div className="space-y-0.5">
          {CONFIG_LINKS.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} pathname={pathname} />
          ))}
        </div>
      </div>

      <div>
        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Operations</p>
        <div className="space-y-0.5">
          {OPS_LINKS.map(({ href, label }) => (
            <NavLink key={href} href={href} label={label} pathname={pathname} />
          ))}
        </div>
      </div>
    </div>
  )
}
