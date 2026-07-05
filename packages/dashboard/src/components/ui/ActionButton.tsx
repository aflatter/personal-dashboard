import { Button } from "@base-ui/react/button";

/**
 * A quiet mono action like "✓ erledigt" / "✓ geprüft": muted at rest, tinted
 * on hover. Built on Base UI's unstyled Button primitive.
 */
export function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className="tnum text-[12px] text-muted bg-transparent border-0 p-0 cursor-pointer flex-none transition-colors duration-150 hover:text-success"
    >
      {label}
    </Button>
  );
}
