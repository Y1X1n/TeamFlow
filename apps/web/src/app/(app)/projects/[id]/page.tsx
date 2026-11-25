import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { BoardPage } from '@/features/board/board-page';

function BoardRouteFallback() {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">正在加载项目看板</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-96 w-80 shrink-0" />
        ))}
      </div>
    </div>
  );
}

export default function ProjectBoardRoute({ params }: { params: { id: string } }) {
  return (
    <>
      <Suspense fallback={<BoardRouteFallback />}>
        <BoardPage projectId={params.id} />
      </Suspense>
    </>
  );
}
