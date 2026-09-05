import io
import csv
import qrcode
from typing import List, Dict, Any

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
    def build_manifest_csv(households_df) -> str:
        """
        Normalizes and sorts by Carrier Route (CRRT) and Walk Sequence.
        Outputs Action Mail & Inland Valley Print & Mail standard CSV.
        """
        # Sort by CRRT ASC, Walk Sequence ASC
        sorted_df = households_df.sort_values(by=["carrier_route", "walk_sequence"], ascending=[True, True])

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_ALL)

        headers = [
            "RECORD_ID",
            "ADDRESSEE_LINE",
            "DELIVERY_ADDRESS",
            "CITY",
            "STATE",
            "ZIP5",
            "ZIP4",
            "FULL_ZIP",
            "CARRIER_ROUTE_CRRT",
            "WALK_SEQUENCE",
            "COMPOSITE_AFFINITY_SCORE",
            "ENDORSEMENT_LINE",
            "MAIL_CLASS"
        ]
        writer.writerow(headers)

        for _, r in sorted_df.iterrows():
            writer.writerow([
                r["household_id"],
                f"{str(r['resident_name']).upper()} OR CURRENT RESIDENT",
                str(r["street_address"]).upper(),
                str(r["city"]).upper(),
                "CA",
                str(r["zip5"]),
                str(r["zip4"]),
                f"{r['zip5']}-{r['zip4']}",
                r["carrier_route"],
                r["walk_sequence"],
                r.get("composite_score", 0.0),
                f"*****ECRWSS**{r['carrier_route']}",
                "USPS MARKETING MAIL - ENHANCED CARRIER ROUTE"
            ])

        return output.getvalue()
