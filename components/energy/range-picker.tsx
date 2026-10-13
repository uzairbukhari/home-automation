export function RangePicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="range-picker" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          aria-pressed={value === id}
          className={value === id ? 'active' : ''}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
