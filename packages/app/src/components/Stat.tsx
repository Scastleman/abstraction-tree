export interface StatProps {
  label: string;
  value: number;
}

export function Stat({ label, value }: StatProps) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
