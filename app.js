async function loadSidebar() {
    try {
        // Fetch the HTML file
        const response = await fetch('sidebar.html');
        if (!response.ok) throw new Error("Sidebar failed to load.");
        
        // Inject it into the placeholder container
        const html = await response.text();
        document.getElementById('sidebar-container').innerHTML = html;

        // Populate the user email from local storage
        document.getElementById('userEmailDisplay').innerText = localStorage.getItem('user_email') || 'Unknown';

        // Dynamically highlight the active navigation link
        const path = window.location.pathname;
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            if (path.includes(item.getAttribute('href'))) {
                item.classList.add('bg-white/10', 'text-white');
                item.classList.remove('text-blue-200');
            }
        });
    } catch (error) {
        console.error(error);
    }
}
