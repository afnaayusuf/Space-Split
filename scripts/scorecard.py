"""Writes the WaveForce score card: the planner's crates against the boxes the works really used.

    npm run scorecard     (runs scripts/scorecard.ts for the data, then this)

Reads scorecard/scorecard.json and writes scorecard/WaveForce-scorecard.xlsx. Every score
in the workbook is a formula over the sizes, so it recalculates when a size or the line
tolerance (Summary sheet) is changed.
"""

import json
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import ColorScaleRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

SRC = Path("scorecard/scorecard.json")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "scorecard/WaveForce-scorecard.xlsx")

FONT = "Arial"
BASE = Font(name=FONT, size=10)
BOLD = Font(name=FONT, size=10, bold=True)
HEAD = Font(name=FONT, size=10, bold=True, color="FFFFFF")
TITLE = Font(name=FONT, size=16, bold=True)
SUB = Font(name=FONT, size=10, italic=True, color="555555")
INPUT = Font(name=FONT, size=10, color="0000FF", bold=True)
HEAD_FILL = PatternFill("solid", fgColor="1F4E78")
REAL_FILL = PatternFill("solid", fgColor="E2EFDA")
PLAN_FILL = PatternFill("solid", fgColor="DDEBF7")
SCORE_FILL = PatternFill("solid", fgColor="FFF2CC")
INPUT_FILL = PatternFill("solid", fgColor="FFFF00")
THIN = Side(style="thin", color="BFBFBF")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
SET_NAME = {"train": "Tuning", "test": "Held out"}
GOOD = PatternFill("solid", fgColor="C6EFCE")
BAD = PatternFill("solid", fgColor="FFC7CE")

data = json.loads(SRC.read_text())
orders = data["orders"]
wb = Workbook()


def header(ws, row, cols, fills=None):
    for i, name in enumerate(cols, 1):
        c = ws.cell(row=row, column=i, value=name)
        c.font = HEAD
        c.fill = HEAD_FILL
        c.alignment = CENTER
        c.border = BOX
    ws.row_dimensions[row].height = 42


def widths(ws, ws_widths):
    for i, w in enumerate(ws_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def style_body(ws, first, last, ncols, fills=None):
    for r in range(first, last + 1):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            cell.font = BASE
            cell.border = BOX
            if fills and c in fills:
                cell.fill = fills[c]


def fit_scale(ws, ref):
    ws.conditional_formatting.add(ref, ColorScaleRule(start_type="num", start_value=0, start_color="F8696B", mid_type="num", mid_value=0.5, mid_color="FFEB84", end_type="num", end_value=1, end_color="63BE7B"))


# ---------------------------------------------------------------- Boxes: every real box paired with a planned crate
bx = wb.active
bx.title = "Boxes"
cols = ["PRN", "Set", "Pair", "Real box no.", "Real long side (in)", "Real short side (in)", "Real height (in)", "Real gross (kg)", "Real pieces",
        "Planned crate no.", "Planned long side (in)", "Planned short side (in)", "Planned height (in)", "Planned gross (kg)", "Planned pieces",
        "Long side match", "Short side match", "Height match", "Box fit", "Planned crate kind"]
header(bx, 1, cols)
r = 2
for o in orders:
    for i, p in enumerate(o["pairs"], 1):
        real, plan = p["real"], p["plan"]
        row = [o["prn"], SET_NAME[o["split"]], i]
        row += [real["no"], real["L"], real["B"], real["H"], real["kg"], real["pcs"]] if real else ["none"] + [None] * 5
        row += [plan["no"], plan["L"], plan["B"], plan["H"], plan["kg"], plan["pcs"]] if plan else ["none"] + [None] * 5
        for c, v in enumerate(row, 1):
            bx.cell(row=r, column=c, value=v)
        for c, (a, b) in zip((16, 17, 18), (("E", "K"), ("F", "L"), ("G", "M"))):
            bx.cell(row=r, column=c, value=f'=IF(AND(N({a}{r})>0,N({b}{r})>0),MIN({a}{r},{b}{r})/MAX({a}{r},{b}{r}),0)')
        bx.cell(row=r, column=19, value=f"=P{r}*Q{r}*R{r}")
        bx.cell(row=r, column=20, value=plan.get("kind") if plan else None)
        r += 1
last_box = r - 1
style_body(bx, 2, last_box, len(cols), {c: REAL_FILL for c in range(4, 10)} | {c: PLAN_FILL for c in range(10, 16)} | {c: SCORE_FILL for c in range(16, 20)})
for rr in range(2, last_box + 1):
    for c in (5, 6, 7, 11, 12, 13):
        bx.cell(row=rr, column=c).number_format = "0.0"
    for c in (8, 14):
        bx.cell(row=rr, column=c).number_format = "0.0"
    for c in (16, 17, 18, 19):
        bx.cell(row=rr, column=c).number_format = "0%"
fit_scale(bx, f"S2:S{last_box}")
widths(bx, [11, 9, 6, 8, 9, 9, 9, 9, 8, 9, 10, 10, 10, 10, 9, 9, 9, 9, 9, 12])
bx.freeze_panes = "D2"
bx.auto_filter.ref = f"A1:T{last_box}"
bx.conditional_formatting.add(f"T2:T{last_box}", FormulaRule(formula=['T2="Custom"'], fill=BAD))
bx["T1"].comment = Comment("Standard: picked from the standard sizes (Settings → Crates · standard sizes). Custom: no standard size takes it, so it is made to measure.", "WaveForce")
bx["S1"].comment = Comment("Box fit = long side match × short side match × height match. Each match is the smaller of the two sizes over the larger, so a crate 10 % too big every way scores 0.9 × 0.9 × 0.9 = 73 %. A box with no partner scores 0.", "WaveForce")

# ---------------------------------------------------------------- Lines: every gasket line, its real box and the planner's crate
ln = wb.create_sheet("Lines")
cols = ["PRN", "Set", "SL", "Description", "Qty", "Type (as read)", "OD (mm)", "ID (mm)", "Thk (mm)",
        "Real box(es)", "Real box shown", "Real long (in)", "Real short (in)", "Real height (in)",
        "Planner crate(s)", "Planned crate shown", "Planned long (in)", "Planned short (in)", "Planned height (in)",
        "Size fit", "Within tolerance?"]
header(ln, 1, cols)
r = 2
for o in orders:
    for l in o["lines"]:
        rb, pc = l["realBox"], l["planCrate"]
        row = [o["prn"], SET_NAME[o["split"]], l["sl"], l["desc"], l["qty"], l["family"] or "not read", l["od"], l["id"], l["thk"],
               l["realBoxes"], rb["no"] if rb else None, rb["L"] if rb else None, rb["B"] if rb else None, rb["H"] if rb else None,
               l["planCrates"] or ("not planned" if not l["read"] else ""), pc["no"] if pc else None, pc["L"] if pc else None, pc["B"] if pc else None, pc["H"] if pc else None]
        for c, v in enumerate(row, 1):
            ln.cell(row=r, column=c, value=v)
        ratio = lambda a, b: f"IF(AND(N({a}{r})>0,N({b}{r})>0),MIN({a}{r},{b}{r})/MAX({a}{r},{b}{r}),0)"
        ln.cell(row=r, column=20, value=f"={ratio('L', 'Q')}*{ratio('M', 'R')}*{ratio('N', 'S')}")
        close = lambda a, b: f"ABS({a}{r}-{b}{r})<=Summary!$C$6*MAX({a}{r},{b}{r})"
        ln.cell(row=r, column=21, value=f'=IF(OR(N(L{r})=0,N(Q{r})=0),"No",IF(AND({close("L", "Q")},{close("M", "R")},{close("N", "S")}),"Yes","No"))')
        r += 1
last_line = r - 1
style_body(ln, 2, last_line, len(cols), {c: REAL_FILL for c in range(10, 15)} | {c: PLAN_FILL for c in range(15, 20)} | {20: SCORE_FILL, 21: SCORE_FILL})
for rr in range(2, last_line + 1):
    ln.cell(row=rr, column=4).alignment = WRAP
    for c in (12, 13, 14, 17, 18, 19):
        ln.cell(row=rr, column=c).number_format = "0.0"
    ln.cell(row=rr, column=20).number_format = "0%"
fit_scale(ln, f"T2:T{last_line}")
ln.conditional_formatting.add(f"U2:U{last_line}", FormulaRule(formula=[f'U2="Yes"'], fill=GOOD))
ln.conditional_formatting.add(f"U2:U{last_line}", FormulaRule(formula=[f'U2="No"'], fill=BAD))
widths(ln, [11, 9, 5, 48, 7, 9, 9, 9, 7, 9, 8, 8, 8, 8, 10, 9, 9, 9, 9, 8, 10])
ln.freeze_panes = "E2"
ln.auto_filter.ref = f"A1:U{last_line}"
ln["K1"].comment = Comment("When a line was packed in more than one box, or the planner split it over more than one crate, the closest real box / planned crate pair is shown. 'Real box(es)' and 'Planner crate(s)' list them all.", "WaveForce")
ln["U1"].comment = Comment("Yes when the planned crate is within the tolerance on the Summary sheet (cell C6) of the real box on every side: long, short and height.", "WaveForce")

# ---------------------------------------------------------------- Orders: one row per order
od = wb.create_sheet("Orders")
cols = ["PRN", "Customer", "Date", "Set", "Real boxes", "Planned crates", "Right number of boxes?", "Order score", "Real gross (kg)", "Planned gross (kg)", "Gasket lines", "Lines within tolerance", "Line match", "Score as a new order"]
header(od, 1, cols)
for i, o in enumerate(orders):
    r = i + 2
    vals = [o["prn"], o["customer"], o["date"], SET_NAME[o["split"]]]
    for c, v in enumerate(vals, 1):
        od.cell(row=r, column=c, value=v)
    B = f"Boxes!$A$2:$A${last_box}"
    L = f"Lines!$A$2:$A${last_line}"
    od.cell(row=r, column=5, value=f'=COUNTIFS({B},A{r},Boxes!$D$2:$D${last_box},"<>none")')
    od.cell(row=r, column=6, value=f'=COUNTIFS({B},A{r},Boxes!$J$2:$J${last_box},"<>none")')
    od.cell(row=r, column=7, value=f'=IF(E{r}=F{r},"Yes","No")')
    od.cell(row=r, column=8, value=f"=IF(MAX(E{r},F{r})=0,0,SUMIF({B},A{r},Boxes!$S$2:$S${last_box})/MAX(E{r},F{r}))")
    od.cell(row=r, column=9, value=f"=SUMIF({B},A{r},Boxes!$H$2:$H${last_box})")
    od.cell(row=r, column=10, value=f"=SUMIF({B},A{r},Boxes!$N$2:$N${last_box})")
    od.cell(row=r, column=11, value=f"=COUNTIF({L},A{r})")
    od.cell(row=r, column=12, value=f'=COUNTIFS({L},A{r},Lines!$U$2:$U${last_line},"Yes")')
    od.cell(row=r, column=13, value=f"=IF(K{r}=0,0,L{r}/K{r})")
    od.cell(row=r, column=14, value=None if o.get("asNew") is None else o["asNew"] / 100)
last_order = len(orders) + 1
style_body(od, 2, last_order, len(cols), {8: SCORE_FILL, 13: SCORE_FILL, 14: SCORE_FILL})
for rr in range(2, last_order + 1):
    od.cell(row=rr, column=8).number_format = "0.0%"
    od.cell(row=rr, column=13).number_format = "0%"
    od.cell(row=rr, column=14).number_format = "0.0%"
    od.cell(row=rr, column=9).number_format = "#,##0"
    od.cell(row=rr, column=10).number_format = "#,##0"
fit_scale(od, f"H2:H{last_order}")
fit_scale(od, f"N2:N{last_order}")
od.conditional_formatting.add(f"G2:G{last_order}", FormulaRule(formula=['G2="Yes"'], fill=GOOD))
od.conditional_formatting.add(f"G2:G{last_order}", FormulaRule(formula=['G2="No"'], fill=BAD))
widths(od, [11, 30, 11, 9, 8, 9, 11, 9, 10, 10, 8, 10, 9, 11])
od.freeze_panes = "B2"
od.auto_filter.ref = f"A1:N{last_order}"
od["N1"].comment = Comment("The order's score when its own box sizes are taken off the standard list first (unless another order used the same size), as for a new order whose exact box is not on the list. Worked out by the planner (scripts/scorecard.ts), not by a formula: the planner itself has to run without those sizes.", "WaveForce")
od["H1"].comment = Comment("Total box fit of the order's pairs (Boxes sheet) over the larger of the two box counts. 100 % = same number of boxes at the same sizes.", "WaveForce")
od["I1"].comment = Comment("Blank real weights (order 261000021, boxes 6 and 7) are not on the packing list and count as 0 here.", "WaveForce")

# ---------------------------------------------------------------- Summary
sm = wb.create_sheet("Summary", 0)
sm["B2"] = "WaveForce score card"
sm["B2"].font = TITLE
sm["B3"] = f"The planner's crates against the boxes the works really used · {len(orders)} orders from the signed packing check lists · made {data['made']} with the shipped settings"
sm["B3"].font = SUB

sm["B5"] = "Setting you can change"
sm["B5"].font = BOLD
sm["B6"] = "Line tolerance (each side)"
sm["C6"] = 0.10
sm["C6"].font = INPUT
sm["C6"].fill = INPUT_FILL
sm["C6"].number_format = "0%"
sm["C6"].border = BOX
sm["D6"] = "A line counts as matched when its planned crate is within this share of its real box on every side. Type a new value (e.g. 20%) and the line scores update."
sm["D6"].font = SUB
sm["D6"].alignment = WRAP
sm.merge_cells("D6:I6")
sm.row_dimensions[6].height = 28
sm["B6"].alignment = Alignment(vertical="top")
sm["C6"].alignment = Alignment(horizontal="center", vertical="top")
sm["C6"].comment = Comment("Input: the only cell on this sheet meant to be edited. 10 % is a starting point chosen for this score card, not a works rule.", "WaveForce")

cols = ["", "Orders", "Box score", "Right number of boxes", "Gasket lines", "Lines within tolerance", "Line match", "Average line size fit", "Box score as a new order"]
for i, name in enumerate(cols[1:], 3):
    c = sm.cell(row=8, column=i, value=name)
    c.font = HEAD
    c.fill = HEAD_FILL
    c.alignment = CENTER
    c.border = BOX
sm.cell(row=8, column=2, value="Orders scored").font = HEAD
sm.cell(row=8, column=2).fill = HEAD_FILL
sm.cell(row=8, column=2).alignment = CENTER
sm.cell(row=8, column=2).border = BOX
sm.row_dimensions[8].height = 32
O = f"Orders!$D$2:$D${last_order}"
LS = f"Lines!$B$2:$B${last_line}"
rows = [("Tuning orders", '"Tuning"'), ("Held-out orders", '"Held out"'), ("All orders", '"*"')]
for i, (name, crit) in enumerate(rows):
    r = 9 + i
    sm.cell(row=r, column=2, value=name)
    sm.cell(row=r, column=3, value=f"=COUNTIF({O},{crit})")
    sm.cell(row=r, column=4, value=f"=AVERAGEIF({O},{crit},Orders!$H$2:$H${last_order})")
    sm.cell(row=r, column=5, value=f'=COUNTIFS({O},{crit},Orders!$G$2:$G${last_order},"Yes")/C{r}')
    sm.cell(row=r, column=6, value=f"=COUNTIF({LS},{crit})")
    sm.cell(row=r, column=7, value=f'=COUNTIFS({LS},{crit},Lines!$U$2:$U${last_line},"Yes")')
    sm.cell(row=r, column=8, value=f"=IF(F{r}=0,0,G{r}/F{r})")
    sm.cell(row=r, column=9, value=f"=AVERAGEIF({LS},{crit},Lines!$T$2:$T${last_line})")
    sm.cell(row=r, column=10, value=f"=AVERAGEIF({O},{crit},Orders!$N$2:$N${last_order})")
    for c in range(2, 11):
        cell = sm.cell(row=r, column=c)
        cell.font = BOLD if c in (4, 8) else BASE
        cell.border = BOX
    for c in (4, 5, 8, 9, 10):
        sm.cell(row=r, column=c).number_format = "0.0%"
    sm.cell(row=r, column=4).fill = SCORE_FILL
    sm.cell(row=r, column=8).fill = SCORE_FILL
sm.cell(row=11, column=2).font = BOLD

notes = [
    ("How to read it", None),
    ("Box score", "For each order the planner packs the lines; its crates and the real boxes are each sorted biggest first and paired off. A pair scores long side match × short side match × height match, each match being the smaller size over the larger (Boxes sheet). A box with no partner scores 0. The order's score is its pairs' total over the larger box count, so 100 % means the same number of boxes at the same sizes. This is the score the test suite (npm test) checks."),
    ("Line match", "Each gasket line is followed into the crate the planner put it in and compared with the box the works used for it (Lines sheet). It is matched when every side is within the tolerance above."),
    ("Average line size fit", "The same size comparison as a box, per line: 100 % when the line's planned crate is exactly its real box."),
    ("Standard sizes", "Crates are picked from a list of standard sizes (every box size on the packing check lists) instead of made to measure: each is the smallest size that takes its gaskets, and only gaskets no standard size takes get a custom crate (Boxes sheet, last column). The box allowances (side 3 mm, floor and lid 10 mm, gap 3 mm, under the lid 15 mm) were calibrated on the 19 tuning orders only."),
    ("Box score as a new order", "Every order's own sizes are on the list, so the Box score can find the very box it is scored against. The last column takes each order's own sizes off the list first (unless another order used the same size): that is how the planner does for a new order whose exact box is not on the list, and the fairest figure to judge it by."),
    ("Tuning vs held out", "The settings were tuned on the 19 tuning orders. The 5 held-out orders were never used for tuning, so their scores are the best guide to how the planner does on orders it has not seen."),
    ("Why an order can miss its own box", "Even with its own box on the list, an order scores below 100 % when (a) the gaskets also fit a smaller standard box, which the planner picks while the packer used the bigger one (e.g. two R11 rings: 4×4×4 fits, the packer used 4×4×9 in 261000014); (b) the packer split the order into more boxes than needed, one per big gasket size (261000005, 010, 015, 022, 029); or (c) the real box is a few millimetres tighter than the planner allows (261000002, 004, 028). No fixed rule can match (a) and (b) every time, because the packing lists themselves are not consistent: that is why 98–99 % cannot be reached."),
    ("Sizes", "All box sizes are in inches, long side first, as written on the packing check lists; planned sizes are the planner's crates with the shipped settings. The calibration fits best when the written sizes are taken as almost the inside of the box (3 mm a side), so they may be inside sizes: worth confirming with the crate makers."),
    ("Left out", "Order 261000001 (a rubber sheet roll with no box). In 261000021 the R96 ring is beyond the planner's ring table, so the box holding only it is left out."),
]
r = 14
for title, text in notes:
    head = sm.cell(row=r, column=2, value=title)
    head.font = BOLD if text else Font(name=FONT, size=12, bold=True)
    head.alignment = Alignment(vertical="top")
    if text:
        sm.cell(row=r, column=3, value=text).font = BASE
        sm.merge_cells(start_row=r, start_column=3, end_row=r, end_column=9)
        sm.cell(row=r, column=3).alignment = WRAP
        sm.row_dimensions[r].height = 13.5 * max(1, -(-len(text) // 78)) + 6
    r += 1
widths(sm, [2, 24, 9, 11, 13, 10, 12, 10, 12, 12])
sm.sheet_view.showGridLines = False

for ws in wb.worksheets:
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    if ws.title != "Summary":
        ws.print_title_rows = "1:1"
    ws.sheet_properties.tabColor = {"Summary": "1F4E78", "Orders": "2E75B6", "Boxes": "70AD47", "Lines": "ED7D31"}[ws.title]

wb.save(OUT)
print(f"{OUT}: {len(orders)} orders, {last_box - 1} box pairs, {last_line - 1} lines")
