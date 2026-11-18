import { today } from '../../format';

// The foundation's stamp for the approval block of every printed sheet, headed like the
// signatures either side of it. It carries the printing date, so each copy is dated.
export function FoundationStamp() {
  const printed = today().split('-').map(Number).join('-');
  return (
    <section className="seal-slot">
      <h4>الختم</h4>
      <div className="seal-stamp" role="img" aria-label={`ختم مؤسسة أحباب الحسين الثقافية الخيرية، ${printed}`}>
        <img src="/stamp.png" alt="" />
        <div>
          <bdi dir="ltr">{printed}</bdi>
          <small>بابل - قضاء الهاشمية</small>
        </div>
      </div>
    </section>
  );
}
