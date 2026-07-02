from flask import Flask, request, jsonify, send_from_directory
import json
import os
import time
from screener import get_stock_data, score_and_rank_stocks, sanitize_for_json

app = Flask(__name__, static_folder=".")

PORTFOLIO_FILE = "portfolio_data.json"

def load_database():
    if not os.path.exists(PORTFOLIO_FILE):
        return {"last_updated": time.strftime("%Y-%m-%d %H:%M:%S"), "stocks": []}
    try:
        with open(PORTFOLIO_FILE, "r") as f:
            # screener.py can write bare NaN/Infinity (Python json allows them);
            # browsers' JSON.parse does not. Coerce them to null on load.
            return json.load(f, parse_constant=lambda _: None)
    except Exception as e:
        print(f"Error loading database: {e}")
        return {"last_updated": time.strftime("%Y-%m-%d %H:%M:%S"), "stocks": []}

def save_database(data):
    try:
        with open(PORTFOLIO_FILE, "w") as f:
            json.dump(sanitize_for_json(data), f, indent=2, allow_nan=False)
        return True
    except Exception as e:
        print(f"Error saving database: {e}")
        return False

# --- Serve Static Front-End Files ---
@app.route("/")
def serve_index():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory(".", path)

# --- API Endpoints ---
@app.route("/api/stocks", methods=["GET"])
def get_stocks():
    db = load_database()
    return jsonify(db)

@app.route("/api/add-ticker", methods=["POST"])
def add_ticker():
    req_data = request.get_json() or {}
    ticker_symbol = req_data.get("ticker", "").strip().upper()
    
    if not ticker_symbol:
        return jsonify({"success": False, "error": "Ticker symbol is required"}), 400
        
    db = load_database()
    stocks = db.get("stocks", [])
    
    # Check if stock already exists
    existing = next((s for s in stocks if s["ticker"] == ticker_symbol), None)
    if existing:
        return jsonify({"success": True, "message": "Ticker already exists in the database", "stock": existing})
    
    # Fetch new stock data
    stock_data = get_stock_data(ticker_symbol)
    if not stock_data:
        return jsonify({"success": False, "error": f"Failed to retrieve data for ticker '{ticker_symbol}' from Yahoo Finance."}), 404
        
    # Append new stock data and re-calculate the relative percentile scores
    stocks.append(stock_data)
    
    try:
        updated_stocks = score_and_rank_stocks(stocks)
        db["stocks"] = updated_stocks
        db["last_updated"] = time.strftime("%Y-%m-%d %H:%M:%S")
        save_database(db)
        
        # Find the newly added stock with its calculated scores
        added_stock = next((s for s in updated_stocks if s["ticker"] == ticker_symbol), None)
        return jsonify({"success": True, "message": "Stock added successfully", "stock": added_stock, "stocks": updated_stocks})
    except Exception as e:
        print(f"Error calculating ranks: {e}")
        return jsonify({"success": False, "error": "Data was retrieved but ranking failed."}), 500

if __name__ == "__main__":
    # Run the local Flask dev server on port 3000
    print("Starting SoundHype Interactive API Server at http://localhost:3000")
    app.run(host="127.0.0.1", port=3000, debug=True)
