export function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="جاري تحميل ملف العائلة">
      <div className="fp-card h-44 animate-pulse p-6" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="fp-card h-72 animate-pulse" />
        <div className="fp-card h-72 animate-pulse" />
      </div>
      <div className="fp-card h-80 animate-pulse" />
    </div>
  );
}
