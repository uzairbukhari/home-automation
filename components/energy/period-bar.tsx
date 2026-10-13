import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Previous and next arrows around the period being shown, with a way back to now. */
export function PeriodBar({
  label,
  onPrev,
  onNext,
  nextDisabled = false,
  onNow,
  nowLabel = 'Today',
  prevDisabled = false,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  prevDisabled?: boolean;
  onNow?: () => void;
  nowLabel?: string;
}) {
  return (
    <div className="period-bar" role="group" aria-label="Period">
      <button
        type="button"
        className="icon-button"
        aria-label="Previous period"
        onClick={onPrev}
        disabled={prevDisabled}
      >
        <ChevronLeft />
      </button>
      <strong aria-live="polite">{label}</strong>
      <button type="button" className="icon-button" aria-label="Next period" onClick={onNext} disabled={nextDisabled}>
        <ChevronRight />
      </button>
      {onNow && (
        <button type="button" className="period-now" onClick={onNow} disabled={nextDisabled}>
          {nowLabel}
        </button>
      )}
    </div>
  );
}
