"use client";

// Adapted from Spectrum UI's DataTable (Apache-2.0).
// Source: https://github.com/arihantcodes/spectrum-ui/blob/main/components/spectrumui/data-table.tsx
// Folio changes: retain column/value, stable blank-last sorting and pagination;
// use native table controls and Folio styling, without selection or animations.
// License and attribution: THIRD-PARTY-NOTICES.md and LICENSES/spectrum-ui.txt.
import { useId, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import "./spectrum-data-table.css";

export type DataTableValue = string | number | boolean | Date | null | undefined;
export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell?: (row: T, index: number) => ReactNode;
  value?: (row: T) => DataTableValue;
  sortable?: boolean;
  numeric?: boolean;
}
type DataTableSort = { columnId: string; direction: "asc" | "desc" };

function isEmpty(value: DataTableValue) { return value === null || value === undefined || value === ""; }
function compare(a: DataTableValue, b: DataTableValue) {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}
function readValue<T>(column: DataTableColumn<T>, row: T): DataTableValue {
  return column.value ? column.value(row) : (row as Record<string, DataTableValue>)[column.id];
}

export function DataTable<T>({ data, columns, rowId, caption, pageSize = 12, defaultSort,
  renderDetail, emptyState = "No results match these filters." }: {
  data: readonly T[];
  columns: DataTableColumn<T>[];
  rowId: (row: T) => string;
  caption: string;
  pageSize?: number;
  defaultSort?: DataTableSort;
  renderDetail?: (row: T) => ReactNode;
  emptyState?: ReactNode;
}) {
  const [sort, setSort] = useState<DataTableSort | null>(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const id = useId();
  const sorted = useMemo(() => {
    if (!sort) return data;
    const column = columns.find(item => item.id === sort.columnId);
    if (!column) return data;
    const direction = sort.direction === "asc" ? 1 : -1;
    // Equal values retain source order. Unknown results stay last in both directions.
    return [...data].sort((a, b) => {
      const left = readValue(column, a), right = readValue(column, b);
      const leftEmpty = isEmpty(left), rightEmpty = isEmpty(right);
      if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
      return compare(left, right) * direction;
    });
  }, [data, columns, sort]);
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * size, (safePage + 1) * size);
  return <div className="spectrum-table">
    <div className="spectrum-table-scroll" tabIndex={0} role="region" aria-label={caption}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map(column => <th key={column.id} scope="col" className={column.numeric ? "numeric" : undefined}
          aria-sort={sort?.columnId === column.id ? sort.direction === "asc" ? "ascending" : "descending" : column.sortable ? "none" : undefined}>
          {column.sortable ? <button type="button" onClick={() => {
            setSort(current => ({ columnId: column.id, direction: current?.columnId === column.id && current.direction === "asc" ? "desc" : "asc" }));
            setPage(0);
          }}>{column.header}{sort?.columnId === column.id ? sort.direction === "asc" ? <ArrowUp size={13}/> : <ArrowDown size={13}/> : <ArrowUpDown size={13}/>}</button> : column.header}
        </th>)}{renderDetail && <th scope="col"><span className="sr-only">Details</span></th>}</tr></thead>
        <tbody>{visible.length ? visible.map((row, index) => {
          const key = rowId(row), detailId = `${id}-${key}`;
          return <TableRow key={key} row={row} index={index} columns={columns} detailId={detailId}
            expanded={expanded === key} renderDetail={renderDetail} toggle={() => setExpanded(current => current === key ? null : key)}/>;
        }) : <tr><td colSpan={columns.length + (renderDetail ? 1 : 0)} className="spectrum-table-empty">{emptyState}</td></tr>}</tbody>
      </table>
    </div>
    <nav className="spectrum-table-pagination" aria-label={`${caption} pagination`}>
      <p role="status">{sorted.length ? `${safePage * size + 1}–${Math.min(sorted.length, (safePage + 1) * size)} of ${sorted.length}` : "0 results"}</p>
      <div><button type="button" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16}/></button>
      <span>Page {safePage + 1} of {pageCount}</span>
      <button type="button" aria-label="Next page" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={16}/></button></div>
    </nav>
  </div>;
}

function TableRow<T>({row,index,columns,expanded,detailId,renderDetail,toggle}:{row:T;index:number;columns:DataTableColumn<T>[];expanded:boolean;detailId:string;renderDetail?: (row:T)=>ReactNode;toggle:()=>void}) {
  return <>
    <tr>{columns.map((column, columnIndex) => {
      const value = readValue(column, row);
      const content = column.cell ? column.cell(row, index) : isEmpty(value) ? "Not available" : value instanceof Date ? value.toISOString().slice(0,10) : String(value);
      return columnIndex === 0 ? <th scope="row" key={column.id}>{content}</th> : <td key={column.id} className={column.numeric ? "numeric" : undefined}>{content}</td>;
    })}{renderDetail && <td><button type="button" className="spectrum-table-details" aria-expanded={expanded} aria-controls={detailId} onClick={toggle}>{expanded ? "Hide details" : "View details"}</button></td>}</tr>
    {renderDetail && expanded && <tr><td id={detailId} colSpan={columns.length + 1} className="spectrum-table-detail">{renderDetail(row)}</td></tr>}
  </>;
}
