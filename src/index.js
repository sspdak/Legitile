export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Standard CORS headers so your frontend can communicate with the Worker
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- AUTHENTICATION PLACEHOLDER ---
    // Extract user ID from the JWT token sent by the frontend
    // You will need to add your specific JWT verification logic here.
    const userId = "user_123"; // Hardcoded temporarily for structure

    try {
      // 1. GET ALL TRACKED BILLS
      if (path === "/my-workspace" && request.method === "GET") {
        const { results } = await env.DB.prepare(
          `SELECT * FROM workspace WHERE user_id = ?`
        ).bind(userId).all();
        
        return new Response(JSON.stringify(results), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // 2. SAVE A NEW BILL OR DRAFT
      if (path === "/save-bill" && request.method === "POST") {
        const payload = await request.json();
        
        await env.DB.prepare(`
          INSERT INTO workspace (
            user_id, bill_number, short_desc, status, sponsor, companion, 
            tracking_status, committee, type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          userId, 
          payload.billNumber, 
          payload.shortDesc, 
          payload.status || "Introduced", 
          payload.sponsor || "Unknown", 
          payload.companion || "", 
          payload.tracking_status || "Introduced", 
          payload.committee || "Unknown", 
          payload.type || "live"
        ).run();

        return new Response("Saved successfully", { status: 200, headers: corsHeaders });
      }

      // 3. UPDATE AN EXISTING BILL'S STATUS AND TASKS
      if (path === "/update-bill" && request.method === "POST") {
        const payload = await request.json();
        
        await env.DB.prepare(`
          UPDATE workspace SET 
            status = ?, tracking_status = ?, live_notes = ?, task_progress = ?, 
            custom_tasks = ?, hearing_date = ?, exec_date = ?, amendments = ?
          WHERE id = ? AND user_id = ?
        `).bind(
          payload.status, 
          payload.tracking_status, 
          payload.live_notes, 
          payload.task_progress, 
          payload.custom_tasks, 
          payload.hearing_date, 
          payload.exec_date, 
          payload.amendments,
          payload.id, 
          userId
        ).run();

        return new Response("Updated successfully", { status: 200, headers: corsHeaders });
      }

      // 4. DELETE A BILL FROM WORKSPACE
      if (path === "/delete-bill" && request.method === "DELETE") {
        const payload = await request.json();
        
        await env.DB.prepare(`DELETE FROM workspace WHERE id = ? AND user_id = ?`)
          .bind(payload.id, userId).run();

        return new Response("Deleted successfully", { status: 200, headers: corsHeaders });
      }

      // Fallback for undefined routes
      return new Response("Endpoint not found", { status: 404, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  }
};
