import { ChevronLeft, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="مسار الصفحة">
      <ol className="crumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="crumb-item">
              {index > 0 && <ChevronLeft size={14} className="crumb-sep" aria-hidden />}
              {/* Every item with a link stays clickable; the last item names the page itself. */}
              {item.href ? (
                <a href={item.href} className="crumb-link">
                  {item.href === '#/' && <Home size={14} aria-hidden />}
                  <span>{item.label}</span>
                </a>
              ) : (
                <span className="crumb-current" aria-current={isLast ? 'page' : undefined}>
                  {item.href === '#/' && <Home size={14} aria-hidden />}
                  <span>{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
