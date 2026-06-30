import type { TaskLineView } from '../../domain';

/** "{pre}{em}{post}" with the emphasized middle colored by status. */
export function StatusSentence({ line }: { line: TaskLineView }) {
  return (
    <div className="text-[13px] text-secondary">
      {line.linePre}
      <span className="font-semibold" style={{ color: line.lineEmColor }}>
        {line.lineEm}
      </span>
      {line.linePost}
    </div>
  );
}
