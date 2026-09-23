// 人员档案（资料层只读视图）：可服务区域、持有资格及有效期。
import { AREAS, PEOPLE, QUALIFICATIONS, areaName } from "../data/catalog";
import { daysUntil } from "../domain/time";

export function PersonRoster() {
  return (
    <section className="panel">
      <h2>人员与资格档案</h2>
      <div className="roster-grid">
        {PEOPLE.map((person) => (
          <article className="roster-card" key={person.id}>
            <div className="roster-head">
              <strong>{person.name}</strong>
              <span className="meta-text">
                {person.areaIds.map((id) => areaName(id)).join(" / ")}
              </span>
            </div>
            <ul className="qual-list">
              {person.qualifications.map((item) => {
                const remaining = daysUntil(item.expiresAt);
                const qualification = QUALIFICATIONS.find((q) => q.id === item.qualificationId);
                return (
                  <li key={item.qualificationId}>
                    <span>{qualification?.name ?? item.qualificationId}</span>
                    <span className={`badge ${remaining < 0 ? "badge-bad" : remaining <= 15 ? "badge-warn" : "badge-ok"}`}>
                      {remaining < 0 ? `已过期（${item.expiresAt}）` : `有效至 ${item.expiresAt}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
      <p className="hint">区域共 {AREAS.length} 个：{AREAS.map((area) => area.name).join("、")}。资格过期人员在过期日期之后的班次中判定为整班不成立。</p>
    </section>
  );
}
