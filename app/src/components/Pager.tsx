/** Always takes the same height so the page size above it stays stable. */
export function Pager(props: { page: number; pageCount: number; onPage: (p: number) => void }) {
  return (
    <div className="pager">
      {props.pageCount > 1 && (
        <>
          <button disabled={props.page === 0} onClick={() => props.onPage(props.page - 1)}>◀</button>
          <span>{props.page + 1}/{props.pageCount}</span>
          <button disabled={props.page >= props.pageCount - 1} onClick={() => props.onPage(props.page + 1)}>▶</button>
        </>
      )}
    </div>
  );
}
