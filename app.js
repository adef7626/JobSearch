// AeroJob Frontend Client Controller with Caching, Filters, and Kanban Sync

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    resumeText: '',
    jobs: [], // Search results list
    applications: [], // Kanban tracker cards
    activeFilter: 'all', // Results match-score filter
    geminiKey: localStorage.getItem('gemini_api_key') || '',
    activeTab: 'finder-tab' // Active navigation view
  };

  // DOM Elements - General / Nav
  const appNav = document.querySelector('.app-nav');
  const navTabs = document.querySelectorAll('.nav-tab');
  const criteriaTabContent = document.getElementById('criteriaTabContent');
  const resultsTabContent = document.getElementById('resultsTabContent');
  const trackerTabContent = document.getElementById('trackerTabContent');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const geminiKeyInput = document.getElementById('geminiKeyInput');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const deleteKeyBtn = document.getElementById('deleteKeyBtn');

  // DOM Elements - Criteria & Setup
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const fileStatus = document.getElementById('fileStatus');
  const fileNameDisplay = document.getElementById('fileName');
  const fileSizeDisplay = document.getElementById('fileSize');
  const removeFileBtn = document.getElementById('removeFileBtn');
  const resumePreviewText = document.getElementById('resumePreviewText');
  const parsedPreviewBox = document.getElementById('parsedPreviewBox');
  
  const searchForm = document.getElementById('searchForm');
  const positionsInput = document.getElementById('positionsInput');
  const industrySelect = document.getElementById('industrySelect');
  const companiesInput = document.getElementById('companiesInput');
  const locationsSelect = document.getElementById('locationsSelect');

  // DOM Elements - Resume Modal
  const resumeModal = document.getElementById('resumeModal');
  const closeResumeBtn = document.getElementById('closeResumeBtn');
  const closeResumeModalBtn = document.getElementById('closeResumeModalBtn');
  const copyResumeBtn = document.getElementById('copyResumeBtn');
  const resumeModalFilename = document.getElementById('resumeModalFilename');
  const resumeWordCount = document.getElementById('resumeWordCount');
  const resumeCharCount = document.getElementById('resumeCharCount');
  const resumeModalContent = document.getElementById('resumeModalContent');
  const experienceSelect = document.getElementById('experienceSelect');
  const workModeSelect = document.getElementById('workModeSelect');
  const jobTypeSelect = document.getElementById('jobTypeSelect');
  const searchBtn = document.getElementById('searchBtn');
  
  const dashboardStats = document.getElementById('dashboardStats');
  const statJobsFound = document.getElementById('statJobsFound');
  const statAvgMatch = document.getElementById('statAvgMatch');
  const statHighMatches = document.getElementById('statHighMatches');
  
  const resultsFilters = document.getElementById('resultsFilters');
  const filterChips = document.querySelectorAll('.filter-chip');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  
  const emptyState = document.getElementById('emptyState');
  const loadingState = document.getElementById('loadingState');
  const scraperLiveStatus = document.getElementById('scraperLiveStatus');
  const errorState = document.getElementById('errorState');
  const errorTitle = document.getElementById('errorTitle');
  const errorDesc = document.getElementById('errorDesc');
  
  const resultsTableWrapper = document.getElementById('resultsTableWrapper');
  const jobsList = document.getElementById('jobsList');

  // DOM Elements - Match Details Modal
  const matchModal = document.getElementById('matchModal');
  const closeMatchBtn = document.getElementById('closeMatchBtn');
  const modalJobTitle = document.getElementById('modalJobTitle');
  const modalJobCompany = document.getElementById('modalJobCompany');
  const modalScoreValue = document.getElementById('modalScoreValue');
  const scoreRingProgress = document.getElementById('scoreRingProgress');
  const modalFitLevel = document.getElementById('modalFitLevel');
  const modalSummary = document.getElementById('modalSummary');
  const modalMatchMethod = document.getElementById('modalMatchMethod');
  const modalMatchingSkills = document.getElementById('modalMatchingSkills');
  const modalMissingSkills = document.getElementById('modalMissingSkills');
  const modalJobDescription = document.getElementById('modalJobDescription');
  const modalJobLink = document.getElementById('modalJobLink');

  // DOM Elements - Kanban Board
  const addManualCardBtn = document.getElementById('addManualCardBtn');
  const columnsCards = {
    Saved: document.getElementById('cardsSaved'),
    Applied: document.getElementById('cardsApplied'),
    Interviewing: document.getElementById('cardsInterviewing'),
    Offer: document.getElementById('cardsOffer'),
    Rejected: document.getElementById('cardsRejected')
  };
  const columnsCounts = {
    Saved: document.getElementById('countSaved'),
    Applied: document.getElementById('countApplied'),
    Interviewing: document.getElementById('countInterviewing'),
    Offer: document.getElementById('countOffer'),
    Rejected: document.getElementById('countRejected')
  };

  // DOM Elements - Kanban Card Modal
  const kanbanCardModal = document.getElementById('kanbanCardModal');
  const closeCardModalBtn = document.getElementById('closeCardModalBtn');
  const cardDetailsForm = document.getElementById('cardDetailsForm');
  const cardIdInput = document.getElementById('cardIdInput');
  const cardTitleInput = document.getElementById('cardTitleInput');
  const cardCompanyInput = document.getElementById('cardCompanyInput');
  const cardLocationInput = document.getElementById('cardLocationInput');
  const cardUrlInput = document.getElementById('cardUrlInput');
  const cardColumnSelect = document.getElementById('cardColumnSelect');
  const cardSalaryInput = document.getElementById('cardSalaryInput');
  const cardContactNameInput = document.getElementById('cardContactNameInput');
  const cardContactEmailInput = document.getElementById('cardContactEmailInput');
  const cardInterviewInput = document.getElementById('cardInterviewInput');
  const cardNotesInput = document.getElementById('cardNotesInput');
  const deleteCardBtn = document.getElementById('deleteCardBtn');

  // Clear any old backend URL storage if existing
  localStorage.removeItem('backend_server_url');

  // Helper to build API endpoints dynamically
  function getApiUrl(endpoint) {
    const DEPLOYED_BACKEND_URL = 'https://jobsearch-inkz.onrender.com';
    // If running locally, route to relative localhost path, otherwise route to live Render URL
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return endpoint;
    }
    return DEPLOYED_BACKEND_URL + endpoint;
  }

  // Load API Key
  if (state.geminiKey) {
    geminiKeyInput.value = state.geminiKey;
  }

  // Fetch applications list on launch
  fetchApplications();

  // --- Tab Switch Toggle Events ---
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      switchTab(tabName);
    });
  });

  function switchTab(tabName) {
    state.activeTab = tabName;
    
    navTabs.forEach(t => {
      if (t.getAttribute('data-tab') === tabName) t.classList.add('active');
      else t.classList.remove('active');
    });

    criteriaTabContent.classList.add('hidden');
    resultsTabContent.classList.add('hidden');
    trackerTabContent.classList.add('hidden');

    if (tabName === 'criteria-tab') {
      criteriaTabContent.classList.remove('hidden');
    } else if (tabName === 'results-tab') {
      resultsTabContent.classList.remove('hidden');
    } else if (tabName === 'tracker-tab') {
      trackerTabContent.classList.remove('hidden');
      renderKanbanBoard();
    }
  }

  // --- Settings Modal Events ---
  settingsBtn.addEventListener('click', () => {
    geminiKeyInput.value = state.geminiKey;
    settingsModal.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
  saveSettingsBtn.addEventListener('click', () => {
    const key = geminiKeyInput.value.trim();
    state.geminiKey = key;
    if (key) localStorage.setItem('gemini_api_key', key);
    else localStorage.removeItem('gemini_api_key');
    settingsModal.classList.add('hidden');
    showNotification('Configuration Settings saved!');
  });

  deleteKeyBtn.addEventListener('click', () => {
    state.geminiKey = '';
    geminiKeyInput.value = '';
    localStorage.removeItem('gemini_api_key');
    settingsModal.classList.add('hidden');
    showNotification('API Key deleted successfully!');
  });

  // Close modals clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
    if (e.target === matchModal) matchModal.classList.add('hidden');
    if (e.target === kanbanCardModal) kanbanCardModal.classList.add('hidden');
    if (e.target === resumeModal) resumeModal.classList.add('hidden');
  });

  // --- Resume Drag & Drop ---
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileUpload(fileInput.files[0]);
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetUploadState();
  });

  async function handleFileUpload(file) {
    const validExtensions = ['.pdf', '.txt'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
      showErrorModal('Invalid File Type', 'Please upload a PDF (.pdf) or Plain Text (.txt) file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showErrorModal('File Too Large', 'Maximum file size supported is 5MB.');
      return;
    }

    dropzone.classList.add('hidden');
    fileStatus.classList.remove('hidden');
    fileNameDisplay.textContent = file.name;
    fileSizeDisplay.textContent = formatBytes(file.size);
    resumePreviewText.textContent = 'Extracting resume document data...';
    searchBtn.disabled = true;

    const formData = new FormData();
    formData.append('resume', file);

    try {
      const response = await fetch(getApiUrl('/api/upload-resume'), {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Parse fail');

      state.resumeText = data.resumeText;
      resumePreviewText.textContent = data.preview;
      searchBtn.disabled = false;
      showNotification('Resume processed successfully!');
    } catch (error) {
      console.error(error);
      resetUploadState();
      showErrorModal('Parsing Failure', error.message || 'Could not parse document data.');
    }
  }

  function resetUploadState() {
    state.resumeText = '';
    fileInput.value = '';
    fileStatus.classList.add('hidden');
    dropzone.classList.remove('hidden');
    searchBtn.disabled = true;
  }

  // --- Search Jobs Trigger & Live Logger Ticker ---
  let statusTickerInterval = null;
  const loadingMessages = [
    '🔍 Initiating connection hooks...',
    '🔍 Scraping LinkedIn public guest jobs API...',
    '🔍 Pulling data from Naukri job search index...',
    '🔍 Checking Greenhouse and Lever company boards...',
    '📊 Extracting job details and resolving locations...',
    '📊 Standardizing results and sorting entries...',
    '⚡ Running local TF-IDF Cosine Similarity engine...',
    '🤖 Fetching semantic match insights from Gemini AI...'
  ];

  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.resumeText) return;

    const positions = positionsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    const companies = companiesInput.value.split(',').map(s => s.trim()).filter(Boolean);
    
    // Get location text from dropdown select
    const selectedLocationText = locationsSelect.value === 'all' ? '' : locationsSelect.options[locationsSelect.selectedIndex].text;
    const locations = selectedLocationText ? [selectedLocationText] : [];
    
    const industry = industrySelect.value;
    const experience = experienceSelect.value;
    const workMode = workModeSelect.value;
    const jobType = jobTypeSelect.value;

    // View Loading & Spin up Status Ticker
    switchTab('results-tab'); // Automatically switch to Match Results tab
    setViewState('loading');
    let messageIndex = 0;
    scraperLiveStatus.textContent = loadingMessages[0];
    statusTickerInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % loadingMessages.length;
      scraperLiveStatus.textContent = loadingMessages[messageIndex];
    }, 3200);

    try {
      const response = await fetch(getApiUrl('/api/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: state.resumeText,
          positions,
          companies,
          locations,
          industry,
          geminiKey: state.geminiKey,
          experience,
          workMode,
          jobType
        })
      });

      const data = await response.json();
      clearInterval(statusTickerInterval);

      if (!response.ok) throw new Error(data.error || 'Search route failed');

      state.jobs = data.jobs;

      if (state.jobs.length === 0) {
        setViewState('empty');
        showNotification('No jobs matched your selected filters.');
        return;
      }

      updateDashboard(data.totalFound);
      state.activeFilter = 'all';
      updateActiveFilterChip();
      renderJobsTable();
      setViewState('results');
    } catch (error) {
      clearInterval(statusTickerInterval);
      console.error(error);
      setViewState('error', 'Search Error', error.message || 'An error occurred during search aggregation.');
    }
  });

  // --- Filter Results Chip clicks ---
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      state.activeFilter = chip.getAttribute('data-filter');
      updateActiveFilterChip();
      renderJobsTable();
    });
  });

  function updateActiveFilterChip() {
    filterChips.forEach(c => {
      if (c.getAttribute('data-filter') === state.activeFilter) c.classList.add('active');
      else c.classList.remove('active');
    });
  }

  // --- Render Match Table ---
  function renderJobsTable() {
    jobsList.innerHTML = '';

    const filteredJobs = state.jobs.filter(job => {
      if (state.activeFilter === 'all') return true;
      if (state.activeFilter === 'high') return job.score >= 70;
      if (state.activeFilter === 'medium') return job.score >= 40 && job.score < 70;
      if (state.activeFilter === 'low') return job.score < 40;
      return true;
    });

    if (filteredJobs.length === 0) {
      jobsList.innerHTML = `
        <tr>
          <td colspan="6" class="text-center" style="padding: 40px; color: var(--text-muted);">
            <i class="fa-solid fa-folder-open" style="font-size: 1.5rem; margin-bottom: 8px; display: block;"></i>
            No results match this filter.
          </td>
        </tr>
      `;
      return;
    }

    filteredJobs.forEach((job) => {
      const tr = document.createElement('tr');
      tr.className = 'animate-fade-in';

      let platformClass = 'platform-badge';
      const src = job.source.toLowerCase();
      if (src.includes('linkedin')) platformClass += ' platform-linkedin';
      else if (src.includes('naukri')) platformClass += ' platform-naukri';
      else if (src.includes('lever')) platformClass += ' platform-lever';
      else if (src.includes('greenhouse')) platformClass += ' platform-greenhouse';

      let scoreColorClass = 'score-indicator';
      if (job.score >= 70) scoreColorClass += ' score-high';
      else if (job.score >= 40) scoreColorClass += ' score-medium';
      else scoreColorClass += ' score-low';

      const jobIndex = state.jobs.indexOf(job);
      
      // Check if job is already saved to Kanban Board to toggle Save Button state
      const isSaved = state.applications.some(a => a.title.toLowerCase() === job.title.toLowerCase() && a.company.toLowerCase() === job.company.toLowerCase());

      tr.innerHTML = `
        <td>
          <div class="job-cell-title">${escapeHTML(job.title)}</div>
          <span class="job-cell-sub">${escapeHTML(job.date)}</span>
        </td>
        <td>${escapeHTML(job.company)}</td>
        <td><i class="fa-solid fa-location-dot" style="font-size: 0.8rem; color: var(--text-muted); margin-right: 4px;"></i> ${escapeHTML(job.location)}</td>
        <td><span class="${platformClass}">${escapeHTML(job.source)}</span></td>
        <td class="text-center">
          <span class="${scoreColorClass}">${job.score}%</span>
        </td>
        <td class="text-right" style="white-space: nowrap;">
          <button class="btn btn-secondary btn-sm inspect-btn" data-index="${jobIndex}">
            <i class="fa-solid fa-chart-simple"></i> Details
          </button>
          <button class="btn ${isSaved ? 'btn-secondary' : 'btn-primary'} btn-sm save-board-btn" data-index="${jobIndex}" ${isSaved ? 'disabled' : ''}>
            <i class="fa-solid ${isSaved ? 'fa-circle-check' : 'fa-bookmark'}"></i> ${isSaved ? 'Saved' : 'Save'}
          </button>
          <a href="${job.url}" target="_blank" class="btn btn-gradient btn-sm" style="margin-left: 6px;">
            Apply <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem;"></i>
          </a>
        </td>
      `;
      jobsList.appendChild(tr);
    });

    // Wire Details Inspect Trigger
    document.querySelectorAll('.inspect-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openMatchDetails(parseInt(btn.getAttribute('data-index'), 10));
      });
    });

    // Wire Save to Kanban Pipeline Trigger
    document.querySelectorAll('.save-board-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'), 10);
        saveJobToPipeline(index, btn);
      });
    });
  }

  function updateDashboard(totalFound) {
    const matchScores = state.jobs.map(j => j.score);
    const sum = matchScores.reduce((a, b) => a + b, 0);
    const avg = matchScores.length > 0 ? Math.round(sum / matchScores.length) : 0;
    const highMatches = state.jobs.filter(j => j.score >= 70).length;

    statJobsFound.textContent = totalFound;
    statAvgMatch.textContent = avg + '%';
    statHighMatches.textContent = highMatches;
  }

  // --- Inspect Match Details Modal ---
  function openMatchDetails(index) {
    const job = state.jobs[index];
    if (!job) return;

    modalJobTitle.textContent = job.title;
    modalJobCompany.textContent = job.company;
    modalScoreValue.textContent = job.score + '%';
    modalMatchMethod.textContent = job.matchMethod;
    modalSummary.textContent = job.summary;
    modalJobDescription.textContent = job.description || 'No description snippet available.';
    modalJobLink.href = job.url;

    // SVG Score Circle Animate
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (job.score / 100) * circumference;
    scoreRingProgress.style.strokeDasharray = `${circumference} ${circumference}`;
    scoreRingProgress.style.strokeDashoffset = offset;

    if (job.score >= 70) scoreRingProgress.style.stroke = 'var(--color-high)';
    else if (job.score >= 40) scoreRingProgress.style.stroke = 'var(--color-medium)';
    else scoreRingProgress.style.stroke = 'var(--color-low)';

    modalFitLevel.className = 'badge';
    if (job.fitLevel === 'High') {
      modalFitLevel.classList.add('badge-high');
      modalFitLevel.textContent = 'High Compatibility';
    } else if (job.fitLevel === 'Medium') {
      modalFitLevel.classList.add('badge-medium');
      modalFitLevel.textContent = 'Medium Compatibility';
    } else {
      modalFitLevel.classList.add('badge-low');
      modalFitLevel.textContent = 'Low Compatibility';
    }

    modalMatchingSkills.innerHTML = '';
    if (job.matchingSkills && job.matchingSkills.length > 0) {
      job.matchingSkills.forEach(skill => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-high); margin-right: 6px;"></i> ${escapeHTML(skill)}`;
        modalMatchingSkills.appendChild(li);
      });
    } else {
      modalMatchingSkills.innerHTML = `
        <li style="color: var(--text-muted); font-style: italic;">
          ${state.geminiKey ? 'No matching skills found.' : 'Requires Gemini API Key for semantic skills extraction.'}
        </li>
      `;
    }

    modalMissingSkills.innerHTML = '';
    if (job.missingSkills && job.missingSkills.length > 0) {
      job.missingSkills.forEach(skill => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color: var(--color-medium); margin-right: 6px;"></i> ${escapeHTML(skill)}`;
        modalMissingSkills.appendChild(li);
      });
    } else {
      modalMissingSkills.innerHTML = `
        <li style="color: var(--text-muted); font-style: italic;">
          ${state.geminiKey ? 'No missing skills identified.' : 'Requires Gemini API Key for semantic skills extraction.'}
        </li>
      `;
    }

    matchModal.classList.remove('hidden');
  }

  closeMatchBtn.addEventListener('click', () => matchModal.classList.add('hidden'));

  // --- Save Job to Kanban Board API sync ---
  async function saveJobToPipeline(index, buttonEl) {
    const job = state.jobs[index];
    if (!job) return;

    const payload = {
      title: job.title,
      company: job.company,
      location: job.location,
      source: job.source,
      url: job.url,
      score: job.score,
      fitLevel: job.fitLevel,
      column: 'Saved'
    };

    try {
      const response = await fetch(getApiUrl('/api/applications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Save failed');

      // Update Local application cards state list
      const idx = state.applications.findIndex(a => a.id === data.id);
      if (idx !== -1) state.applications[idx] = data;
      else state.applications.push(data);

      // Disable the button and mark as saved
      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.className = 'btn btn-secondary btn-sm save-board-btn';
        buttonEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved';
      }

      showNotification('Added to Application pipeline!');
    } catch (e) {
      console.error(e);
      showErrorModal('Save Error', e.message || 'Failed to register job card on server.');
    }
  }

  // --- Fetch Applications from Server ---
  async function fetchApplications() {
    try {
      const response = await fetch(getApiUrl('/api/applications'));
      if (response.ok) {
        state.applications = await response.json();
      }
    } catch (e) {
      console.error('Failed to load applications list:', e.message);
    }
  }

  // --- Render Kanban Board ---
  function renderKanbanBoard() {
    // Clear lists
    Object.keys(columnsCards).forEach(col => {
      columnsCards[col].innerHTML = '';
      columnsCounts[col].textContent = '0';
    });

    const colCounts = { Saved: 0, Applied: 0, Interviewing: 0, Offer: 0, Rejected: 0 };

    state.applications.forEach(app => {
      const colName = app.column || 'Saved';
      if (!columnsCards[colName]) return;

      colCounts[colName]++;

      const card = document.createElement('div');
      card.className = 'kanban-card';
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-id', app.id);
      
      // Determine score color badge
      let scoreBadgeClass = 'kanban-card-score';
      if (app.score >= 70) scoreBadgeClass += ' score-high';
      else if (app.score >= 40) scoreBadgeClass += ' score-medium';
      else scoreBadgeClass += ' score-low';

      card.innerHTML = `
        <div class="kanban-card-title">${escapeHTML(app.title)}</div>
        <div class="kanban-card-company">${escapeHTML(app.company)}</div>
        <div class="kanban-card-meta">
          <span class="kanban-card-badge" title="${escapeHTML(app.location)}">${escapeHTML(app.location)}</span>
          <span class="${scoreBadgeClass}">${app.score}%</span>
        </div>
      `;

      // Drag Events
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', app.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      // Double click to open editor modal
      card.addEventListener('dblclick', () => {
        openCardEditor(app);
      });

      columnsCards[colName].appendChild(card);
    });

    // Update Counts
    Object.keys(columnsCounts).forEach(col => {
      columnsCounts[col].textContent = colCounts[col];
    });
  }

  // Drag and drop column handlers
  window.allowDrop = function(ev) {
    ev.preventDefault();
  };

  // Attach drag over and drop listeners to column card containers
  Object.keys(columnsCards).forEach(colKey => {
    const colEl = columnsCards[colKey];
    
    colEl.addEventListener('dragenter', () => {
      colEl.classList.add('dragover-highlight');
    });

    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('dragover-highlight');
    });

    colEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      colEl.classList.remove('dragover-highlight');
      
      const id = e.dataTransfer.getData('text/plain');
      const cardState = state.applications.find(a => a.id === id);
      
      if (cardState && cardState.column !== colKey) {
        // Optimistic UI updates
        const oldCol = cardState.column;
        cardState.column = colKey;
        renderKanbanBoard();

        // Sync with API
        try {
          const response = await fetch(getApiUrl('/api/applications'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, column: colKey })
          });
          
          if (!response.ok) throw new Error('Update failed');
          
          const updatedCard = await response.json();
          // Update actual state details
          const index = state.applications.findIndex(a => a.id === id);
          if (index !== -1) state.applications[index] = updatedCard;
          
          showNotification(`Moved to ${colKey}`);
        } catch (err) {
          console.error(err);
          // Rollback on fail
          cardState.column = oldCol;
          renderKanbanBoard();
          showErrorModal('Drag Failure', 'Could not save card pipeline status update.');
        }
      }
    });
  });

  // --- Manual Application Creation ---
  addManualCardBtn.addEventListener('click', () => {
    openCardEditor({
      id: '',
      title: '',
      company: '',
      location: 'Remote',
      source: 'Manual Entry',
      url: '',
      score: 0,
      fitLevel: 'Low',
      column: 'Saved',
      notes: '',
      contactName: '',
      contactEmail: '',
      interviewDate: '',
      salaryRange: ''
    });
  });

  // --- Open Kanban Card Editor Modal ---
  function openCardEditor(app) {
    cardIdInput.value = app.id || '';
    cardTitleInput.value = app.title;
    cardCompanyInput.value = app.company;
    cardLocationInput.value = app.location;
    cardUrlInput.value = app.url;
    cardColumnSelect.value = app.column;
    cardSalaryInput.value = app.salaryRange;
    cardContactNameInput.value = app.contactName;
    cardContactEmailInput.value = app.contactEmail;
    cardInterviewInput.value = app.interviewDate;
    cardNotesInput.value = app.notes;

    if (app.id) {
      deleteCardBtn.classList.remove('hidden');
    } else {
      deleteCardBtn.classList.add('hidden');
    }

    kanbanCardModal.classList.remove('hidden');
  }

  closeCardModalBtn.addEventListener('click', () => {
    kanbanCardModal.classList.add('hidden');
  });

  // Save Card Event handler
  cardDetailsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const payload = {
      id: cardIdInput.value,
      title: cardTitleInput.value.trim(),
      company: cardCompanyInput.value.trim(),
      location: cardLocationInput.value.trim(),
      url: cardUrlInput.value.trim(),
      column: cardColumnSelect.value,
      salaryRange: cardSalaryInput.value.trim(),
      contactName: cardContactNameInput.value.trim(),
      contactEmail: cardContactEmailInput.value.trim(),
      interviewDate: cardInterviewInput.value.trim(),
      notes: cardNotesInput.value.trim()
    };

    try {
      const response = await fetch(getApiUrl('/api/applications'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Failed to save application');

      const index = state.applications.findIndex(a => a.id === data.id);
      if (index !== -1) state.applications[index] = data;
      else state.applications.push(data);

      renderKanbanBoard();
      // Re-render finder results table to toggle active save buttons
      if (state.jobs.length > 0) renderJobsTable();

      kanbanCardModal.classList.add('hidden');
      showNotification('Application card saved!');
    } catch (err) {
      console.error(err);
      showErrorModal('Save Failure', err.message || 'Could not save card to server.');
    }
  });

  // Delete Card Event handler
  deleteCardBtn.addEventListener('click', async () => {
    const id = cardIdInput.value;
    if (!id) return;

    if (!confirm('Are you sure you want to delete this application record?')) return;

    try {
      const response = await fetch(getApiUrl(`/api/applications/${id}`), {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Deletion failed');

      state.applications = state.applications.filter(a => a.id !== id);
      renderKanbanBoard();
      // Re-render finder results table to toggle active save buttons
      if (state.jobs.length > 0) renderJobsTable();

      kanbanCardModal.classList.add('hidden');
      showNotification('Application record deleted.');
    } catch (err) {
      console.error(err);
      showErrorModal('Deletion Failure', err.message || 'Could not delete card from server.');
    }
  });

  // --- Export CSV / JSON Client-side exporter ---
  exportCsvBtn.addEventListener('click', () => {
    const activeJobs = getActiveFilteredResults();
    if (activeJobs.length === 0) return;

    // Build CSV header
    const headers = ['Job Role', 'Company', 'Location', 'Platform Source', 'Match Score', 'Match Engine', 'URL'];
    const rows = activeJobs.map(job => [
      escapeCsvValue(job.title),
      escapeCsvValue(job.company),
      escapeCsvValue(job.location),
      escapeCsvValue(job.source),
      job.score + '%',
      escapeCsvValue(job.matchMethod),
      job.url
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    triggerFileDownload(csvContent, 'application/csv', 'aerojob-results.csv');
    showNotification('Exported results to CSV!');
  });

  exportJsonBtn.addEventListener('click', () => {
    const activeJobs = getActiveFilteredResults();
    if (activeJobs.length === 0) return;

    const jsonContent = JSON.stringify(activeJobs, null, 2);
    triggerFileDownload(jsonContent, 'application/json', 'aerojob-results.json');
    showNotification('Exported results to JSON!');
  });

  // Helper to fetch results filtered by score active selection
  function getActiveFilteredResults() {
    return state.jobs.filter(job => {
      if (state.activeFilter === 'all') return true;
      if (state.activeFilter === 'high') return job.score >= 70;
      if (state.activeFilter === 'medium') return job.score >= 40 && job.score < 70;
      if (state.activeFilter === 'low') return job.score < 40;
      return true;
    });
  }

  function escapeCsvValue(val) {
    if (!val) return '""';
    const text = val.toString().replace(/"/g, '""');
    return `"${text}"`;
  }

  function triggerFileDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- View States Manager ---
  function setViewState(stateName, errTitleText = '', errDescText = '') {
    emptyState.classList.add('hidden');
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
    resultsTableWrapper.classList.add('hidden');
    
    if (stateName === 'empty') {
      emptyState.classList.remove('hidden');
      dashboardStats.classList.add('hidden');
      resultsFilters.classList.add('hidden');
    } else if (stateName === 'loading') {
      loadingState.classList.remove('hidden');
      dashboardStats.classList.add('hidden');
      resultsFilters.classList.add('hidden');
    } else if (stateName === 'error') {
      errorState.classList.remove('hidden');
      errorTitle.textContent = errTitleText;
      errorDesc.textContent = errDescText;
      dashboardStats.classList.add('hidden');
      resultsFilters.classList.add('hidden');
    } else if (stateName === 'results') {
      resultsTableWrapper.classList.remove('hidden');
      dashboardStats.classList.remove('hidden');
      resultsFilters.classList.remove('hidden');
    }
  }

  // --- Helper Utilities ---
  function formatBytes(bytes, decimals = 1) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showNotification(message) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.background = 'rgba(17, 24, 39, 0.9)';
    toast.style.border = '1px solid var(--color-primary)';
    toast.style.color = '#fff';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = 'var(--shadow-lg)';
    toast.style.zIndex = '9999';
    toast.style.fontSize = '0.85rem';
    toast.style.fontWeight = '600';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.style.backdropFilter = 'blur(10px)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--color-high);"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showErrorModal(title, message) {
    const alertOverlay = document.createElement('div');
    alertOverlay.className = 'modal-overlay';
    alertOverlay.innerHTML = `
      <div class="modal glass-modal width-sm animate-scale-in">
        <div class="modal-header">
          <h3 style="color: var(--color-low);"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(title)}</h3>
          <button class="modal-close-btn alert-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5;">${escapeHTML(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary alert-close">Okay</button>
        </div>
      </div>
    `;
    document.body.appendChild(alertOverlay);
    
    const closeAlert = () => alertOverlay.remove();
    alertOverlay.querySelectorAll('.alert-close').forEach(b => b.addEventListener('click', closeAlert));
  }

  // --- Resume Details Modal Logic ---
  if (parsedPreviewBox) {
    parsedPreviewBox.addEventListener('click', () => {
      if (!state.resumeText) return;
      
      const fileName = fileNameDisplay.textContent || 'Uploaded Resume';
      resumeModalFilename.textContent = fileName;
      
      // Calculate word and character count
      const text = state.resumeText;
      const charCount = text.length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      
      resumeWordCount.textContent = wordCount.toLocaleString();
      resumeCharCount.textContent = charCount.toLocaleString();
      resumeModalContent.textContent = text;
      
      resumeModal.classList.remove('hidden');
    });
  }

  const closeResumeModal = () => resumeModal.classList.add('hidden');
  if (closeResumeBtn) closeResumeBtn.addEventListener('click', closeResumeModal);
  if (closeResumeModalBtn) closeResumeModalBtn.addEventListener('click', closeResumeModal);

  if (copyResumeBtn) {
    copyResumeBtn.addEventListener('click', () => {
      if (!state.resumeText) return;
      navigator.clipboard.writeText(state.resumeText)
        .then(() => {
          showNotification('Resume text copied to clipboard!');
        })
        .catch(err => {
          console.error('Copy failed:', err);
          showNotification('Failed to copy text.');
        });
    });
  }
});
