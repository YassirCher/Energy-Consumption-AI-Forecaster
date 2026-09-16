import numpy as np
import pandas as pd
import pytest
from sklearn.base import clone

from src.data.pyspark_pipeline import DataPipeline, SENSOR_COLUMNS, TARGET
from src.ml.train import (
    FEATURE_COLUMNS,
    HORIZONS,
    assess_quality_gate,
    build_horizon_dataset,
    build_preprocessor,
)


def make_regular_frame(rows=20_000):
    index = pd.date_range("2020-01-01", periods=rows, freq="min", name="datetime")
    minute = np.arange(rows)
    target = 2.0 + np.sin(2 * np.pi * minute / 1440) + 0.2 * np.sin(2 * np.pi * minute / 60)
    frame = pd.DataFrame(index=index)
    frame[TARGET] = target
    frame["Global_reactive_power"] = 0.1 + 0.02 * np.cos(minute / 30)
    frame["Voltage"] = 235.0 + minute / rows
    frame["Global_intensity"] = target * 1000 / frame["Voltage"]
    frame["Sub_metering_1"] = 1.0 + np.sin(minute / 17)
    frame["Sub_metering_2"] = 2.0 + np.cos(minute / 23)
    frame["Sub_metering_3"] = 10.0 + np.sin(minute / 31)
    frame["hour_sin"] = np.sin(2 * np.pi * index.hour / 24.0)
    frame["hour_cos"] = np.cos(2 * np.pi * index.hour / 24.0)
    frame["dow_sin"] = np.sin(2 * np.pi * index.dayofweek / 7.0)
    frame["dow_cos"] = np.cos(2 * np.pi * index.dayofweek / 7.0)
    for column in ["Global_intensity", "Sub_metering_3", "Sub_metering_2",
                   "Sub_metering_1", "Global_reactive_power", "Voltage", TARGET]:
        frame[f"{column}_lag1h"] = frame[column].shift(60)
        frame[f"{column}_lag24h"] = frame[column].shift(1440)
    return frame


def test_pipeline_never_uses_future_values_or_imputes_target():
    times = pd.to_datetime(["2020-01-01 23:00", "2020-01-01 23:02", "2020-01-01 23:03"])
    raw = pd.DataFrame({"datetime": times, TARGET: [1.0, np.nan, 999.0]})
    for column in SENSOR_COLUMNS:
        raw[column] = [1.0, np.nan, 999.0]

    prepared = DataPipeline.prepare(raw).set_index("datetime")

    assert pd.isna(prepared.loc["2020-01-01 23:01", TARGET])
    assert pd.isna(prepared.loc["2020-01-01 23:02", TARGET])
    assert prepared.loc["2020-01-01 23:01", "Voltage"] == 1.0
    assert prepared.loc["2020-01-01 23:02", "Voltage"] == 1.0
    assert prepared.loc["2020-01-01 23:00", "hour_cos"] == pytest.approx(
        np.cos(2 * np.pi * 23 / 24.0)
    )


@pytest.mark.parametrize("label,minutes", HORIZONS.items())
def test_horizon_labels_and_partitions_are_causal(label, minutes):
    frame = make_regular_frame()
    dataset = build_horizon_dataset(frame, label, minutes)
    first_origin = dataset.X_train.index[0]

    assert dataset.y_train[0] == pytest.approx(
        frame.loc[first_origin + pd.Timedelta(minutes=minutes), TARGET]
    )
    assert dataset.split_timestamps["train_target_end"] < dataset.split_timestamps["validation_origin_start"]
    assert dataset.split_timestamps["validation_target_end"] < dataset.split_timestamps["test_origin_start"]
    assert all(dataset.leakage_checks.values())


def test_t_plus_one_is_not_the_same_row_target():
    frame = make_regular_frame()
    dataset = build_horizon_dataset(frame, "1_step", 1)
    same_row = frame.loc[dataset.X_train.index, TARGET].to_numpy()
    assert not np.array_equal(dataset.y_train, same_row)


def test_preprocessor_is_fit_on_training_rows_only_and_can_be_cloned():
    frame = make_regular_frame()
    dataset = build_horizon_dataset(frame, "1_step", 1)
    first = build_preprocessor()
    second = clone(first)
    first.fit(dataset.X_train)

    assert first is not second
    assert hasattr(first, "transformers_")
    assert not hasattr(second, "transformers_")
    robust_columns = list(first.transformers[1][2])
    voltage_position = robust_columns.index("Voltage")
    fitted_voltage_median = first.named_transformers_["robust"].center_[voltage_position]
    assert fitted_voltage_median == pytest.approx(dataset.X_train["Voltage"].median())
    assert fitted_voltage_median != pytest.approx(frame["Voltage"].median())


def test_quality_gate_rejects_leakage_or_weak_metrics():
    good = {"rmse": 0.20, "mae": 0.08, "r2": 0.94}
    baseline = {"rmse": 0.22, "mae": 0.07, "r2": 0.93}
    assert assess_quality_gate("1_step", good, baseline, {"causal": True})["passed"]
    assert not assess_quality_gate("1_step", good, baseline, {"causal": False})["passed"]
    weak = {"rmse": 0.21, "mae": 0.09, "r2": 0.80}
    assert not assess_quality_gate("1_step", weak, baseline, {"causal": True})["passed"]


def test_feature_contract_contains_no_positive_offsets():
    from src.ml.train import FEATURE_OFFSETS_MINUTES

    assert set(FEATURE_COLUMNS) == set(FEATURE_OFFSETS_MINUTES)
    assert max(FEATURE_OFFSETS_MINUTES.values()) == 0
