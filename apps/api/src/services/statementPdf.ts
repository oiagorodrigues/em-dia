import type { PayType, ScheduleKind } from "@emdia/shared";
import {
  describeSchedule,
  formatCents,
  formatDuration,
  handsMoney,
  monthName,
  parseYearMonth,
  PAYMENT_KIND_LABEL,
  weekdayOf,
} from "@emdia/shared";
import PDFDocument from "pdfkit";
import {
  brDate,
  checkOutText,
  dayStatus,
  paymentMethodText,
  WEEKDAY_SHORT,
  type StatementData,
  type StatementDay,
  type StatementPayment,
} from "./statement.ts";

/** The app's tokens (apps/web/src/styles/tokens.css), light theme. */
const COLOR = {
  ink: "#1a1c1e",
  ink2: "#5c6166",
  ink3: "#9a9ea3",
  rule: "#e3e3de",
  surface2: "#eeeeea",
  zebra: "#f7f7f4",
  brand: "#227a5e",
  brandWash: "#e3f0ea",
  brandInk: "#17523f",
  coral: "#d9573f",
  coralWash: "#fbe9e4",
  coralInk: "#b03f2a",
} as const;

const FONT = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" };
const MARGIN = 40;
/** Room kept at the bottom of every page for the footer. */
const FOOTER_SPACE = 4;

const RATE_UNIT: Record<PayType, string> = {
  hourly: "por hora",
  daily: "por diária",
  shift: "por plantão de 24h",
  biweekly: "por quinzena",
  monthly: "por mês",
};

/** Code points outside Latin-1 that the WinAnsi encoding of the built-in fonts still has. */
const WIN_ANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("").map((c) => c.codePointAt(0)!),
);

/**
 * The standard PDF fonts only encode WinAnsi. Anything else (emoji in a note, the minus sign)
 * would come out as garbage, so it is mapped to a close character or replaced.
 */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC").replace(/[\t\n\v\f\r ]+/g, " ")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) out += ch;
    else if (WIN_ANSI_EXTRA.has(code)) out += ch;
    else if (code === 0x2212) out += "-";
    else if (
      code === 0x202f ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x2000 && code <= 0x200a)
    )
      out += " ";
    else out += "?";
  }
  return out;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortDate = (date: string) => brDate(date).slice(0, 5);

function attendanceLabel(kind: ScheduleKind): string {
  return kind === "per_month" ? "Visitas" : "Dias trabalhados";
}

interface LedgerLine {
  label: string;
  hint?: string;
  value: string;
  tone?: "red" | "green";
}

/** The same lines as the month ledger on the time card. */
function ledgerLines({ summary: s, contract }: StatementData): LedgerLine[] {
  const kind = contract.schedule.kind;
  const rate: LedgerLine =
    s.payType === "hourly"
      ? {
          label: "Valor",
          hint: `${formatDuration(s.totalMinutes)} × ${formatCents(s.rateCents)}`,
          value: formatCents(s.grossCents),
        }
      : s.payType === "daily"
        ? {
            label: "Valor",
            hint:
              s.grossCents === s.daysWorked * s.rateCents
                ? `${s.daysWorked} × ${formatCents(s.rateCents)}`
                : `${s.daysWorked} diárias, em proporção às horas`,
            value: formatCents(s.grossCents),
          }
        : s.payType === "shift"
          ? {
              label: "Plantões",
              hint: `${formatDuration(s.totalMinutes)} ÷ 24h`,
              value: formatCents(s.grossCents),
            }
          : s.payType === "biweekly"
            ? {
                label: "Salário",
                hint: `2 × ${formatCents(s.rateCents)}`,
                value: formatCents(s.grossCents),
              }
            : { label: "Salário", value: formatCents(s.grossCents) };
  const attendance =
    kind === "on_demand" || s.expectedDays === 0
      ? String(s.daysWorked)
      : `${s.daysWorked} de ${s.expectedDays}`;
  return [
    { label: "Horas", value: formatDuration(s.totalMinutes) },
    { label: attendanceLabel(kind), value: attendance },
    ...(s.absences ? [{ label: "Faltas", value: String(s.absences), tone: "red" as const }] : []),
    ...(s.excused ? [{ label: "Faltas justificadas", value: String(s.excused) }] : []),
    ...(s.daysOff + s.holidays
      ? [{ label: "Folgas e feriados", value: String(s.daysOff + s.holidays) }]
      : []),
    rate,
    ...(s.nightBonusCents > 0
      ? [
          {
            label: "Adicional noturno",
            hint: `${formatDuration(s.nightMinutes)} × 20%`,
            value: `+ ${formatCents(s.nightBonusCents)}`,
          },
        ]
      : []),
    ...(s.absenceDeductionCents > 0
      ? [
          {
            label: "Desconto por faltas",
            hint: `${s.absences} × ${formatCents(Math.round(s.grossCents / 30))}`,
            value: `- ${formatCents(s.absenceDeductionCents)}`,
            tone: "red" as const,
          },
        ]
      : []),
    ...(s.adjustmentsCents
      ? [
          {
            label: "Gratificações, vale e descontos",
            value: `${s.adjustmentsCents > 0 ? "+" : "-"} ${formatCents(Math.abs(s.adjustmentsCents))}`,
            tone: s.adjustmentsCents < 0 ? ("red" as const) : undefined,
          },
        ]
      : []),
  ];
}

function combinado({ contract }: StatementData): string {
  const times =
    contract.expectedStart && contract.expectedEnd
      ? `, das ${contract.expectedStart} às ${contract.expectedEnd}`
      : "";
  return `${capitalize(describeSchedule(contract.schedule))}${times} · ${formatCents(contract.rateCents)} ${RATE_UNIT[contract.payType]}`;
}

interface Column<Row> {
  title: string;
  width: number;
  align?: "left" | "right";
  text: (row: Row) => string;
  color?: (row: Row) => string;
}

function paymentStatus(p: StatementPayment["payment"]): string {
  if (!handsMoney(p)) return "";
  if (!p.acknowledgedAt) return "Aguardando";
  return p.acknowledgedByRole === "employer" ? "Concluído" : "Recebido";
}

const DAY_COLUMNS: Column<StatementDay>[] = [
  { title: "Data", width: 56, text: (d) => brDate(d.date) },
  { title: "Dia", width: 28, text: (d) => WEEKDAY_SHORT[weekdayOf(d.date)] ?? "" },
  {
    title: "Situação",
    width: 76,
    text: dayStatus,
    color: (d) =>
      d.entry?.status === "absent" ? COLOR.coralInk : d.entry ? COLOR.ink : COLOR.ink3,
  },
  { title: "Entrada", width: 46, text: (d) => d.entry?.checkIn ?? "" },
  { title: "Saída", width: 58, text: (d) => (d.entry ? checkOutText(d.entry, shortDate) : "") },
  {
    title: "Pausa",
    width: 38,
    text: (d) => (d.entry?.status === "worked" ? `${d.entry.breakMinutes} min` : ""),
  },
  {
    title: "Horas",
    width: 38,
    text: (d) => (d.entry && d.entry.minutes > 0 ? formatDuration(d.entry.minutes) : ""),
  },
  {
    title: "Confirmado",
    width: 56,
    text: (d) => (d.entry ? (d.entry.confirmedAt ? "Sim" : "Não") : ""),
    color: (d) => (d.entry?.confirmedAt ? COLOR.brandInk : COLOR.ink3),
  },
  { title: "Observação", width: 0, text: (d) => d.entry?.note ?? "" },
];

const PAYMENT_COLUMNS: Column<StatementPayment>[] = [
  { title: "Data", width: 58, text: (p) => brDate(p.payment.paidOn) },
  { title: "Tipo", width: 82, text: (p) => PAYMENT_KIND_LABEL[p.payment.kind] },
  { title: "Como pagou", width: 110, text: paymentMethodText },
  {
    title: "Valor",
    width: 70,
    align: "right",
    text: (p) => formatCents(p.payment.amountCents),
  },
  {
    title: "Situação",
    width: 70,
    text: (p) => paymentStatus(p.payment),
    color: (p) => (p.payment.acknowledgedAt ? COLOR.brandInk : COLOR.ink3),
  },
  { title: "Observação", width: 0, text: (p) => p.payment.note ?? "" },
];

export function renderStatementPdf(
  data: StatementData,
  { compress = true }: { compress?: boolean } = {},
): Promise<Buffer> {
  const { contract, month } = data;
  const { year, month: m } = parseYearMonth(month);
  const title = `Extrato de ${monthName(m)} de ${year}`;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    compress,
    info: { Title: `${title} - ${contract.workerName}`, Creator: "em dia", Producer: "em dia" },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN - FOOTER_SPACE;
  let y = MARGIN;

  type TextOptions = PDFKit.Mixins.TextOptions;
  const write = (
    text: string,
    x: number,
    top: number,
    opts: TextOptions & { font?: string; size?: number; color?: string } = {},
  ) => {
    const { font = FONT.regular, size = 9, color = COLOR.ink, ...rest } = opts;
    doc.font(font).fontSize(size).fillColor(color).text(toWinAnsi(text), x, top, rest);
  };
  const measure = (text: string, w: number, font: string, size: number) =>
    doc
      .font(font)
      .fontSize(size)
      .heightOfString(toWinAnsi(text) || " ", { width: w });

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
  };
  const ensure = (height: number) => {
    if (y + height > bottom()) newPage();
  };

  // Header
  doc.font(FONT.bold).fontSize(18).fillColor(COLOR.ink);
  doc.text("em dia", left, y, { characterSpacing: -0.6, lineBreak: false });
  const markWidth = doc.widthOfString("em dia", { characterSpacing: -0.6 });
  doc.circle(left + markWidth + 3.5, y + 11.5, 2.2).fill(COLOR.coral);
  write(`Gerado em ${brDate(data.generatedAt.date)} às ${data.generatedAt.time}`, left, y + 6, {
    width,
    align: "right",
    size: 8,
    color: COLOR.ink3,
  });
  y += 38;
  write(title, left, y, { font: FONT.bold, size: 20 });
  y += 28;
  write(`${contract.workerName} · ${contract.householdName}`, left, y, {
    size: 11,
    color: COLOR.ink2,
  });
  y += 24;
  doc.rect(left, y, width, 0.75).fill(COLOR.rule);
  doc.rect(left, y - 0.5, 48, 1.75).fill(COLOR.brand);
  y += 16;

  const field = (label: string, value: string, x: number, w: number) => {
    write(label.toUpperCase(), x, y, {
      font: FONT.bold,
      size: 7,
      color: COLOR.ink3,
      characterSpacing: 0.6,
    });
    write(value, x, y + 11, { width: w, size: 10 });
    return 11 + measure(value, w, FONT.regular, 10);
  };
  const third = width / 3;
  y +=
    Math.max(
      field("Profissional", contract.workerName, left, third - 12),
      field("Contratante", contract.employerName, left + third, third - 12),
      field("Casa", contract.householdName, left + third * 2, third - 12),
    ) + 12;
  y += field("Combinado", combinado(data), left, width) + 22;

  // Summary
  const sectionTitle = (text: string) => {
    write(text, left, y, { font: FONT.bold, size: 12 });
    y += 22;
  };
  sectionTitle(`Conta de ${monthName(m)}`);
  const lines = ledgerLines(data);
  const lineH = 17;
  const pad = 12;
  const s = data.summary;
  const owed = s.balanceCents;
  const boxH = pad + lines.length * lineH + 8 + lineH * 2 + 8 + 26;
  ensure(boxH);
  const boxTop = y;
  y += pad;
  const inner = { x: left + pad, w: width - pad * 2 };
  const ledgerRow = (line: LedgerLine, bold = false) => {
    const font = bold ? FONT.bold : FONT.regular;
    write(line.label, inner.x, y, {
      font,
      size: 9.5,
      color: bold ? COLOR.ink : COLOR.ink2,
      lineBreak: false,
    });
    if (line.hint) {
      const labelW = doc.font(font).fontSize(9.5).widthOfString(toWinAnsi(line.label));
      write(line.hint, inner.x + labelW + 8, y + 1, {
        size: 8,
        color: COLOR.ink3,
        lineBreak: false,
      });
    }
    const color =
      line.tone === "red" ? COLOR.coralInk : line.tone === "green" ? COLOR.brandInk : COLOR.ink;
    write(line.value, inner.x, y, { width: inner.w, align: "right", font, size: 9.5, color });
    y += lineH;
  };
  for (const line of lines) ledgerRow(line);
  y += 2;
  doc.rect(inner.x, y, inner.w, 0.75).fill(COLOR.rule);
  y += 6;
  ledgerRow({ label: "Total devido", value: formatCents(s.dueCents) }, true);
  ledgerRow({
    label: "Já pago",
    value: `- ${formatCents(s.paidCents)}`,
    tone: s.paidCents > 0 ? "green" : undefined,
  });
  y += 8;
  doc.save();
  doc.roundedRect(left, boxTop, width, boxH, 6).clip();
  doc.rect(left, y, width, boxTop + boxH - y).fill(owed < 0 ? COLOR.coralWash : COLOR.brandWash);
  doc.restore();
  doc.roundedRect(left, boxTop, width, boxH, 6).lineWidth(0.75).stroke(COLOR.rule);
  write(owed < 0 ? "Pago a mais" : "Saldo a pagar", inner.x, y + 8, {
    font: FONT.bold,
    size: 11,
    color: owed < 0 ? COLOR.coralInk : COLOR.brandInk,
    lineBreak: false,
  });
  write(formatCents(Math.abs(owed)), inner.x, y + 8, {
    width: inner.w,
    align: "right",
    font: FONT.bold,
    size: 11,
    color: owed < 0 ? COLOR.coralInk : COLOR.brandInk,
  });
  y = boxTop + boxH + 8;
  if (data.openAdvancesCents > 0) {
    write(`Adiantamentos ainda a abater: ${formatCents(data.openAdvancesCents)}`, left, y, {
      size: 8.5,
      color: COLOR.ink2,
    });
    y += 14;
  }
  y += 18;

  function table<Row>(heading: string, columns: Column<Row>[], rows: Row[], empty: string) {
    const fixed = columns.reduce((sum, c) => sum + c.width, 0);
    const cols = columns.map((c) => ({ ...c, width: c.width || width - fixed }));
    const cellPad = 5;
    const size = 8.5;
    const headerH = 20;
    const rowHeight = (row: Row) =>
      Math.max(
        ...cols.map((c) => measure(c.text(row), c.width - cellPad * 2, FONT.regular, size)),
      ) +
      cellPad * 2;
    const header = () => {
      doc.rect(left, y, width, headerH).fill(COLOR.surface2);
      let x = left;
      for (const c of cols) {
        const label = c.title.toUpperCase();
        const spacing = 0.4;
        const w = doc.font(FONT.bold).fontSize(6.5).widthOfString(label, {
          characterSpacing: spacing,
        });
        const at = c.align === "right" ? x + c.width - cellPad - w : x + cellPad;
        write(label, at, y + 7, {
          font: FONT.bold,
          size: 6.5,
          color: COLOR.ink2,
          characterSpacing: spacing,
          lineBreak: false,
        });
        x += c.width;
      }
      y += headerH;
    };

    ensure(22 + headerH + (rows[0] ? rowHeight(rows[0]) : 20));
    sectionTitle(heading);
    if (rows.length === 0) {
      write(empty, left, y, { font: FONT.italic, size: 9, color: COLOR.ink2 });
      y += 30;
      return;
    }
    header();
    rows.forEach((row, i) => {
      const h = rowHeight(row);
      if (y + h > bottom()) {
        newPage();
        header();
      }
      if (i % 2 === 1) doc.rect(left, y, width, h).fill(COLOR.zebra);
      let x = left;
      for (const c of cols) {
        write(c.text(row), x + cellPad, y + cellPad, {
          width: c.width - cellPad * 2,
          align: c.align ?? "left",
          size,
          color: c.color?.(row) ?? COLOR.ink,
        });
        x += c.width;
      }
      y += h;
    });
    doc.rect(left, y, width, 0.75).fill(COLOR.rule);
    y += 28;
  }

  table(
    "Dias do mês",
    DAY_COLUMNS,
    data.days.filter((d) => d.entry || d.expected || d.unrecorded),
    "Nenhum dia registrado ou previsto neste mês.",
  );
  table(
    "Pagamentos do mês",
    PAYMENT_COLUMNS,
    data.payments,
    "Nenhum pagamento registrado para este mês.",
  );

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin would otherwise open a new page.
    doc.page.margins.bottom = 0;
    const footY = doc.page.height - 30;
    doc.rect(left, footY - 7, width, 0.5).fill(COLOR.rule);
    write(`Gerado pelo em dia · página ${i + 1} de ${range.count}`, left, footY, {
      width,
      align: "center",
      size: 7.5,
      color: COLOR.ink3,
      lineBreak: false,
    });
  }
  doc.end();
  return done;
}
