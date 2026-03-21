export const metadata = {
  title: 'SKF Admin',
  description: 'SKF Academy Admin Portal',
  manifest: '/admin-manifest.json',
  appleWebApp: {
    title: 'SKF Admin',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
}

export default function AdminLayout({ children }) {
  return <>{children}</>
}
