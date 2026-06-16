import requests
import time
import numpy as np
import threading

def run_simulation(url="http://localhost:8000/predict"):
    print("Initializing Streaming Simulation...")
    drift_factor = 0.0
    
    # baseline feature dict
    base_feature = {
        "Global_intensity": 4.5,
        "Global_reactive_power": 0.1,
        "Voltage": 240.0,
        "Sub_metering_1": 0.0,
        "Sub_metering_2": 1.0,
        "Sub_metering_3": 17.0,
        "Global_active_power_lag1h": 1.2,
        "Global_active_power_lag24h": 1.1,
        "Global_intensity_lag1h": 4.5,
        "Global_intensity_lag24h": 4.4,
        "Sub_metering_3_lag1h": 17.0,
        "Sub_metering_3_lag24h": 17.5,
        "Sub_metering_2_lag1h": 1.0,
        "Sub_metering_2_lag24h": 1.1,
        "Sub_metering_1_lag1h": 0.0,
        "Sub_metering_1_lag24h": 0.0,
        "Global_reactive_power_lag1h": 0.1,
        "Global_reactive_power_lag24h": 0.12,
        "Voltage_lag1h": 240.0,
        "Voltage_lag24h": 241.0,
        "hour_sin": 0.5,
        "hour_cos": 0.86,
        "dow_sin": 0.0,
        "dow_cos": 1.0
    }
    
    iteration = 0
    while True:
        iteration += 1
        # Gradually shift intensity to simulate concept drift organically
        drift_factor += 0.005 
        
        current_features = base_feature.copy()
        # Add random noise
        current_features["Global_intensity"] += np.random.normal(drift_factor, 0.2)
        
        payload = {
            "features": [current_features]
        }
        
        try:
            res = requests.post(url, json=payload)
            if res.status_code == 200:
                print(f"[Iter {iteration}] 200 OK | Latency: {res.json().get('latency_ms')}ms | Drift Base: {drift_factor:.3f}")
            else:
                print(f"[Iter {iteration}] {res.status_code} Error: {res.text}")
        except Exception as e:
            print(f"[Iter {iteration}] Connection Failed. Is FastAPI running on {url}?")
            
        time.sleep(1.0) # 1 Request per second streaming load

if __name__ == "__main__":
    run_simulation()
