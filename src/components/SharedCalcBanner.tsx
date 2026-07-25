interface Props {
  show: boolean;
  onDismiss: () => void;
}

// Sits above the calculator body when the page was opened via a `?share=`
// link — a free, read-only-by-convention view (nothing is disabled; the
// banner just frames it as someone else's shared calculation until dismissed).
export default function SharedCalcBanner({ show, onDismiss }: Props) {
  if (!show) return null;

  return (
    <div className="card shared-calc-banner">
      <span>
        <span aria-hidden="true">📤</span> You're viewing a shared calculation. Anything you change here becomes your own working copy — nothing is overwritten.
      </span>
      <button className="btn small" onClick={onDismiss}>Continue editing</button>
    </div>
  );
}
