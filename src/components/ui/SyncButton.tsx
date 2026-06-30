import { Button } from '@base-ui/react/button';

/** The inbox "↺ sync" control; shows "sync…" while a refresh is in flight. */
export function SyncButton({ syncing, onClick }: { syncing: boolean; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      disabled={syncing}
      className="tnum text-[11px] text-muted bg-transparent border-0 px-0 py-[2px] cursor-pointer whitespace-nowrap transition-colors duration-150 hover:text-persoenlich"
    >
      ↺ {syncing ? 'sync…' : 'sync'}
    </Button>
  );
}
