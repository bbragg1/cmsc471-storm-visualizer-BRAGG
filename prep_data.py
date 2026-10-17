# Shrinks weather.csv into data/stations.csv and data/readings.csv

import os
import pandas as pd

INPUT_FILE = "weather.csv"
OUTPUT_DIR = "data"

# 50 states + DC + PR + VI (drops Canada, Guam, N. Mariana Islands)
KEEP_STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
    "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
    "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
    "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR", "VI",
]

# Values above these are errors and get blanked
MAX_PRCP = 40    # inches
MAX_SNOW = 40    # inches removes Teterboro 68 in on Mar 13
MAX_WSF5 = 130   # mph removes 180 mph in Marquette 

# Load only the columns needed
cols = ["station", "state", "latitude", "longitude", "elevation", "date",
        "PRCP", "SNOW", "SNWD", "WSF5"]
df = pd.read_csv(INPUT_FILE, usecols=cols)
print("Loaded", len(df), "rows")

df = df[df["state"].isin(KEEP_STATES)]

# Blank out negative or too-high values
for col in ["PRCP", "SNOW", "SNWD", "WSF5"]:
    df.loc[df[col] < 0, col] = None
df.loc[df["PRCP"] > MAX_PRCP, "PRCP"] = None
df.loc[df["SNOW"] > MAX_SNOW, "SNOW"] = None
df.loc[df["WSF5"] > MAX_WSF5, "WSF5"] = None

# Drop rows with no precipitation data at all
df = df.dropna(subset=["PRCP", "SNOW", "SNWD"], how="all")

# Station table. Some names repeat across states (ie JACKSON)
stations = (df.groupby(["station", "state"], as_index=False)
              .agg(lat=("latitude", "first"),
                   lon=("longitude", "first"),
                   elevation=("elevation", "first")))
stations["id"] = range(len(stations))

# Add station ids and drop repeated station/day rows
df = df.merge(stations[["station", "state", "id"]], on=["station", "state"])
df = df.drop_duplicates(subset=["id", "date"], keep="first")

os.makedirs(OUTPUT_DIR, exist_ok=True)

stations = stations.rename(columns={"station": "name"})
stations[["id", "name", "state", "lat", "lon", "elevation"]].to_csv(
    os.path.join(OUTPUT_DIR, "stations.csv"), index=False)

readings = df[["id", "date", "PRCP", "SNOW", "SNWD", "WSF5"]].sort_values(["date", "id"])
readings = readings.round({"PRCP": 2, "SNOW": 1, "SNWD": 0, "WSF5": 0})
readings.to_csv(os.path.join(OUTPUT_DIR, "readings.csv"), index=False, float_format="%g")

print("Stations:", len(stations))
print("Readings:", len(readings))
print("Done. Files are in the", OUTPUT_DIR, "folder.")
