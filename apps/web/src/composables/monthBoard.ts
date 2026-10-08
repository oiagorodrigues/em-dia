import type { IsoDate, YearMonth } from "@emdia/shared";
import { entriesApi, teamApi } from "@/api";
import { queryKeys } from "@/api/keys.ts";
import { boardCells, type BoardRow } from "@/lib/board.ts";
import { useCachedRead, useResource } from "./resource.ts";

export interface MonthBoard {
  month: YearMonth;
  today: IsoDate;
  rows: BoardRow[];
}

/** The team's month (summaries) plus each person's entries, fetched in parallel. */
export function useMonthBoard(month: () => YearMonth) {
  const read = useCachedRead();
  return useResource(month, queryKeys.board, async (m): Promise<MonthBoard> => {
    const team = await read(queryKeys.team(m), () => teamApi.list(m));
    const items = team.items.filter((i) => !i.contract.archivedAt);
    const entries = await Promise.all(
      items.map((i) =>
        read(queryKeys.entries({ id: i.contract.id, month: m }), () =>
          entriesApi.list(i.contract.id, m).then((r) => r.entries),
        ),
      ),
    );
    return {
      month: m,
      today: team.today,
      rows: items.map((item, k) => ({
        item,
        cells: boardCells(m, entries[k]!, item.summary, item.contract, team.today),
      })),
    };
  });
}
