// Helper function to fetch and parse XML via a public CORS proxy
async function fetchXml(endpointPath, params) {
    const targetUrl = new URL(`http://wslwebservices.leg.wa.gov/legislationservice.asmx/${endpointPath}`);
    for (const key in params) {
        targetUrl.searchParams.append(key, params[key]);
    }
    
    // Using corsproxy.io to bypass GitHub Pages CORS limitations
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl.href);
    
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${endpointPath}. Status: ${response.status}`);
    
    const text = await response.text();
    return new window.DOMParser().parseFromString(text, "text/xml");
}

async function fetchBill() {
    const billNumber = document.getElementById('billNumber').value.trim();
    const biennium = document.getElementById('biennium').value;
    
    if (!billNumber) {
        showError("Please enter a valid bill number.");
        return;
    }

    // Reset UI state
    document.getElementById('results').style.display = 'none';
    document.getElementById('error').style.display = 'none';
    document.getElementById('loading').style.display = 'block';

    try {
        // 1. Get Main Legislation Data
        const legDoc = await fetchXml("GetLegislation", { biennium, billNumber });
        
        const shortDesc = legDoc.querySelector("ShortDescription")?.textContent;
        const legalTitle = legDoc.querySelector("LegalTitle")?.textContent;
        document.getElementById('title').textContent = shortDesc || legalTitle || "No title found";
        
        const companion = legDoc.querySelector("CompanionBill")?.textContent 
            || legDoc.querySelector("Companion")?.textContent 
            || "None listed";
        document.getElementById('companion').textContent = companion;

        const fetchedBillId = legDoc.querySelector("BillId")?.textContent || (`HB ${billNumber}`);

        // 2. Get Current Status
        try {
            const statusDoc = await fetchXml("GetCurrentStatus", { biennium, billNumber });
            const historyLine = statusDoc.querySelector("HistoryLine")?.textContent;
            const statusDesc = statusDoc.querySelector("Status")?.textContent;
            document.getElementById('status').textContent = historyLine || statusDesc || "Status unavailable";
        } catch(e) {
            document.getElementById('status').textContent = "Error fetching status";
        }

        // 3. Get Sponsors
        try {
            const sponsorDoc = await fetchXml("GetSponsors", { biennium, billId: fetchedBillId });
            const sponsorNodes = sponsorDoc.querySelectorAll("Sponsor");
            let sponsorsList = [];
            
            sponsorNodes.forEach(s => {
                const name = s.querySelector("Name")?.textContent;
                const firstName = s.querySelector("FirstName")?.textContent;
                const lastName = s.querySelector("LastName")?.textContent;
                
                if (name) {
                    sponsorsList.push(name);
                } else if (firstName || lastName) {
                    sponsorsList.push(`${firstName} ${lastName}`.trim());
                }
            });
            document.getElementById('sponsors').textContent = sponsorsList.length > 0 ? sponsorsList.join(", ") : "No sponsors found";
        } catch(e) {
            document.getElementById('sponsors').textContent = "Error fetching sponsors";
        }

        document.getElementById('loading').style.display = 'none';
        document.getElementById('results').style.display = 'block';
    } catch (err) {
        document.getElementById('loading').style.display = 'none';
        console.error(err);
        showError("An error occurred. The WA state API might be down, or the public CORS proxy is rate-limiting requests.");
    }
}

function showError(msg) {
    const errDiv = document.getElementById('error');
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
}
