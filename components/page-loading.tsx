export function PageLoading({label}:{label:string}){
  return <section className="page-loading" role="status" aria-busy="true" aria-label={label}>
    <div className="page-loading-label" aria-hidden="true"><span className="status-spinner"/>{label}…</div>
    <div className="page-loading-grid" aria-hidden="true">{Array.from({length:4},(_,i)=><div className="skeleton-card shimmer" key={i}><span/><span/><span/></div>)}</div>
    <div className="page-loading-list" aria-hidden="true">{Array.from({length:3},(_,i)=><div className="shimmer page-loading-row" key={i}/>)}</div>
  </section>;
}
