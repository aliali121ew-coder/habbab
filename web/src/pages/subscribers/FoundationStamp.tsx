import { useBranding } from '../../branding';
import { today } from '../../format';

// The foundation's stamp for the approval block of every printed sheet, headed like the
// signatures either side of it. It carries the printing date, so each copy is dated.
// A foundation without a stamp image keeps the dated block with an empty seal.
export function FoundationStamp() {
  const brand = useBranding();
  const printed = today().split('-').map(Number).join('-');
  return (
    <section className="seal-slot">
      <h4>الختم</h4>
      <div className="seal-stamp" role="img" aria-label={`ختم ${brand.name}، ${printed}`}>
        {brand.stamp && <img src={brand.stamp} alt="" />}
        <div>
          <bdi dir="ltr">{printed}</bdi>
          {brand.stamp_place && <small>{brand.stamp_place}</small>}
        </div>
      </div>
    </section>
  );
}
