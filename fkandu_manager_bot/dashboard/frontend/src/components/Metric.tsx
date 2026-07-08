interface MetricProps {
  icon: string;
  label: string;
  value: string | number;
}

export function Metric({ icon, label, value }: MetricProps) {
  return (
    <div className="bg-white rounded-xl p-5 md:p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 md:gap-4">
        <span className="text-2xl md:text-3xl">{icon}</span>
        <div>
          <p className="text-xs md:text-sm text-gray-500 leading-tight">{label}</p>
          <p className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}
