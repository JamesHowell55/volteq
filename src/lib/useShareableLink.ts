import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { decodeShareState } from './shareLink';

// Companion to the `?load=<id>` deep-link handling in SavedCalculations.tsx,
// but for `?share=<encoded>` links: the encoded state is self-contained and
// immutable (unlike a saved-calculation id, which points at a mutable
// Supabase row), so it's deliberately NOT stripped from the URL on load —
// reloading or re-sharing the same link keeps reproducing the same view.
export function useShareableLink(restoreInputs: (inp: Record<string, unknown>) => void) {
  const [searchParams, setSearchParams] = useSearchParams();
  const appliedRef = useRef(false);
  const shareParam = searchParams.get('share');
  const [isViewingShared, setIsViewingShared] = useState(!!shareParam);

  useEffect(() => {
    if (!shareParam || appliedRef.current) return;
    const decoded = decodeShareState(shareParam);
    if (!decoded) return;
    appliedRef.current = true;
    restoreInputs(decoded);
    setIsViewingShared(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareParam]);

  const dismiss = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('share');
    setSearchParams(next, { replace: true });
    setIsViewingShared(false);
  };

  return { isViewingShared, dismiss };
}
