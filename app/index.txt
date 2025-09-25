import dynamic from 'next/dynamic'

// Dynamically import SpaceLegends with SSR disabled
const SpaceLegends = dynamic(() => import('../components/SpaceLegends'), {
  ssr: false,
})

export default function Home() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <SpaceLegends />
    </div>
  )
}