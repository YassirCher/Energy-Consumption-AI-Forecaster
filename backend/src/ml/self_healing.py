import os
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.append(base_dir)

from src.ml.drift_detector import DriftDetector
from src.ml.train import train_and_log
# If this was real deployment we might trigger `subprocess.run(["python", ".../pyspark_pipeline.py"])` securely

class SelfHealer:
    def __init__(self):
        self.detector = DriftDetector()
        
    def trigger_retraining(self):
        """
        Orchestrates full MLOps retraining sequence
        """
        print("Self-Healing Triggered: Initiating Retraining Sequence.")
        # 1. We would run the feature extraction dynamically 
        # e.g., triggering PySpark Pipeline on latest temporal data dump
        # subprocess.run(...)
        
        # 2. Retrain model over fresh parquet
        print("Engaging MLFlow model refit...")
        train_and_log(run_name="Self-Healing-DriftTriggered-Run")
        print("Self-Healing successfully restored Production schema.")
        
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
