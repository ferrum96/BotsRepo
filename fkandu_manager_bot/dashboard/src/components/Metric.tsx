interface MetricProps {
  icon: string;
  label: string;
  value: string | number;
}

export function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="bg-white rounded-xl p-3 md:p-4 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 md:gap-3">
        <span className="text-xl md:text-2xl">{icon}</span>
        <div>
          <p className="text-[10px] md:text-xs text-gray-500">{label}</p>
          <p className="text-lg md:text-xl font-bold text-gray-800">{value}</p>
        </div>
      </div>
    </div>
  );
}
