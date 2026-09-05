import numpy as np
import pandas as pd
from typing import List, Dict, Any, Tuple

# Demographic Weights Matrix W_{j, k} for the 14 closed niches
# Attributes: [income, home_ownership, home_age, children, vehicles, pet_owner, home_value]
DEMOGRAPHIC_WEIGHTS_MATRIX = np.array([
    [0.85, 0.80, 0.20, 0.95, 0.40, 0.10, 0.80], # 1: Dental Hero
    [0.80, 0.98, 0.95, 0.50, 0.50, 0.30, 0.85], # 2: HVAC
    [0.75, 0.70, 0.20, 0.65, 0.40, 1.00, 0.70], # 3: Vet Hospital
    [0.70, 0.95, 0.90, 0.40, 0.40, 0.20, 0.80], # 4: Plumbing
    [0.65, 0.60, 0.30, 0.55, 0.95, 0.15, 0.60], # 5: Auto Mechanic / Brakes
    [0.60, 0.55, 0.10, 0.90, 0.30, 0.20, 0.55], # 6: Pizza
    [0.85, 0.65, 0.15, 0.50, 0.40, 0.15, 0.75], # 7: Boutique Gym
    [0.90, 1.00, 0.85, 0.45, 0.60, 0.20, 0.95], # 8: Roofing & Solar
    [0.75, 0.70, 0.20, 0.40, 0.70, 0.10, 0.70], # 9: Chiropractic
    [0.70, 0.85, 0.60, 0.75, 0.40, 0.85, 0.75], # 10: Carpet & Tile Cleaning
    [0.80, 0.75, 0.10, 0.45, 0.95, 0.20, 0.80], # 11: Mobile Detailing
    [0.75, 0.70, 0.15, 0.65, 0.40, 1.00, 0.70], # 12: Pet Grooming
    [0.60, 0.55, 0.10, 0.85, 0.35, 0.10, 0.55], # 13: Mexican Restaurant
    [0.85, 0.95, 0.50, 0.70, 0.90, 0.20, 0.85]  # 14: Insurance Agency Medium
])

CATEGORY_NAMES = [
    "Odontología Familiar", "HVAC / Aire Acondicionado", "Hospital Veterinario",
    "Plomería Residencial", "Taller Mecánico / Frenos", "Pizzería Artesanal",
    "Gimnasio Boutique / Fitness", "Techado y Paneles Solares", "Quiropráctico / Fisioterapia",
    "Limpieza de Alfombras y Pisos", "Detailing Móvil de Autos", "Peluquería Canina",
    "Restaurante Mexicano", "Agencia de Seguros"
]

class PropensityEngine:
    def __init__(self, weights_matrix: np.ndarray = DEMOGRAPHIC_WEIGHTS_MATRIX):
        self.W = weights_matrix # shape: (14, 7)

    def generate_synthetic_pool(self, city: str = "Eastvale", zip_code: str = "92880", n: int = 15000) -> pd.DataFrame:
        """Generates synthetic dataset of 15,000 households for the Inland Empire."""
        np.random.seed(42)

        carrier_routes = [f"C{str(i).zfill(3)}" for i in range(1, 25)] + ["R001", "R002", "R003"]
        streets = [
            "Citrus Valley Pkwy", "Limonite Ave", "Archibald Ave", "Sumner Ave",
            "Hamner Ave", "Scholar Way", "Bellegrave Ave", "Cloverdale St"
        ]
        first_names = ["John", "Michael", "David", "Carlos", "Maria", "Robert", "James", "Elena", "Daniel", "Sarah"]
        last_names = ["Garcia", "Hernandez", "Smith", "Johnson", "Rodriguez", "Martinez", "Lopez", "Davis", "Miller"]

        names = [f"{np.random.choice(first_names)} {np.random.choice(last_names)}" for _ in range(n)]
        addrs = [f"{np.random.randint(1000, 14000)} {np.random.choice(streets)}" for _ in range(n)]
        crrts = np.random.choice(carrier_routes, size=n)
        walk_seqs = np.random.randint(1, 450, size=n)
        zip4s = [str(np.random.randint(1000, 9999)) for _ in range(n)]

        # Demographic Vectors (7 features)
        income_score = np.clip(np.random.beta(a=3.0, b=2.2, size=n), 0.1, 1.0)
        home_ownership = (np.random.rand(n) > 0.18).astype(float) # 82% homeowners in Eastvale
        home_age_years = np.random.randint(3, 40, size=n)
        home_age_score = np.clip(home_age_years / 30.0, 0.0, 1.0)
        children_present = (np.random.rand(n) > 0.45).astype(float)
        vehicles_count = np.random.choice([1, 2, 3, 4], p=[0.15, 0.40, 0.30, 0.15], size=n)
        vehicles_score = vehicles_count / 4.0
        pet_owner = (np.random.rand(n) > 0.38).astype(float)
        home_value_score = np.clip(0.6 * income_score + 0.4 * home_ownership + np.random.normal(0, 0.05, n), 0.1, 1.0)

        feature_matrix = np.column_stack([
            income_score, home_ownership, home_age_score, children_present,
            vehicles_score, pet_owner, home_value_score
        ])

        df = pd.DataFrame(feature_matrix, columns=[
            "income_score", "home_ownership_score", "home_age_score",
            "children_present_score", "vehicles_score", "pet_owner_score", "home_value_score"
        ])

        df["household_id"] = [f"HH-{zip_code}-{str(i+1).zfill(5)}" for i in range(n)]
        df["resident_name"] = names
        df["street_address"] = addrs
        df["city"] = city
        df["state"] = "CA"
        df["zip5"] = zip_code
        df["zip4"] = zip4s
        df["carrier_route"] = crrts
        df["walk_sequence"] = walk_seqs
        df["home_age_years"] = home_age_years
        df["vehicles_count"] = vehicles_count

        return df

    def run_curation(self, df: pd.DataFrame, target_cutoff: int = 5000) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Executes vectorized matrix multiplication:
        Matches = X . W^T (shape: N x 14)
        Composite_Score = sum(Matches, axis=1)
        """
        feature_cols = [
            "income_score", "home_ownership_score", "home_age_score",
            "children_present_score", "vehicles_score", "pet_owner_score", "home_value_score"
        ]
        X = df[feature_cols].to_numpy() # shape: (N, 7)

        # Vectorized scoring: X dot W.T -> (N, 14)
        match_matrix = np.dot(X, self.W.T) * 1.5

        # Compound score per household
        composite_scores = np.sum(match_matrix, axis=1)
        df["composite_score"] = np.round(composite_scores, 2)

        # Sort descending
        df_sorted = df.sort_values(by="composite_score", ascending=False).reset_index(drop=True)
        df_sorted["selected_for_drop"] = False
        df_sorted.loc[:target_cutoff - 1, "selected_for_drop"] = True

        top_5k = df_sorted.iloc[:target_cutoff].copy()

        # Route distribution
        route_dist = top_5k.groupby("carrier_route").size().reset_index(name="count")
        route_dist = route_dist.sort_values(by="count", ascending=False).to_dict(orient="records")

        # Histogram bins
        min_score = float(top_5k["composite_score"].min())
        max_score = float(top_5k["composite_score"].max())
        counts, bin_edges = np.histogram(top_5k["composite_score"], bins=8)
        histogram = [
            {"binRange": f"{round(bin_edges[i], 1)}-{round(bin_edges[i+1], 1)}", "count": int(counts[i])}
            for i in range(len(counts))
        ]

        summary = {
            "total_analyzed": len(df),
            "total_selected": target_cutoff,
            "min_score": min_score,
            "max_score": max_score,
            "avg_score": round(float(top_5k["composite_score"].mean()), 2),
            "carrier_route_breakdown": route_dist,
            "histogram": histogram
        }

        return top_5k, summary
