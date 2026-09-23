// 页面：人员与资格台账（只读资料，供排班与替班判定使用）

import { PEOPLE } from "../data/people";
import { SEED_DATE } from "../data/seeds";

export function PeoplePanel() {
  return (
    <section className="panel">
      <h2>人员与资格</h2>
      <div className="people-list">
        {PEOPLE.map((person) => (
          <div className="person" key={person.id}>
            <strong>{person.name}</strong>
            <div className="quals">
              {person.qualifications.map((q) => {
                const expired = q.expiresAt < SEED_DATE;
                return (
                  <span className={`qual ${expired ? "qual-expired" : ""}`} key={q.area}>
                    {q.area}·{q.title}
                    <em>{expired ? `已于${q.expiresAt}过期` : `至${q.expiresAt}`}</em>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="hint">资格以 {SEED_DATE} 为业务基准日判定；排班时按班次日期另行校验。</p>
    </section>
  );
}
