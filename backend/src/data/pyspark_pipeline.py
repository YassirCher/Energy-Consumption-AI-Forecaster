import os
import pandas as pd
import numpy as np


TARGET = "Global_active_power"
SENSOR_COLUMNS = [
    "Global_reactive_power",
    "Voltage",
    "Global_intensity",
    "Sub_metering_1",
    "Sub_metering_2",
    "Sub_metering_3",
]
LAGS_MINUTES = (60, 1440)


class DataPipeline:
    def __init__(self, data_path: str, output_path: str):
        self.data_path = data_path
        self.output_path = output_path

    @staticmethod
    def prepare(raw: pd.DataFrame) -> pd.DataFrame:
        """Build one-minute, causal features without imputing the target."""
        df = raw.copy()
        if "datetime" not in df.columns:
            if not {"Date", "Time"}.issubset(df.columns):
                raise ValueError("Input must contain datetime or Date and Time columns.")
            df["datetime"] = pd.to_datetime(
                df["Date"] + " " + df["Time"],
                format="%d/%m/%Y %H:%M:%S",
                errors="coerce",
            )

        df.drop(columns=["Date", "Time"], errors="ignore", inplace=True)
        df.dropna(subset=["datetime"], inplace=True)
        df.sort_values("datetime", inplace=True)
        df.drop_duplicates(subset=["datetime"], keep="last", inplace=True)
        df.set_index("datetime", inplace=True)

        # A regular index makes row shifts equal exact minute offsets. Missing
        # target values deliberately stay missing and can never become labels.
        df = df.asfreq("min")
        for column in [TARGET, *SENSOR_COLUMNS]:
            if column in df.columns:
                df[column] = pd.to_numeric(df[column], errors="coerce")

        missing_sensors = [c for c in SENSOR_COLUMNS if c not in df.columns]
        if missing_sensors:
            raise ValueError(f"Missing sensor columns: {missing_sensors}")
        if TARGET not in df.columns:
            raise ValueError(f"Missing target column: {TARGET}")

        # Only inputs are forward-filled. Target observations are never filled.
        df[SENSOR_COLUMNS] = df[SENSOR_COLUMNS].ffill(limit=60)

        hours = df.index.hour
        days = df.index.dayofweek
        df["hour_sin"] = np.sin(2 * np.pi * hours / 24.0)
        df["hour_cos"] = np.cos(2 * np.pi * hours / 24.0)
        df["dow_sin"] = np.sin(2 * np.pi * days / 7.0)
        df["dow_cos"] = np.cos(2 * np.pi * days / 7.0)

        lag_sources = ["Global_intensity", "Sub_metering_3", "Sub_metering_2",
                       "Sub_metering_1", "Global_reactive_power", "Voltage"]
        for column in lag_sources:
            for minutes in LAGS_MINUTES:
                df[f"{column}_lag{minutes // 60}h"] = df[column].shift(minutes)

        # Target-derived features use observed history only, not the filled sensors.
        for minutes in LAGS_MINUTES:
            df[f"{TARGET}_lag{minutes // 60}h"] = df[TARGET].shift(minutes)

        df.index.name = "datetime"
        return df.reset_index()

    def run(self):
        print(f"Loading data from {self.data_path}... (Using Pandas Engine for Local Environment)")
        raw = pd.read_csv(self.data_path, sep=";", na_values=["?"], low_memory=False)
        df = self.prepare(raw)
        print("Causal features generated; unresolved and target missing values retained.")
        print(f"Exporting processed parquet to {self.output_path}...")
        os.makedirs(os.path.dirname(self.output_path), exist_ok=True)
        df.to_parquet(self.output_path, index=False)
        print("Data pipeline completed.")

if __name__ == "__main__":
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_IN = os.path.join(BASE_DIR, "..", "data", "household_power_consumption.txt")
    
    # We write it directly mapped as the expected folder for Pandas (it can be a single file too)
    DATA_OUT = os.path.join(BASE_DIR, "data", "processed.parquet", "part-00000.parquet")
    
    pipeline = DataPipeline(DATA_IN, DATA_OUT)
    pipeline.run()
