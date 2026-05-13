interface Props {
  agentLabel: string;
  models: string[];
  primary: string;
  onPrimaryChange: (value: string) => void;
}

export function AgentRoutingCard({ agentLabel, models, primary, onPrimaryChange }: Props) {
  return (
    <div className="rounded-lg border border-neutral-700 p-4 space-y-2">
      <p className="text-sm font-medium text-neutral-200">{agentLabel}</p>
      <select
        value={primary}
        onChange={(e) => onPrimaryChange(e.target.value)}
        className="w-full rounded border border-neutral-600 bg-neutral-800 text-sm text-neutral-100 px-2 py-1.5"
      >
        <option value="">未設定</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
