import BulletinPanel from '@/components/BulletinPanel';
import DeploySection from '@/components/DeploySection';
import GlobeLegend from '@/components/GlobeLegend';
import GlobeViewer from '@/components/GlobeViewer';
import NewsPanel from '@/components/NewsPanel';

export default function Home() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <GlobeViewer />
      <GlobeLegend />
      <BulletinPanel />
      <NewsPanel />
      <DeploySection />
    </div>
  );
}
