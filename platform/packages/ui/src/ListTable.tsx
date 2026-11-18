import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Table, type TableColumnProps, type TableProps } from "antd";
import { useStickyHeaderOffset } from "./hooks/useStickyHeaderOffset";
import { useFreezePanes } from "./hooks/useFreezePanes";

// The table for every list page; a raw antd `<Table sticky=...>` fails scripts/check-list-tables.mjs.
//
// `<ListColumn minWidth={px}>` sets a real `min-width` on header and body cells (a floor only; antd's `width` stays a preferred
// width, so never size it below the content; an icon column needs ~46px). Without it a string title gets the header minimum
// (longest word + icons + padding), which also keeps antd's separate sticky header table aligned with sparse body columns.
//
// Supplies the sticky offset and horizontal scroll (override with `sticky` / `scroll`) and, on a tall desktop viewport
// (min-height 1000px), freezes everything above the table under the app header (utils/useFreezePanes.ts).
// `tableLayout="fixed"` sizes nothing: every column needs a width.

type ListColumnProps<T> = TableColumnProps<T> & { minWidth?: number };

// Same component as `Table.Column` (so antd reads it as a column); only the type adds `minWidth`, which ListTable consumes.
export const ListColumn = Table.Column as unknown as <T extends object = object>(props: ListColumnProps<T>) => ReactElement | null;

// antd th: 600 weight, 14px, 16px horizontal padding; the sort / filter icons sit next to the title.
const CELL_PADDING = 32;
const ICON_SPACE = 20;

let measureContext: CanvasRenderingContext2D | null | undefined;
const textWidth = (text: string) => {
  if (measureContext === undefined) {
    measureContext = document.createElement("canvas").getContext("2d");
    if (measureContext) measureContext.font = `600 14px ${getComputedStyle(document.body).fontFamily}`;
  }
  return measureContext ? measureContext.measureText(text).width : text.length * 8;
};

// Minimum content width of a header: its longest word (the title can wrap between words) + padding + icons.
const headerMinWidth = (title: string, sorter: unknown, filtered: boolean) => {
  const longestWord = Math.max(...title.split(/\s+/).map(textWidth));
  return Math.ceil(longestWord + CELL_PADDING + (sorter ? ICON_SPACE : 0) + (filtered ? ICON_SPACE : 0));
};

const withMinWidth = (column: ReactElement<ListColumnProps<object>>) => {
  const { title, minWidth, sorter, filters, filterDropdown, onCell, onHeaderCell } = column.props;
  const floor = minWidth ?? (typeof title === "string" && title.trim() ? headerMinWidth(title, sorter, !!(filters || filterDropdown)) : undefined);
  if (floor == null) return column;
  return cloneElement(column, {
    minWidth: undefined,
    onCell: (record: object, index?: number) => {
      const own = onCell?.(record, index);
      return { ...own, style: { minWidth: floor, ...own?.style } };
    },
    onHeaderCell: (col: unknown) => {
      const own = onHeaderCell?.(col as never);
      return { ...own, style: { minWidth: floor, ...own?.style } };
    },
  });
};

const withMinWidths = (nodes: ReactNode): ReactNode =>
  Children.toArray(nodes).map((child) => {
    if (!isValidElement(child)) return child;
    if (child.type === Fragment) return cloneElement(child, undefined, withMinWidths((child.props as { children?: ReactNode }).children));
    if (child.type === Table.Column) return withMinWidth(child as ReactElement<ListColumnProps<object>>);
    return child;
  });

export function ListTable<T extends object>({ children, ...props }: TableProps<T> & { children?: ReactNode }) {
  const stickyOffset = useStickyHeaderOffset();
  const frozenHeight = useFreezePanes();
  return (
    <Table<T> scroll={{ x: "max-content" }} sticky={{ offsetHeader: stickyOffset + frozenHeight }} {...props}>
      {props.tableLayout === "fixed" ? children : withMinWidths(children)}
    </Table>
  );
}
// `ListTable.Column` as in COMPASS's ListTable (the same Table.Column, with `minWidth`).
ListTable.Column = ListColumn;
