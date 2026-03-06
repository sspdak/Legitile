const STORAGE_KEY = 'LegiNudge_Workspace_Stable_V1';
const SINE_DIE_DATE = new Date("2026-03-11T23:59:59");
let isArchiveView = false; 

function toggleSessionMenu() {
    const menu = document.getElementById('sessionMenu');
    menu.classList.toggle('hidden');
}

// --- SAFE DATA MIGRATION CHECK ---
function runSafeCheck() {
    try {
        let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let modified = false;
        items = items.map(i => {
            if (typeof i.companionStatus === 'undefined') { i.companionStatus = 'Alive'; modified = true; }
            if (!i.customTasks) { i.customTasks = []; modified = true; }
            return i;
        });
        if(modified) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch(e) { console.error("SafeCheck Error", e); }
}
runSafeCheck();
// --------------------------------

// --- EXPORT / IMPORT LOGIC ---
function downloadBackup() {
    const data = localStorage.getItem(STORAGE_KEY) || '[]';
    const blob = new Blob([data], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `LegiTile_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function processImport(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (Array.isArray(json)) {
                if(confirm(`Ready to overwrite current workspace with ${json.length} records? This cannot be undone.`)) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
                    location.reload(); 
                }
            } else {
                alert("Invalid file format.");
            }
        } catch (err) {
            alert("Error parsing JSON file.");
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset
}

function insertTimestamp(id) {
    const textarea = document.getElementById(`notes_${id}`);
    const now = new Date();
    const timeStr = `\n[${now.getMonth()+1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}]: `;
    textarea.value = textarea.value + timeStr;
    textarea.focus();
    updateField(id, 'liveNotes', textarea.value);
}
// --------------------------------

function updateSessionTimer() {
    const now = new Date();
    const diff = SINE_DIE_DATE - now;
    const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
    const timerEl = document.getElementById('daysLeft');
    if (diff <= 0) {
        timerEl.innerText = "0";
        document.querySelector('#sessionTimer span').innerText = "Session Ended";
    } else {
        timerEl.innerText = daysLeft;
        if (daysLeft < 10) timerEl.classList.add('timer-urgent');
    }
}
setInterval(updateSessionTimer, 60000); 
updateSessionTimer();

const LIVE_STATUS_OPTIONS = ["Draft", "Introduced", "Public Hearing", "Executive Action", "Fiscal", "Rules", "Floor", "House", "Concurrence", "Passed", "Dead"];

const STATUS_TASKS = {
    "Draft": ["Draft Approved", "Draft to CRO", "Received", "Sent Pink Sheet"],
    "Introduced": ["Review bill", "Add summary to tracker", "Prep talking points"],
    "Public Hearing": [{ name: "Submit Bill Report", days: -2 }, { name: "Create Bill Presentation", days: -1 }, { name: "Submit Public Testimony", days: 1 }],
    "Executive Action": [{ name: "Briefing Notes", days: -1 }, { name: "Review Proposed Sub", days: 0 }, { name: "Update Bill Report", days: 1 }],
    "Fiscal": ["Review Fiscal Note", "Check In with Fiscal Staff"],
    "Rules": ["Review Bill Report", "Prep Floor Note"],
    "Floor": ["Submit Floor Note", "Review Floor Amendments"],
    "House": [],
    "Dead": [],
    "Default": ["Review Bill", "Monitor Testimony"]
};

let currentCommittee = 'All';
let currentType = 'All';
let currentStatus = 'All';
let currentSort = 'priority';
let currentView = 'grid';
let expandedCards = new Set();

function getTimestamp() { return new Date().toISOString(); }
function formatTimestamp(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function calculateDeadline(baseDateStr, offsetDays) {
    if (!baseDateStr) return null;
    const base = new Date(baseDateStr);
    const target = new Date(base);
    target.setDate(base.getDate() + offsetDays);
    return target;
}

function getDeadlineStatus(deadlineDate) {
    if (!deadlineDate) return '';
    const now = new Date();
    now.setHours(0,0,0,0);
    const checkDate = new Date(deadlineDate);
    checkDate.setHours(0,0,0,0);
    const diffTime = checkDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    if (diffDays < 0) return 'text-red-600 font-black';
    if (diffDays === 0) return 'text-red-500 font-black animate-pulse';
    if (diffDays <= 1) return 'text-orange-500 font-bold';
    return 'text-gray-400 font-bold';
}

function hideAllModals() {
    ['draftForm', 'existingForm', 'staleModal', 'editModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.setProperty('display', 'none', 'important');
    });
}

function toggleArchiveView() {
    isArchiveView = !isArchiveView;
    const banner = document.getElementById('archiveBanner');
    const body = document.getElementById('mainBody');
    const btn = document.getElementById('btnViewArchive');

    if(isArchiveView) {
        banner.classList.remove('hidden');
        body.classList.remove('bg-gray-100');
        body.classList.add('bg-gray-300'); 
        btn.innerText = "📂 Exit Archives (View Active)";
    } else {
        banner.classList.add('hidden');
        body.classList.add('bg-gray-100');
        body.classList.remove('bg-gray-300');
        btn.innerText = "📂 View Archives";
    }
    hideAllModals(); 
    refreshGrid();
}

function archiveCurrentSession() {
    const promptName = prompt("Clean Slate Protocol:\n\nThis will move ALL active bills to the archives. You can still view them later.\n\nEnter a name for this session to confirm (e.g., '2026 Short'):");
    
    if(promptName) {
        let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        let count = 0;
        items.forEach(item => {
            if(!item.isArchived) {
                item.isArchived = true;
                item.archiveSessionName = promptName;
                count++;
            }
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        alert(`Success! Archived ${count} bills under "${promptName}". Your workspace is now clean.`);
        hideAllModals();
        refreshGrid();
    }
}

function renderFilterOptions() {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const filterSelect = document.getElementById('statusFilter');
    const savedValue = currentStatus;
    filterSelect.innerHTML = '<option value="All">Filter: All Steps</option>';
    LIVE_STATUS_OPTIONS.forEach(opt => {
        if(opt !== 'Dead') { 
            const count = items.filter(i => i.status === opt && (isArchiveView ? i.isArchived : !i.isArchived)).length;
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = `${opt} (${count})`;
            filterSelect.appendChild(option);
        }
    });
    if ([...filterSelect.options].some(o => o.value === savedValue)) filterSelect.value = savedValue;
    else { filterSelect.value = 'All'; currentStatus = 'All'; }
}

function triggerStaleCheck(id) {
    if(isArchiveView) return; 
    document.getElementById('staleModal').style.display = 'flex';
    document.getElementById('staleConfirmBtn').onclick = () => {
        updateField(id, 'lastUpdated', getTimestamp());
        hideAllModals();
    };
}

function triggerEdit(id) {
    if(isArchiveView) return;
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const item = items.find(i => i.id === id);
    if (item) {
        document.getElementById('editTitle').value = item.title;
        document.getElementById('editCompanion').value = item.companion || "";
        document.getElementById('editLongTitle').value = item.longTitle || "";
        document.getElementById('editSponsor').value = item.sponsor || "";
        document.getElementById('editUrl').value = item.url || "";
        document.getElementById('editCommittee').value = item.committee;
        document.getElementById('editModal').style.display = 'flex';
        document.getElementById('editSaveBtn').onclick = () => {
            item.title = document.getElementById('editTitle').value;
            item.companion = document.getElementById('editCompanion').value;
            item.longTitle = document.getElementById('editLongTitle').value;
            item.sponsor = document.getElementById('editSponsor').value;
            item.url = document.getElementById('editUrl').value;
            item.committee = document.getElementById('editCommittee').value;
            item.lastUpdated = getTimestamp();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            hideAllModals();
            refreshGrid();
        };
    }
}

function deleteItem(id) { 
    if(isArchiveView) {
        if(!confirm("Permanently delete this archived record?")) return;
    } else {
        if(!confirm("Permanently delete this workspace?")) return;
    }
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.filter(i => i.id !== id)));
    refreshGrid();
    renderFilterOptions();
}

function convertDraft(id) {
    if(isArchiveView) return;
    const billNum = prompt("Enter the new Bill Number (e.g., HB 1234):");
    if(billNum) {
        let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const idx = items.findIndex(i => i.id === id);
        if(idx > -1) {
            items[idx].type = 'live';
            items[idx].status = 'Introduced';
            items[idx].title = billNum;
            items[idx].lastUpdated = getTimestamp();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            refreshGrid();
            renderFilterOptions();
        }
    }
}

function jumpToCompanion(companionName, originId) {
    if(!companionName) return;
    if(event) event.stopPropagation();

    const searchInput = document.getElementById('searchInput');
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    
    const target = items.find(i => i.title.toLowerCase().trim() === companionName.toLowerCase().trim() && !i.isArchived);

    if (target) {
        searchInput.value = target.title;
        refreshGrid();
        expandedCards.add(target.id);
        refreshGrid(); 
        
        document.getElementById('clearSearchBtn').classList.remove('hidden');
    } else {
        if(confirm(`Companion workspace "${companionName}" not found.\n\nCreate it now?`)) {
            const originItem = items.find(i => i.id === originId);
            
            let data = { 
                id: Date.now(), 
                type: 'live', 
                title: companionName,
                companion: originItem.title,
                committee: originItem.committee,
                longTitle: originItem.longTitle,
                sponsor: originItem.sponsor,
                url: "",
                status: "Introduced",
                taskProgress: {}, 
                customTasks: [], 
                liveNotes: `Created as companion to ${originItem.title}`, 
                lastUpdated: getTimestamp(), 
                hasAmendment: "No", 
                amendments: [], 
                hearingDate: "", 
                executiveActionDate: "", 
                isArchived: false, 
                companionStatus: "Alive"
            };
            items.push(data);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            
            searchInput.value = companionName;
            refreshGrid();
            document.getElementById('clearSearchBtn').classList.remove('hidden');
        }
    }
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('clearSearchBtn').classList.add('hidden');
    refreshGrid();
}

function showScreen(id) {
    if(isArchiveView && id !== 'sessionMenu') {
        alert("Please exit Archive View to create new items.");
        return;
    }
    hideAllModals();
    const form = document.getElementById(id);
    form.querySelectorAll('input, textarea, select').forEach(f => {
        if (f.tagName === 'SELECT') f.selectedIndex = 0; else f.value = '';
    });
    form.style.display = 'flex';
}

function createItem(type) {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    let data = { 
        id: Date.now(), type: type, taskProgress: {}, customTasks: [], liveNotes: "", lastUpdated: getTimestamp(), 
        hasAmendment: "No", amendments: [], hearingDate: "", executiveActionDate: "", 
        sponsor: "", longTitle: "", url: "", isArchived: false, companion: "", companionStatus: "Alive"
    };
    if (type === 'draft') {
        data.title = document.getElementById('draftTitle').value || "Untitled Draft";
        data.companion = document.getElementById('draftCompanion').value || "";
        data.committee = document.getElementById('draftCommittee').value;
        data.liveNotes = document.getElementById('draftBlurb').value || "";
        data.status = "Draft";
    } else {
        data.title = document.getElementById('existingNum').value || "New Bill";
        data.companion = document.getElementById('existingCompanion').value || "";
        data.longTitle = document.getElementById('existingTitle').value || "";
        data.sponsor = document.getElementById('existingSponsor').value || "";
        data.url = document.getElementById('existingUrl').value || "";
        data.committee = document.getElementById('existingCommittee').value;
        data.status = "Introduced";
    }
    items.push(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    refreshGrid();
    renderFilterOptions();
    hideAllModals();
}

function setSort(val) { currentSort = val; refreshGrid(); }
function setStatusFilter(val) { currentStatus = val; refreshGrid(); }
function setType(val) { currentType = val; refreshGrid(); }

function setView(view) {
    currentView = view;
    const btnGrid = document.getElementById('viewGrid');
    const btnList = document.getElementById('viewList');
    if(view === 'grid') {
        btnGrid.classList.add('bg-white', 'shadow-sm', 'text-blue-900');
        btnGrid.classList.remove('text-gray-500');
        btnList.classList.remove('bg-white', 'shadow-sm', 'text-blue-900');
        btnList.classList.add('text-gray-500');
    } else {
        btnList.classList.add('bg-white', 'shadow-sm', 'text-blue-900');
        btnList.classList.remove('text-gray-500');
        btnGrid.classList.remove('bg-white', 'shadow-sm', 'text-blue-900');
        btnGrid.classList.add('text-gray-500');
    }
    refreshGrid();
}

function addAmendment(id) {
    if(isArchiveView) return;
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === id);
    if(itemIdx > -1) {
        const input = document.getElementById(`amendInput_${id}`);
        const val = input.value.trim();
        if(val) {
            if(!items[itemIdx].amendments) items[itemIdx].amendments = [];
            items[itemIdx].amendments.push({ name: val, submitted: false });
            items[itemIdx].lastUpdated = getTimestamp();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            refreshGrid();
        }
    }
}

function toggleAmendment(id, idx) {
    if(isArchiveView) return;
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === id);
    if(itemIdx > -1 && items[itemIdx].amendments) {
        let amend = items[itemIdx].amendments[idx];
        if (typeof amend === 'string') amend = { name: amend, submitted: true }; 
        else amend.submitted = !amend.submitted;
        items[itemIdx].amendments[idx] = amend;
        items[itemIdx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
    }
}

function deleteAmendment(id, idx) {
    if(isArchiveView) return;
    event.stopPropagation();
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === id);
    if(itemIdx > -1 && items[itemIdx].amendments) {
        items[itemIdx].amendments.splice(idx, 1);
        items[itemIdx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
    }
}

function toggleCompanionStatus(id) {
    if(isArchiveView) return;
    if(event) event.stopPropagation();

    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === id);
    if (itemIdx > -1) {
        const current = items[itemIdx].companionStatus || 'Alive';
        let next = 'Alive';
        if (current === 'Alive') next = 'Dead';
        else if (current === 'Dead') next = 'Passed';
        else if (current === 'Passed') next = 'Alive';
        
        items[itemIdx].companionStatus = next;
        items[itemIdx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
    }
}

function toggleCard(id) {
    if (event.target.closest('a') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('.comp-tag')) return;

    if (expandedCards.has(id)) expandedCards.delete(id);
    else expandedCards.add(id);
    refreshGrid();
}

function updateField(id, field, value) {
    if(isArchiveView) return; 
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = items.findIndex(i => i.id === id);
    if (idx > -1) {
        items[idx][field] = value;
        if (field !== 'lastUpdated') items[idx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
        renderFilterOptions();
    }
}

function handleTask(id, tName, status) {
    if(isArchiveView) return; 
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const item = items.find(i => i.id === id);
    if (!item.taskProgress[status]) item.taskProgress[status] = {};
    if (item.taskProgress[status][tName]) delete item.taskProgress[status][tName];
    else item.taskProgress[status][tName] = true;
    item.lastUpdated = getTimestamp();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    refreshGrid();
}

function addCustomTask(id) {
    if(isArchiveView) return;
    const input = document.getElementById(`customTaskInput_${id}`);
    const val = input.value.trim();
    if(!val) return;
    
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === id);
    if(itemIdx > -1) {
        if(!items[itemIdx].customTasks) items[itemIdx].customTasks = [];
        items[itemIdx].customTasks.push({ id: Date.now(), text: val, done: false });
        items[itemIdx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
    }
}

function toggleCustomTask(itemId, taskId) {
    if(isArchiveView) return;
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === itemId);
    if(itemIdx > -1 && items[itemIdx].customTasks) {
        const taskIdx = items[itemIdx].customTasks.findIndex(t => t.id === taskId);
        if(taskIdx > -1) {
            items[itemIdx].customTasks[taskIdx].done = !items[itemIdx].customTasks[taskIdx].done;
            items[itemIdx].lastUpdated = getTimestamp();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
            refreshGrid();
        }
    }
}

function deleteCustomTask(itemId, taskId) {
    if(isArchiveView) return;
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const itemIdx = items.findIndex(i => i.id === itemId);
    if(itemIdx > -1 && items[itemIdx].customTasks) {
        items[itemIdx].customTasks = items[itemIdx].customTasks.filter(t => t.id !== taskId);
        items[itemIdx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
    }
}

function toggleDead(id) {
    if(isArchiveView) return; 
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const idx = items.findIndex(i => i.id === id);
    if (idx > -1) {
        if (items[idx].status === 'Dead') {
            items[idx].status = items[idx].type === 'draft' ? 'Draft' : 'Introduced';
        } else {
            items[idx].status = 'Dead';
            expandedCards.delete(id);
        }
        items[idx].lastUpdated = getTimestamp();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        refreshGrid();
        renderFilterOptions();
    }
}

function setCommittee(committee) { 
    currentCommittee = committee;
    refreshGrid();
}

function refreshGrid() {
    const grid = document.getElementById('billGrid');
    const searchVal = document.getElementById('searchInput').value.toLowerCase();
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if(searchVal) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');

    grid.innerHTML = '';
    let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    
    let countFiltered = items.filter(i => isArchiveView ? i.isArchived : !i.isArchived);

    if (currentType !== 'All') countFiltered = countFiltered.filter(i => i.type === currentType);
    if (currentStatus !== 'All') countFiltered = countFiltered.filter(i => i.status === currentStatus);
    if (searchVal) {
        countFiltered = countFiltered.filter(i => 
            i.title.toLowerCase().includes(searchVal) || 
            (i.longTitle && i.longTitle.toLowerCase().includes(searchVal)) ||
            (i.sponsor && i.sponsor.toLowerCase().includes(searchVal)) ||
            (i.archiveSessionName && i.archiveSessionName.toLowerCase().includes(searchVal)) ||
            (i.companion && i.companion.toLowerCase().includes(searchVal)) ||
            (i.liveNotes && i.liveNotes.toLowerCase().includes(searchVal))
        );
    }

    const cAll = countFiltered.filter(i => i.status !== 'Dead').length;
    const cHealth = countFiltered.filter(i => i.committee === 'Health Care' && i.status !== 'Dead').length;
    const cLocal = countFiltered.filter(i => i.committee === 'Local Government' && i.status !== 'Dead').length;
    const cDead = countFiltered.filter(i => i.status === 'Dead').length;

    document.getElementById('optAll').innerText = `All Active (${cAll})`;
    document.getElementById('optHealth').innerText = `Health Care (${cHealth})`;
    document.getElementById('optLocal').innerText = `Local Government (${cLocal})`;
    document.getElementById('optDead').innerText = `Archive / Dead (${cDead})`;
    document.getElementById('committeeSelect').value = currentCommittee;

    if (currentCommittee === 'All') items = countFiltered.filter(i => i.status !== 'Dead');
    else if (currentCommittee === 'Dead') items = countFiltered.filter(i => i.status === 'Dead');
    else items = countFiltered.filter(i => i.committee === currentCommittee && i.status !== 'Dead');

    items.sort((a, b) => {
        if (currentSort === 'alpha') {
            return a.title.localeCompare(b.title, undefined, {numeric: true, sensitivity: 'base'});
        } else {
            const getPriority = (item) => {
                if (item.status === 'Dead') return 4;
                const diffDays = (new Date() - new Date(item.lastUpdated)) / (1000 * 60 * 60 * 24);
                if (diffDays >= 3) return 1; 
                if (diffDays >= 1) return 2; 
                return 3; 
            };
            const pA = getPriority(a);
            const pB = getPriority(b);
            if (pA !== pB) return pA - pB;
            return b.id - a.id; 
        }
    });

    items.forEach(item => {
        if(currentView === 'grid') renderCard(item);
        else renderListRow(item);
    });
    renderFilterOptions(); 
}

function renderDetailsContent(item, status, progress, taskList, showAmendments, showHearingDate, showExecDate, baseDateVal) {
    return `
    <div id="details_${item.id}" class="px-6 pb-6 pt-2 border-t border-gray-50 ${expandedCards.has(item.id) ? '' : 'details-hidden'} ${currentView === 'list' ? 'bg-gray-50 border-t border-gray-200' : ''}">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400">Tasks</h3>
                    ${item.type !== 'draft' && !isArchiveView ?
                    `<select onchange="updateField(${item.id}, 'status', this.value)" class="text-[10px] font-black uppercase bg-gray-100 px-2 py-1 rounded">
                        ${LIVE_STATUS_OPTIONS.map(opt => `<option value="${opt}" ${status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                    </select>` : ''}
                </div>
                
                <div class="bg-yellow-50 p-2 rounded border border-yellow-100 mb-2">
                     <div class="space-y-1 mb-2">
                        ${(item.customTasks || []).map(t => `
                            <div class="flex items-center justify-between group">
                                <label class="flex items-center gap-2 cursor-pointer w-full">
                                    <input type="checkbox" onchange="toggleCustomTask(${item.id}, ${t.id})" ${t.done ? 'checked' : ''} ${isArchiveView ? 'disabled' : ''} class="h-3 w-3 rounded text-yellow-600 border-yellow-400 focus:ring-yellow-500">
                                    <span class="text-xs ${t.done ? 'text-gray-400 line-through' : 'font-bold text-gray-700'} break-all">${t.text}</span>
                                </label>
                                ${!isArchiveView ? `<button onclick="deleteCustomTask(${item.id}, ${t.id})" class="text-red-300 hover:text-red-500 font-bold px-1 opacity-0 group-hover:opacity-100">×</button>` : ''}
                            </div>
                        `).join('')}
                     </div>
                     ${!isArchiveView ? `
                         <div class="flex gap-1">
                            <input type="text" id="customTaskInput_${item.id}" placeholder="Add specific task..." class="flex-1 text-[10px] bg-white border border-yellow-200 rounded px-2 py-1 outline-none focus:border-yellow-500">
                            <button onclick="addCustomTask(${item.id})" class="bg-yellow-200 hover:bg-yellow-300 text-yellow-800 text-[10px] font-bold px-2 rounded">+</button>
                         </div>
                     ` : ''}
                </div>

                ${showHearingDate ? `
                    <div class="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-100 mb-2">
                        <span class="text-[10px] font-black uppercase text-blue-800">Hearing Date:</span>
                        <input type="date" value="${baseDateVal}" ${isArchiveView ? 'disabled' : ''} onchange="updateField(${item.id}, 'hearingDate', this.value)" class="text-xs bg-transparent font-bold text-blue-900 outline-none">
                    </div>
                ` : ''}
                ${showExecDate ? `
                    <div class="flex items-center gap-2 bg-blue-50 p-2 rounded border border-blue-100 mb-2">
                        <span class="text-[10px] font-black uppercase text-blue-800">Exec Date:</span>
                        <input type="date" value="${baseDateVal}" ${isArchiveView ? 'disabled' : ''} onchange="updateField(${item.id}, 'executiveActionDate', this.value)" class="text-xs bg-transparent font-bold text-blue-900 outline-none">
                    </div>
                ` : ''}

                <div class="space-y-1">
                    ${taskList.map(t => {
                        const isObj = typeof t === 'object';
                        const tName = isObj ? t.name : t;
                        const done = progress[tName];
                        let deadlineHTML = "";
                        if (isObj && t.days && baseDateVal) {
                            const deadline = calculateDeadline(baseDateVal, t.days);
                            if (deadline) {
                                const dlStr = deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                const urgencyClass = getDeadlineStatus(deadline);
                                deadlineHTML = `<span class="text-[10px] ml-auto ${urgencyClass}">Due: ${dlStr}</span>`;
                            }
                        }
                        return `
                            <div class="task-item flex items-center justify-between">
                                <label class="flex items-center gap-3 text-sm cursor-pointer w-full">
                                    <input type="checkbox" onchange="handleTask(${item.id}, '${tName}', '${status}')" ${done ? 'checked' : ''} ${isArchiveView ? 'disabled' : ''} class="h-4 w-4 rounded text-blue-900 border-gray-300 transition-all flex-shrink-0">
                                    <span class="${done ? 'text-gray-400 line-through' : 'font-bold text-gray-700'} truncate">${tName}</span>
                                    ${!done ? deadlineHTML : ''}
                                </label>
                            </div>`;
                    }).join('')}
                </div>
                
                ${showAmendments ? `
                    <div class="mt-6 pt-4 border-t border-gray-100">
                        <h3 class="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Proposed Subs & Amendments</h3>
                        <div class="space-y-2 mb-2">
                            ${(item.amendments || []).map((amend, idx) => {
                                const name = typeof amend === 'string' ? amend : amend.name;
                                const isSub = typeof amend === 'object' && amend.submitted;
                                return `
                                <div onclick="toggleAmendment(${item.id}, ${idx})" class="amend-box flex items-center justify-between px-2 py-2 rounded border ${isSub ? 'amend-submitted' : 'amend-draft'}" title="Click to toggle status">
                                    <div class="flex items-center gap-2">
                                        <span class="text-xs font-bold">${name}</span>
                                        ${isSub ? '<span class="text-[10px] bg-green-200 text-green-800 px-1 rounded-sm">✓ Submitted</span>' : ''}
                                    </div>
                                    ${!isArchiveView ? `<button onclick="deleteAmendment(${item.id}, ${idx})" class="text-red-300 hover:text-red-500 font-black px-1 opacity-60 hover:opacity-100">×</button>` : ''}
                                </div>
                            `}).join('')}
                        </div>
                        ${!isArchiveView ? `
                        <div class="flex gap-2">
                            <input type="text" id="amendInput_${item.id}" placeholder="e.g. H-2314.1" class="flex-1 text-xs border rounded px-2 py-1 focus:border-blue-900 outline-none">
                            <button onclick="addAmendment(${item.id})" class="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] font-black uppercase px-2 rounded">Add</button>
                        </div>` : ''}
                    </div>
                ` : ''}
            </div>

            <div class="space-y-4 flex flex-col h-full">
                <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 flex-1 flex flex-col">
                    <div class="flex justify-between items-center mb-2">
                        <label class="text-[10px] font-black text-gray-400 uppercase">Workspace Notes</label>
                        ${!isArchiveView ? `<button onclick="insertTimestamp(${item.id})" class="text-[9px] font-bold text-blue-600 bg-blue-100 px-2 py-1 rounded hover:bg-blue-200 uppercase">Timestamp</button>` : ''}
                    </div>
                    <textarea id="notes_${item.id}" onchange="updateField(${item.id}, 'liveNotes', this.value)" ${isArchiveView ? 'readonly' : ''} class="w-full bg-transparent text-sm italic flex-1 focus:outline-none resize-none" placeholder="Draft talking points or staff notes...">${item.liveNotes || ""}</textarea>
                </div>
                <div class="pt-4 flex justify-between items-center border-t border-gray-100 mt-auto">
                    <div class="flex flex-col">
                        <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Workspace Timeline</span>
                        <span class="text-[11px] font-bold text-blue-900">Modified: ${formatTimestamp(item.lastUpdated)}</span>
                    </div>
                    <div class="flex gap-2">
                        ${!isArchiveView ? `
                            <button onclick="updateField(${item.id}, 'lastUpdated', getTimestamp())" class="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded uppercase hover:bg-blue-100 transition">Check In</button>
                            ${item.type === 'draft' ? 
                                `<button onclick="convertDraft(${item.id})" class="text-[10px] font-black text-white bg-green-600 px-4 py-2 rounded uppercase hover:bg-green-700 transition shadow-sm">Promote to Bill</button>` 
                            : ''}
                            <button onclick="toggleDead(${item.id})" class="text-[10px] font-black ${item.status === 'Dead' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'} px-4 py-2 rounded uppercase transition">${item.status === 'Dead' ? 'Revive' : 'Mark Dead'}</button>
                            <button onclick="triggerEdit(${item.id})" class="bg-gray-100 text-gray-600 text-[10px] font-black px-4 py-2 rounded uppercase hover:bg-gray-200 transition">Edit</button>
                        ` : ''}
                        <button onclick="deleteItem(${item.id})" class="bg-red-50 text-red-500 text-[10px] font-black px-4 py-2 rounded uppercase hover:bg-red-100 transition">Delete</button>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function renderListRow(item) {
    const grid = document.getElementById('billGrid');
    const isDraft = item.type === 'draft';
    const status = item.status || (isDraft ? "Draft" : "Introduced");
    const taskList = STATUS_TASKS[status] || STATUS_TASKS["Default"];
    const progress = item.taskProgress[status] || {};
    const showAmendments = ['Executive Action', 'Floor'].includes(status);
    const showHearingDate = status === 'Public Hearing';
    const showExecDate = status === 'Executive Action';
    const baseDateVal = showHearingDate ? (item.hearingDate || '') : (showExecDate ? (item.executiveActionDate || '') : '');

    const statusIndex = LIVE_STATUS_OPTIONS.indexOf(status);
    const totalSteps = LIVE_STATUS_OPTIONS.length;
    const hue = isDraft ? 25 : (statusIndex / (totalSteps - 1)) * 120;
    const colorClass = item.status === 'Dead' ? 'bg-slate-400' : '';
    const colorStyle = item.status !== 'Dead' ? `background-color: hsl(${hue}, 80%, 45%)` : '';

    let urgentText = "";
    taskList.forEach(t => {
        if (typeof t === 'object' && t.days && baseDateVal && !progress[t.name]) {
            const deadline = calculateDeadline(baseDateVal, t.days);
            const urgencyClass = getDeadlineStatus(deadline);
            if (urgencyClass.includes('red') || urgencyClass.includes('orange')) {
                 const dlStr = deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                 urgentText = `<span class="${urgencyClass} text-[10px] uppercase ml-2">Due: ${dlStr}</span>`;
            }
        }
    });

    let compPill = "";
    if (item.companion) {
        const cStatus = item.companionStatus || 'Alive';
        let cClass = "comp-alive";
        if (cStatus === 'Dead') cClass = "comp-dead";
        if (cStatus === 'Passed') cClass = "comp-passed";
        
        compPill = `
        <div class="flex items-center ml-2 group">
             <div onclick="toggleCompanionStatus(${item.id})" class="text-[9px] font-bold px-1.5 py-0.5 rounded-l border-y border-l ${cClass} comp-tag" title="Click to cycle status">${item.companion}</div>
             <button onclick="jumpToCompanion('${item.companion}', ${item.id})" class="bg-gray-100 hover:bg-blue-100 text-blue-900 border border-gray-300 text-[9px] font-black px-1.5 py-0.5 rounded-r transition" title="Go to Companion Workspace">⇄</button>
        </div>
        `;
    }

    const card = document.createElement('div');
    card.className = `bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden ${item.status === 'Dead' ? 'opacity-75' : ''}`;
    card.innerHTML = `
        <div class="flex items-center p-3 gap-4 cursor-pointer hover:bg-gray-50 transition" onclick="toggleCard(${item.id})">
            <div class="w-1.5 h-8 rounded-full ${colorClass}" style="${colorStyle}"></div>
            
            <div class="w-24 font-black text-blue-900 leading-tight">
                ${item.url ? `<a href="${item.url}" target="_blank" onclick="event.stopPropagation();" class="hover:underline">${item.title}</a>` : item.title}
            </div>
            
            <div class="flex-1 min-w-0">
                <div class="flex items-center">
                    <span class="text-sm font-bold text-gray-700 truncate">${item.longTitle || '---'}</span>
                    ${compPill} ${urgentText}
                </div>
            </div>
            
            <div class="hidden md:block w-32 truncate text-xs font-bold text-gray-500">${item.sponsor}</div>
            
            <div class="px-2 py-0.5 ${item.isArchived ? 'badge-archive' : (item.committee === 'Health Care' ? 'badge-health' : 'badge-local')} text-[8px] font-black uppercase rounded whitespace-nowrap shadow-sm">
                ${item.isArchived ? (item.archiveSessionName || 'Archived') : item.committee}
            </div>
            
            <div class="w-24 text-right text-xs font-bold text-blue-900 whitespace-nowrap">${status}</div>
        </div>
        ${renderDetailsContent(item, status, progress, taskList, showAmendments, showHearingDate, showExecDate, baseDateVal)}
    `;
    grid.appendChild(card);
}

function renderCard(item) {
    const grid = document.getElementById('billGrid');
    const isDraft = item.type === 'draft';
    const isDead = item.status === 'Dead';
    const status = item.status || (isDraft ? "Draft" : "Introduced");
    const taskList = STATUS_TASKS[status] || STATUS_TASKS["Default"];
    const progress = item.taskProgress[status] || {};
    const showAmendments = ['Executive Action', 'Floor'].includes(status);
    const showHearingDate = status === 'Public Hearing';
    const showExecDate = status === 'Executive Action';
    const baseDateVal = showHearingDate ? (item.hearingDate || '') : (showExecDate ? (item.executiveActionDate || '') : '');

    const lastUpdateDate = new Date(item.lastUpdated);
    const diffDays = (new Date() - lastUpdateDate) / (1000 * 60 * 60 * 24);
    let staleDot = "";
    if (!isDead && !isArchiveView) {
        if (diffDays >= 3) staleDot = `<div onclick="event.stopPropagation(); triggerStaleCheck(${item.id})" class="h-3 w-3 rounded-full bg-red-500 pulse cursor-pointer shadow-lg" title="Stale: >3 days"></div>`;
        else if (diffDays >= 1) staleDot = `<div onclick="event.stopPropagation(); triggerStaleCheck(${item.id})" class="h-3 w-3 rounded-full bg-yellow-400 cursor-pointer shadow-md" title="Needs Review: >1 day"></div>`;
        else staleDot = `<div class="h-3 w-3 rounded-full bg-green-500 shadow-sm" title="Active: Updated recently"></div>`;
    }

    const statusIndex = LIVE_STATUS_OPTIONS.indexOf(status);
    const totalSteps = LIVE_STATUS_OPTIONS.length;
    const progressPercent = isDraft ? 5 : ((statusIndex + 1) / totalSteps) * 100;
    const hue = isDraft ? 25 : (statusIndex / (totalSteps - 1)) * 120;
    const barColor = isDead ? '#64748b' : `hsl(${hue}, 80%, 45%)`;

    let compTag = "";
    if(item.companion) {
        const cStatus = item.companionStatus || 'Alive';
        let cClass = "comp-alive";
        if (cStatus === 'Dead') cClass = "comp-dead";
        if (cStatus === 'Passed') cClass = "comp-passed";
        
        compTag = `
        <div class="flex items-center gap-1 mt-1">
            <div onclick="toggleCompanionStatus(${item.id})" class="text-[10px] font-bold px-1.5 py-0.5 rounded border comp-tag flex-1 text-center ${cClass}" title="Click to cycle status">Comp: ${item.companion}</div>
            <button onclick="jumpToCompanion('${item.companion}', ${item.id})" class="bg-gray-100 hover:bg-blue-100 text-blue-900 border border-gray-300 text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm" title="Switch to Companion Workspace">⇄ Switch</button>
        </div>
        `;
    }

    const card = document.createElement('div');
    card.className = `workspace-card bg-white rounded-xl shadow-md ${isArchiveView ? 'archive-border' : (isDead ? 'dead-border' : (isDraft ? 'draft-border' : 'live-border'))} border border-gray-100 overflow-hidden ${isDead ? 'grayscale-[0.5]' : ''}`;
    card.innerHTML = `
        <div class="p-5 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition" onclick="toggleCard(${item.id})">
            <div class="flex flex-col md:flex-row md:items-center gap-2 md:gap-8 flex-1 overflow-hidden">
                <div class="w-64 flex-shrink-0 flex items-center gap-3 pr-4">
                    <div class="w-3 flex-shrink-0">${staleDot}</div>
                    <div class="flex-1">
                        ${item.url ? `<a href="${item.url}" target="_blank" onclick="event.stopPropagation();" class="text-xl font-black text-blue-800 hover:underline decoration-blue-300 leading-tight">${item.title}</a>` : `<span class="text-xl font-black text-gray-800 leading-tight">${item.title}</span>`}
                        ${compTag} </div>
                    <div class="px-2 py-0.5 ${item.isArchived ? 'badge-archive' : (item.committee === 'Health Care' ? 'badge-health' : 'badge-local')} text-[8px] font-black uppercase rounded whitespace-nowrap shadow-sm">
                        ${item.isArchived ? (item.archiveSessionName || 'Archived') : item.committee}
                    </div>
                </div>
                <div class="md:border-l md:pl-8 flex-1 flex flex-col md:flex-row gap-4 md:gap-12 overflow-hidden">
                    <div class="flex-1 min-w-0">
                        <span class="text-[9px] font-black uppercase text-gray-400 block tracking-widest">Summary</span>
                        <span class="text-[11px] text-gray-700 font-bold line-clamp-1 truncate">${item.longTitle || '---'}</span>
                    </div>
                </div>
                <div class="md:border-l md:pl-8 w-44 flex-shrink-0">
                    <span class="text-[9px] font-black uppercase text-gray-400 block tracking-widest mb-1">Session Progress</span>
                    <div class="relative w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-1">
                        <div class="h-full transition-all duration-700 ease-in-out" style="width: ${progressPercent}%; background-color: ${barColor}"></div>
                    </div>
                    <span class="text-[10px] font-black uppercase whitespace-nowrap block overflow-hidden truncate text-[#002e5d]">${status}</span>
                </div>
            </div>
        </div>
        ${renderDetailsContent(item, status, progress, taskList, showAmendments, showHearingDate, showExecDate, baseDateVal)}
    `;
    grid.appendChild(card);
}

renderFilterOptions();
refreshGrid();
