import json
import os
import numpy as np
from scipy.spatial.distance import jensenshannon
import sqlite3
import datetime

base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def log_system_event(event_type, description, model_name="None", transition="N/A", user="system"):
    db_path = os.path.join(base_dir, 'events.db')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS system_events 
                   (timestamp TEXT, type TEXT, description TEXT, active_model TEXT, transition TEXT, user TEXT DEFAULT 'system')''')
    try:
        cur.execute("ALTER TABLE system_events ADD COLUMN user TEXT DEFAULT 'system'")
    except sqlite3.OperationalError:
        pass
    cur.execute("INSERT INTO system_events VALUES (?, ?, ?, ?, ?, ?)", 
                (datetime.datetime.now().isoformat(), event_type, description, model_name, transition, user))
    conn.commit()
    conn.close()

class DriftDetector:
    def __init__(self, limit=5):
        eda_path = os.path.join(base_dir, "..", "eda_infos.json")
        if os.path.exists(eda_path):
            with open(eda_path, "r") as f:
                self.eda_infos = json.load(f)
            self.drift_baseline = self.eda_infos.get("drift_baseline", {})
            self.js_threshold = self.drift_baseline.get("suggested_warning_threshold_JS", 0.15)
        else:
            self.js_threshold = 0.15
            
        self.alert_log_path = os.path.join(base_dir, "models", "drift_alerts.json")
        self.limit_consecutive = limit
        
    def detect_drift(self, reference_data: np.ndarray, current_data: np.ndarray) -> dict:
        bins = np.histogram_bin_edges(np.concatenate((reference_data, current_data)), bins=50)
        ref_hist, _ = np.histogram(reference_data, bins=bins, density=True)
        cur_hist, _ = np.histogram(current_data, bins=bins, density=True)
        
        ref_hist = np.maximum(ref_hist, 1e-10)
        cur_hist = np.maximum(cur_hist, 1e-10)
        
        js_div = jensenshannon(ref_hist, cur_hist)
        is_breach = float(js_div) > self.js_threshold
        
        alerts = self.get_latest_alerts()
        consecutive = 1 if is_breach else 0
        
        # Check previous consecutive counts
        if alerts and is_breach:
            if alerts[-1].get("is_breach", False):
                consecutive = alerts[-1].get("consecutive", 0) + 1
        
        drift_detected = consecutive >= self.limit_consecutive
        
        result = {
            "timestamp": datetime.datetime.now().isoformat(),
            "js_divergence": float(js_div),
            "threshold": self.js_threshold,
            "is_breach": is_breach,
            "consecutive": consecutive,
            "drift_detected": drift_detected
        }
        
        self._log_alert(result)
        
        if drift_detected and consecutive == self.limit_consecutive:
            # Trigger event only on the exact trigger moment to avoid spamming the timeline
            log_system_event("Drift Detected", f"JS Div {js_div:.3f} remained above {self.js_threshold} for {consecutive} cycles.")
            
        return result
        
    def _log_alert(self, result):
        alerts = self.get_latest_alerts()
        alerts.append(result)
        alerts = alerts[-100:]
        
        os.makedirs(os.path.dirname(self.alert_log_path), exist_ok=True)
        with open(self.alert_log_path, "w") as f:
            json.dump(alerts, f, indent=4)
            
    def get_latest_alerts(self):
        if os.path.exists(self.alert_log_path):
            with open(self.alert_log_path, "r") as f:
                return json.load(f)
        return []
