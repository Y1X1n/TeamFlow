import { DashboardView } from '@/features/dashboard/dashboard-view';

interface HomePageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default function HomePage({ searchParams }: HomePageProps) {
  const createParam = searchParams?.create;
  const autoCreate = Array.isArray(createParam) ? createParam.includes('1') : createParam === '1';

  return (
    <>
      <DashboardView autoCreate={autoCreate} />
    </>
  );
}
