import os
import requests
# Note: If using a specific library like wa-leg-api, import it here. 
# For this example, we outline the API logic using standard requests.

# Cloudflare D1 REST API configuration
CF_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CF_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')
D1_DATABASE_ID = os.environ.get('D1_DATABASE_ID')

D1_API_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/d1/database/{D1_DATABASE_ID}/query"
HEADERS = {
    "Authorization": f"Bearer {CF_API_TOKEN}",
    "Content-Type": "application/json"
}

def execute_d1_query(sql_statement, params=None):
    """Sends a SQL query to Cloudflare D1."""
    # Strip whitespace and trailing semicolons to prevent multi-statement 400 errors
    clean_sql = sql_statement.strip().rstrip(';')
    
    payload = {"sql": clean_sql}
    if params:
        payload["params"] = params
        
    response = requests.post(D1_API_URL, headers=HEADERS, json=payload)
    
    # Print the exact Cloudflare error message before crashing
    if not response.ok:
        print(f"Cloudflare API Error: {response.status_code}")
        print(f"Response Body: {response.text}")
        
    response.raise_for_status()
    return response.json()

def get_washington_bills():
    """
    Fetches the latest bill data from the Washington State Legislature.
    (Replace this mockup with the actual wa-leg-api call or SOAP request)
    """
    # Mock data structure representing what the API returns
    return [
        {
            "bill_id": "HB-1001",
            "biennium": "2025-26",
            "bill_number": 1001,
            "title": "An act relating to legislative transparency",
            "current_status": "Introduced",
            "document_url": "https://lawfilesext.leg.wa.gov/..."
        }
    ]

def update_database():
    bills = get_washington_bills()
    
    for bill in bills:
        # The ON CONFLICT clause handles the "upsert" - inserting if new, updating if existing
        sql = """
        INSERT INTO bills (bill_id, biennium, bill_number, title, current_status, document_url)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(bill_id) DO UPDATE SET 
            current_status = excluded.current_status,
            last_updated = CURRENT_TIMESTAMP;
        """
        params = [
            bill["bill_id"], 
            bill["biennium"], 
            bill["bill_number"], 
            bill["title"], 
            bill["current_status"],
            bill["document_url"]
        ]
        
        print(f"Updating {bill['bill_id']} in D1...")
        execute_d1_query(sql, params)

if __name__ == "__main__":
    print("Starting LegiTile bill update...")
    update_database()
    print("Update complete.")
