import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(base_dir)

from src.ml.drift_detector import DriftDetector
from src.ml.train import train_and_log
from src.data.pyspark_pipeline import DataPipeline

class SelfHealer:
    def __init__(self):
        self.detector = DriftDetector()

    @staticmethod
    def training_paths():
        raw_path = os.path.abspath(os.path.join(base_dir, "..", "data", "household_power_consumption.txt"))
        processed_path = os.path.join(base_dir, "data", "processed.parquet", "part-00000.parquet")
        return raw_path, processed_path

    @classmethod
    def training_data_available(cls):
        return any(os.path.exists(path) for path in cls.training_paths())
        
    def trigger_retraining(self):
        """
        Orchestrates full MLOps retraining sequence
        """
        print("Self-Healing Triggered: Initiating Retraining Sequence.")
        raw_path, processed_path = self.training_paths()
        if os.path.exists(raw_path):
            print("Rebuilding causal feature data from the local raw dataset...")
            DataPipeline(raw_path, processed_path).run()
        elif not os.path.exists(processed_path):
            raise FileNotFoundError("Neither raw nor processed training data is available.")
        else:
            print("Raw data is unavailable; using the bundled causal parquet dataset.")

        print("Engaging MLFlow model refit...")
        report = train_and_log(run_name="Self-Healing-DriftTriggered-Run", promote=True)
        if not report["quality_gate"]["passed"]:
            print("Candidate failed quality gates; production was not changed.")
        elif report["promoted"]:
            print("Self-Healing promoted and persisted a leakage-free production bundle.")
        return report
        
    def check_and_heal(self, ref_data, cur_data):
        result = self.detector.detect_drift(ref_data, cur_data)
        if result["drift_detected"]:
            print(f"ALERT: JS Divergence {result['js_divergence']} exceeded tracking boundary.")
            self.trigger_retraining()
        else:
            print(f"Data conforms to schema boundaries (JS Div: {result['js_divergence']:.4f}).")

if __name__ == "__main__":
    healer = SelfHealer()
    healer.trigger_retraining()
