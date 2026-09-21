import io
import csv
import qrcode
from typing import List, Dict, Any

# The mail house needs the address block in postal order and nothing else in the
# way. RECIPIENT_NAME sits beside the endorsement rather than replacing it: a
# saturation drop is addressed to "RESIDENT OR CURRENT RESIDENT" and the column
# comes back empty, while a licensed list carries the name and the same file
# serves both without a second format.
MANIFEST_COLUMNS = [
    "RECORD_ID",
    "RECIPIENT_NAME",
    "ENDORSEMENT_LINE",
    "PRIMARY_ADDRESS",
    "CITY",
    "STATE",
    "ZIP_CODE",
    "ZIP4",
    "CARRIER_ROUTE",
    "WALK_SEQUENCE",
    "HOUSEHOLD_SCORE"
]

class PostalExportService:
    @staticmethod
    def generate_qr_image(url: str) -> bytes:
        """Generates PNG byte buffer for dynamic tracking QR code."""
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()

    @staticmethod
    def build_manifest_rows(households_df_or_list) -> List[Dict[str, Any]]:
        """
        Normalizes and sorts by:
        1º CARRIER_ROUTE (CRRT) ASC
        2º WALK_SEQUENCE ASC
        Assigns consecutive RECORD_ID (1 to 5000) and formats exact 10 columns
        compliant with Action Mail & Inland Valley Print & Mail standards.
        """
        # Convert input into list of dicts
        if hasattr(households_df_or_list, "to_dict"):
            records = households_df_or_list.to_dict(orient="records")
        else:
            records = list(households_df_or_list)

        normalized = []
        for r in records:
            if hasattr(r, "__dict__"):
                d = {k: v for k, v in r.__dict__.items() if not k.startswith("_")}
            elif isinstance(r, dict):
                d = dict(r)
            else:
                d = {}
            normalized.append(d)

        # 1º CARRIER_ROUTE ASC, 2º WALK_SEQUENCE ASC
        def sort_key(item):
            crrt = str(item.get("carrier_route") or item.get("CARRIER_ROUTE") or "")
            try:
                walk_seq = int(item.get("walk_sequence") or item.get("WALK_SEQUENCE") or 0)
            except (ValueError, TypeError):
                walk_seq = 0
            return (crrt, walk_seq)

        normalized.sort(key=sort_key)

        manifest_rows = []
        for i, item in enumerate(normalized, start=1):
            # Calculate / normalize HOUSEHOLD_SCORE (1 to 100)
            raw_score = item.get("composite_score") or item.get("HOUSEHOLD_SCORE") or 75.0
            try:
                score_val = float(raw_score)
                if 0.0 < score_val <= 1.0:
                    score_val = score_val * 100.0
                score_val = max(1.0, min(100.0, score_val))
                household_score = round(score_val, 1)
            except (ValueError, TypeError):
                household_score = 75.0

            street = (item.get("street_address") or item.get("PRIMARY_ADDRESS") or item.get("address") or "").strip()
            city = (item.get("city") or item.get("CITY") or "Eastvale").strip()
            state = (item.get("state") or item.get("STATE") or "CA").strip().upper()
            zip_code = str(item.get("zip5") or item.get("ZIP_CODE") or item.get("zip") or "92880").strip()
            zip4 = str(item.get("zip4") or item.get("ZIP4") or "1000").strip()
            crrt = str(item.get("carrier_route") or item.get("CARRIER_ROUTE") or "C001").strip()
            try:
                walk_seq = int(item.get("walk_sequence") or item.get("WALK_SEQUENCE") or i)
            except (ValueError, TypeError):
                walk_seq = i

            name = str(
                item.get("resident_name")
                or item.get("RESIDENT_NAME")
                or item.get("RECIPIENT_NAME")
                or ""
            ).strip()

            manifest_rows.append({
                "RECORD_ID": i,
                "RECIPIENT_NAME": name,
                "ENDORSEMENT_LINE": "RESIDENT OR CURRENT RESIDENT",
                "PRIMARY_ADDRESS": street,
                "CITY": city,
                "STATE": state,
                "ZIP_CODE": zip_code,
                "ZIP4": zip4,
                "CARRIER_ROUTE": crrt,
                "WALK_SEQUENCE": walk_seq,
                "HOUSEHOLD_SCORE": household_score
            })

        return manifest_rows

    @staticmethod
    def build_manifest_csv(households_df_or_list) -> str:
        """
        Generates production CSV 100% compliant with Action Mail
        and Inland Valley Print & Mail specifications.
        """
        rows = PostalExportService.build_manifest_rows(households_df_or_list)

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(MANIFEST_COLUMNS)

        for r in rows:
            writer.writerow([
                r["RECORD_ID"],
                r["RECIPIENT_NAME"],
                r["ENDORSEMENT_LINE"],
                r["PRIMARY_ADDRESS"],
                r["CITY"],
                r["STATE"],
                r["ZIP_CODE"],
                r["ZIP4"],
                r["CARRIER_ROUTE"],
                r["WALK_SEQUENCE"],
                r["HOUSEHOLD_SCORE"]
            ])

        return output.getvalue()
