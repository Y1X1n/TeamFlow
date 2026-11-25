import { ProjectOverviewPage } from '@/features/overview/overview-page';

export default function ProjectOverviewRoute({ params }: { params: { id: string } }) {
  return (
    <>
      <ProjectOverviewPage projectId={params.id} />
    </>
  );
}
