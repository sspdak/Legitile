async function fetchBillData() {
    const biennium = document.getElementById('biennium').value.trim();
    const billNumber = document.getElementById('billNumber').value.trim();
    const resultsDiv = document.getElementById('results');
    
    if (!biennium || !billNumber) {
        resultsDiv.innerHTML = '<p class="error">Please enter both a biennium and a bill number.</p>';
        return;
    }

    resultsDiv.innerHTML = '<p>Fetching data...</p>';

    // The actual WA Legislature API URL
    const targetUrl = `https://wslwebservices.leg.wa.gov/LegislationService.asmx/GetLegislationByBillNumber?biennium=${biennium}&billNumber=${billNumber}`;
    
    // Call the Cloudflare Worker API route
    const proxyUrl = `/api/bill?url=${encodeURIComponent(targetUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const xmlText = await response.text();
        
        // Parse the XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");

        // Look for the main <Legislation> node
        const legislations = xmlDoc.getElementsByTagName("Legislation");
        
        if (legislations.length === 0) {
            resultsDiv.innerHTML = '<p class="error">No bill found. Check the biennium and bill number.</p>';
            return;
        }

        const legNode = legislations[0];
        let html = `<h2>Bill Details</h2><div class="data-grid">`;

        // Loop through all child nodes to display available fields
        for (let i = 0; i < legNode.children.length; i++) {
            const child = legNode.children[i];
            if (child.children.length === 0) {
                 html += `<div class="data-key">${child.nodeName}:</div>
                          <div class="data-value">${child.textContent}</div>`;
            }
        }
        
        html += `</div>`;
        resultsDiv.innerHTML = html;

    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">
            <strong>Error fetching data:</strong> ${error.message}
        </div>`;
    }
}
