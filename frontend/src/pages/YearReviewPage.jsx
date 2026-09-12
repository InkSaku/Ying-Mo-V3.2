import { useState } from "react";
import { Link } from "react-router-dom";
import { CustomSelect } from "../components/CustomSelect";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { PostCard } from "../components/PostCard";
import { PersonalNav } from "../components/PersonalNav";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { api } from "../lib/api";

export function YearReviewPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  usePageMeta(`${year} 年度回顾`);
  const state = useAsyncData(() => api.get(`/home/year-in-review?year=${year}`), [year]);
  if (state.loading && !state.data) return <PageLoader label="正在整理年度回顾" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  const data = state.data;
  const years = Array.from({ length: Math.min(12, currentYear - 1999) }, (_, index) => currentYear - index);
  const maxMonthTotal = Math.max(1, ...data.months.map((item) => item.total));
  return <main className="page-shell personal-page-shell year-review-page" aria-busy={state.loading || undefined}>
    <PersonalNav />
    <header className="page-heading"><div><p className="section-kicker">Year in review</p><h1>{year} 年度回顾</h1><p>只使用你自己的记录，并继续服从当前 Collection 权限。</p></div><CustomSelect aria-label="回顾年份" value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</CustomSelect></header>
    <section className="year-review-stats" aria-label="年度统计">
      {[['记录', data.summary.total], ['Article', data.summary.articles], ['Note', data.summary.notes], ['影像', data.summary.media], ['活跃月份', data.summary.active_months], ['地点', data.summary.locations]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </section>
    <section className="content-section"><h2>月份轨迹</h2><div className="year-review-month-scroll" tabIndex="0" aria-label={`${year} 年各月记录数量`}><div className="year-review-months">{data.months.map((item) => <div key={item.month} className={item.total ? "active" : ""}><div className="year-review-month-bar" aria-hidden="true"><span style={{ height: `${Math.max(item.total ? 8 : 1, (item.total / maxMonthTotal) * 100)}%` }} /></div><span>{item.month} 月</span><strong>{item.total}</strong><small>{item.article} 篇文章<br />{item.note} 则随记</small></div>)}</div></div></section>
    {data.collections.length ? <section className="content-section"><h2>一起记录的 Collection</h2><div className="member-list">{data.collections.map((item) => <Link key={item.id} to={`/collections/${item.slug}`}>{item.name}<span>{item.count} 条</span></Link>)}</div></section> : null}
    {data.locations.length ? <section className="content-section"><h2>去过与写下的地方</h2><div className="tag-cloud">{data.locations.map((item) => <span key={item}>{item}</span>)}</div></section> : null}
    <section className="content-section"><h2>这一年的记录</h2>{data.highlights.length ? <div className="note-stream">{data.highlights.map((post) => <PostCard key={post.id} post={post} compact />)}</div> : <EmptyState title={`${year} 年还没有已发布记录`} description="草稿不会进入年度回顾。" />}</section>
  </main>;
}
