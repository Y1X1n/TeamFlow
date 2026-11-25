import type { ReactNode } from 'react';

export default function AppGroupTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
