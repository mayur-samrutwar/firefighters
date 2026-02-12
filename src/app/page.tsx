import BulletinPanel from '@/components/BulletinPanel';
import DeploySection from '@/components/DeploySection';
import GlobeLegend from '@/components/GlobeLegend';
import GlobeViewer from '@/components/GlobeViewer';
import LeaderboardPanel from '@/components/LeaderboardPanel';
import NewsPanel from '@/components/NewsPanel';
import WorldEventsPanel from '@/components/WorldEventsPanel';

export default function Home() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <GlobeViewer />
      <GlobeLegend />
      <WorldEventsPanel />
      <BulletinPanel />
      <LeaderboardPanel />
      <NewsPanel />
      <DeploySection />
    </div>
  );
}
