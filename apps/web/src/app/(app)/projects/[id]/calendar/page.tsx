import { ProjectCalendarPage } from '@/features/calendar/project-calendar-page';

export default function ProjectCalendarRoute({ params }: { params: { id: string } }) {
  return <ProjectCalendarPage projectId={params.id} />;
}
