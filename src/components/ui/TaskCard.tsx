import type { TaskLineView } from '../../domain';
import { Card } from './Card';
import { cx } from './cx';
import { ActionButton } from './ActionButton';
import { SuccessBadge } from './SuccessBadge';
import { StatusSentence } from './StatusSentence';
import { CardFooterHairline } from './CardFooterHairline';

/**
 * The shared day-counter card (Mietbuchhaltung / Firmenbelege): title + a
 * done-badge or "✓ erledigt" action, the status sentence, and a "zuletzt" footer.
 */
export function TaskCard({
  title,
  line,
  doneLabel,
  actionLabel,
  onAction,
  titleTruncate = false,
}: {
  title: string;
  line: TaskLineView;
  doneLabel: string;
  actionLabel: string;
  onAction: () => void;
  titleTruncate?: boolean;
}) {
  return (
    <Card>
      <div className="flex justify-between items-center gap-2 mb-[6px]">
        <div
          className={cx(
            'text-[15px] font-semibold min-w-0',
            titleTruncate && 'whitespace-nowrap overflow-hidden text-ellipsis',
          )}
        >
          {title}
        </div>
        {line.done ? (
          <SuccessBadge label={doneLabel} />
        ) : (
          <ActionButton label={actionLabel} onClick={onAction} />
        )}
      </div>
      <StatusSentence line={line} />
      <CardFooterHairline>zuletzt {line.last}</CardFooterHairline>
    </Card>
  );
}
