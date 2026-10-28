import json
import csv

input_file = "rag_passages.jsonl"
output_file = "rag_passages.csv"

with open(input_file, "r", encoding="utf-8") as infile, \
     open(output_file, "w", encoding="utf-8-sig", newline="") as outfile:

    rows = [json.loads(line) for line in infile if line.strip()]

    if rows:
        fieldnames = rows[0].keys()
        writer = csv.DictWriter(outfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

print(f"Done! Converted {len(rows)} records.")
print(f"Saved as: {output_file}")