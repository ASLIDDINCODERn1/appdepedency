"""
xlsx_to_json.py
Converts sheets from an Excel file to JSON files.

Usage:
    python xlsx_to_json.py                        # uses defaults below
    python xlsx_to_json.py data/Olmosh.xlsx       # all sheets
    python xlsx_to_json.py data/Olmosh.xlsx Son Sifat  # specific sheets
"""

import sys
import json
import pandas as pd
from pathlib import Path


DEFAULT_FILE = "data/Olmoshvaravish.xlsx"
DEFAULT_SHEETS = ["Son", "Sifat"]


def sheet_to_json(xlsx_path: str, sheet_name: str, output_dir: Path) -> Path:
    df = pd.read_excel(xlsx_path, sheet_name=sheet_name)

    # Replace NaN/NaT with None so JSON serialises cleanly
    df = df.where(pd.notnull(df), None)

    records = df.to_dict(orient="records")

    out_file = output_dir / f"{sheet_name}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2, default=str)

    return out_file


def main():
    args = sys.argv[1:]

    xlsx_path = args[0] if args else DEFAULT_FILE
    sheet_names = args[1:] if len(args) > 1 else DEFAULT_SHEETS

    if not Path(xlsx_path).exists():
        print(f"[ERROR] File not found: {xlsx_path}")
        sys.exit(1)

    # If "all" passed, read every sheet
    if sheet_names == ["all"]:
        sheet_names = pd.ExcelFile(xlsx_path).sheet_names
        print(f"Found sheets: {sheet_names}")

    output_dir = Path(xlsx_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    for sheet in sheet_names:
        try:
            out = sheet_to_json(xlsx_path, sheet, output_dir)
            print(f"[OK]  {sheet:20s} -> {out}")
        except Exception as e:
            print(f"[FAIL] {sheet}: {e}")


if __name__ == "__main__":
    main()