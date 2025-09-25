import dynamic from 'next/dynamic';
const SpaceLegends = dynamic(() => import('./SpaceLegends'), { ssr: false });
export default function Page() {
  return <SpaceLegends />;
}