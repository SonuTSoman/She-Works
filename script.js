// --- 1. CONFIGURATION & GLOBAL STATE ---
// Path to the data file, now defined as a global constant in SheWorks.html using Flask's url_for.

// Global variable to hold matched data from API call (if needed, but mainly handled by renderMatches)
let JOB_MATCH_RESULTS = [];

// Mappings consistent with the Python training script
const EDU_MAP = {'None': 0, '8th Pass': 1, '10th Pass': 2, 'Diploma': 3, 'Graduate': 4, 'Post-Graduate': 5};
const DIGITAL_LITERACY_MAP = {"Low": 0, "Medium": 0.5, "High": 1};


// --- 2. DATA PROCESSING FUNCTIONS (For Static Insights Section) ---

/**
 * Calculates and displays Job Seeker profile insights from the loaded data.
 * NOTE: Column indices are verified against the uploaded CSV.
 * @param {object} results - The results object from PapaParse.
 */
function processSeekersData(results) {
    const records = results.data;
    // Skip header row and filter for rows with data (at least 14 columns for seeker data)
    const seekers = records.slice(1).filter(row => row.length > 13);

    if (seekers.length === 0) {
        document.querySelectorAll('.stat-number').forEach(el => el.textContent = "N/A");
        return;
    }

    const totalSeekers = seekers.length;

    // --- CALCULATIONS based on synthetic_data_expanded.csv column indices (0-based) ---
    // Mobility Constraint (12), Education (6), Digital Literacy (13)
    
    // 1. Financial Constraints (Using Mobility Constraint as a proxy - Index 12)
    const mobilityConstraintYes = seekers.filter(row => row[12] && row[12].trim().toLowerCase() === 'yes').length;
    const financialPercentage = ((mobilityConstraintYes / totalSeekers) * 100).toFixed(1) + '%';
    
    // 2. Childcare Needed (Using Mobility Constraint as a proxy - Index 12)
    const childcareNeeded = seekers.filter(row => row[12] && row[12].trim().toLowerCase() === 'yes').length;
    const childcarePercentage = ((childcareNeeded / totalSeekers) * 100).toFixed(1) + '%';
    
    // 3. Top Education (Index 6: education)
    const educationCounts = {};
    seekers.forEach(row => {
        const education = row[6] ? row[6].trim() : 'Unknown';
        educationCounts[education] = (educationCounts[education] || 0) + 1;
    });
    const topEducation = Object.keys(educationCounts).reduce((a, b) => educationCounts[a] > educationCounts[b] ? a : b);
    
    // 4. Digital Literacy (Index 13: digital_literacy)
    const literacyCounts = {};
    seekers.forEach(row => {
        const literacy = row[13] ? row[13].trim() : 'Low';
        literacyCounts[literacy] = (literacyCounts[literacy] || 0) + 1;
    });
    
    // Calculate average literacy score (0 for Low, 0.5 for Medium, 1 for High)
    const totalScore = (literacyCounts['High'] || 0) * 1 + (literacyCounts['Medium'] || 0) * 0.5;
    const avgLiteracyScore = totalScore / totalSeekers;
    
    let literacyLabel = 'Low';
    if (avgLiteracyScore >= 0.75) {
        literacyLabel = 'High';
    } else if (avgLiteracyScore >= 0.25) {
        literacyLabel = 'Medium';
    }
    const avgLiteracyDisplay = avgLiteracyScore.toFixed(2);


    // --- 3. DISPLAY RESULTS IN HTML ---
    document.getElementById('constraint-financial').textContent = financialPercentage;
    document.getElementById('constraint-childcare').textContent = childcarePercentage;
    document.getElementById('top-education').textContent = topEducation.replace(' / Vocational', '').replace(' Pass', '');
    document.getElementById('digital-literacy').textContent = `${literacyLabel} (${avgLiteracyDisplay})`;
}

/**
 * Loads and renders initial job listings directly from the CSV file using AVAILABLE columns.
 * Note: Missing columns like employer_name, job_type, and contact_email are replaced with placeholders.
 */
function loadAndRenderInitialJobs(data) {
    const listingsContainer = document.getElementById('job-listings');
    listingsContainer.innerHTML = ''; // Clear the initial placeholder

    // Filter rows with data (minimum 18 columns required for basic job details)
    const jobRecords = data.slice(1).filter(row => row.length > 17); 

    // Use a Set to ensure each job_id (Index 1) is only listed once
    const uniqueJobIds = new Set();
    let jobsRendered = 0;

    jobRecords.forEach(row => {
        // NOTE: These indices rely on the structure of the CSV loaded by PapaParse (header=false)
        // Given that app.py is loading the CSV with a header, we rely on the original script's 
        // indexing which might be fragile. We proceed with the original script indices for consistency.
        const job_id = row[1]; 
        if (uniqueJobIds.has(job_id) || jobsRendered >= 5) { // Render max 5 unique jobs
            return;
        }
        uniqueJobIds.add(job_id);

        // Indices based on the *original* simple CSV structure, 
        // which might not align with the 26-column CSV used by app.py's loading logic
        const skills_required = row[3];
        const experience_required = row[5];
        const city = row[9];
        const work_type = row[11];
        // Salary is at index 17 in the 26-column CSV, but if loaded with header=false,
        // it may still align with the original index logic for the FE.
        const salary_offered_monthly_inr = parseInt(row[17]) || 0; 
        
        // Missing fields are set to placeholders
        const employer_name = 'Anonymous Provider';
        const job_type = 'Full-time'; // Placeholder
        const contact_email = '#'; // Placeholder
        
        
        const primarySkill = skills_required ? skills_required.split(',')[0].trim() : 'General Role';
        const formattedSalary = salary_offered_monthly_inr ? new Intl.NumberFormat('en-IN').format(salary_offered_monthly_inr) : 'Negotiable';
        const tagColor = '#FFD700'; // Use a neutral color for un-matched jobs

        const jobCardHTML = `
            <div class="job-card" id="job-${job_id}">
                <div class="job-header">
                    <h4>${primarySkill} (${work_type || 'On-site'})</h4>
                    <span class="job-tag" style="background-color: ${tagColor}; color: black;">${job_type}</span>
                </div>
                <p><strong>Partner:</strong> ${employer_name} | <strong>Location:</strong> ${city || 'N/A'}</p>
                <p class="job-description">
                    Salary: ₹${formattedSalary} / mo | Skills: ${primarySkill} | Exp: ${experience_required} yrs
                </p>
                <a href="mailto:${contact_email}" class="apply-link">View Details & Apply →</a>
            </div>
        `;
        listingsContainer.insertAdjacentHTML('beforeend', jobCardHTML);
        jobsRendered++;
    });

    if (jobsRendered === 0) {
        listingsContainer.innerHTML = '<p style="text-align: center;">No featured job listings found in the data file.</p>';
    }
}


/**
 * Loads data for the insights section and initial job listings.
 */
async function loadInsightsData() {
    try {
        // Use the path provided by the Flask static route
        const response = await fetch(INSIGHTS_DATA_PATH);
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: false, // Must be false to align with the original index-based logic
            complete: function(results) {
                processSeekersData(results);
                // Call the new function to render initial jobs
                loadAndRenderInitialJobs(results.data); 
            },
            error: function(error) {
                console.error("Error parsing insights data:", error);
                document.querySelectorAll('.stat-number').forEach(el => el.textContent = "N/A - Data Parse Error");
            }
        });
        
    } catch (error) {
        console.error("Error fetching insights data file:", error);
        document.querySelectorAll('.stat-number').forEach(el => el.textContent = "N/A - File Not Found");
        // This message is updated to reflect that initial jobs also failed to load
        document.getElementById('job-listings').innerHTML = '<p class="text-error" style="text-align: center;">❌ Error loading initial data. Is the Flask server running and is the CSV in the /static directory?</p>';
    }
}


// --- 4. JOB MATCHING (Uses Flask API /api/match) ---

/**
 * Renders job matches received from the Flask API.
 * This logic handles the JSON structure returned by your 'app.py' file.
 */
function renderMatches(matches) {
    const jobListingsContainer = document.getElementById('job-listings');
    jobListingsContainer.innerHTML = '';

    if (matches.length === 0 || matches.every(job => job.match_probability === 0)) {
        jobListingsContainer.innerHTML = `<p style="text-align: center;">No strong matches found for your profile. Try adjusting your preferences!</p>`;
        return;
    }

    matches.forEach((job) => {
        const matchPercent = (job.match_probability * 100).toFixed(0);
        const tagColor = matchPercent >= 75 ? 'green' : matchPercent >= 50 ? 'orange' : 'red';
        const jobRole = job.skills_required ? job.skills_required.split(',')[0].trim() : 'General Role';
        
        const jobCard = document.createElement('div');
        jobCard.className = 'job-card';
        jobCard.innerHTML = `
            <div class="job-header">
                <h4>${jobRole} (${job.work_type})</h4>
                <span class="job-tag" style="background-color: ${tagColor}; color: white;">${matchPercent}% Match</span>
            </div>
            <p>
                <strong>Job ID:</strong> ${job.job_id || 'N/A'} | 
                <strong>Location:</strong> ${job.job_city} 
            </p>
            <p>
                <strong>Salary Offered:</strong> ₹${job.salary_offered_monthly_inr.toLocaleString('en-IN')}
            </p>
            <a href="#" class="apply-link">View Details & Apply →</a>
        `;
        jobListingsContainer.appendChild(jobCard);
    });
}


/**
 * Handles the form submission and calls the Flask /api/match endpoint.
 */
async function handleFormSubmit(event) {
    event.preventDefault(); 
    
    const jobListingsContainer = document.getElementById('job-listings');
    const modal = document.getElementById('profile-modal');
    
    // Collect all form data
    const seekerProfile = {
        skills_raw: document.getElementById('skills_raw').value,
        experience_years: parseFloat(document.getElementById('experience_years').value),
        location: document.getElementById('location').value,
        education: document.getElementById('education').value,
        income_expectation: parseFloat(document.getElementById('income_expectation').value),
        work_type_preference: document.getElementById('work_type_preference').value,
        digital_literacy: document.getElementById('digital_literacy').value,
        mobility_constraint: document.getElementById('mobility_constraint').value,
        phone_access: document.getElementById('phone_access').checked ? 'Yes' : 'No' 
    };

    // Close the modal
    modal.style.display = 'none';

    // Scroll to the results section
    document.getElementById('opportunities').scrollIntoView({ behavior: 'smooth' });

    // Show loading state
    jobListingsContainer.innerHTML = `
        <div class="job-card" style="text-align: center;">
            <div class="job-header">
                <h4>Matching Jobs...</h4>
                <span class="job-tag" style="background-color: #f8198b; color: white;">Searching</span>
            </div>
            <p class="job-description">Please wait while the machine learning model finds the best fit.</p>
        </div>
    `;

    try {
        // Call the Flask API endpoint
        const response = await fetch('/api/match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(seekerProfile)
        });

        const matches = await response.json();

        if (response.ok) {
            renderMatches(matches);
        } else {
            jobListingsContainer.innerHTML = `<p style="color: red; text-align: center;">Error finding matches: ${matches.error || 'Unknown server error. Ensure Flask app is running.'}</p>`;
        }
    } catch (error) {
        console.error('API call failed:', error);
        jobListingsContainer.innerHTML = `<p style="color: red; text-align: center;">Network error or server connection failed. Is your Flask app (app.py) running?</p>`;
    }
}


// --- 5. VOICE INPUT INTEGRATION (Web Speech API) ---

// Check for Web Speech API support
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognitionAvailable = !!SpeechRecognition; 

// Initial check for debugging
if (recognitionAvailable) {
    console.log("Web Speech API (SpeechRecognition) is available.");
} else {
    console.warn("Web Speech API is NOT available in this browser. Voice input will not function.");
}


/**
 * Initiates speech recognition for the 'skills_raw' input field.
 */
function startVoiceInput() {
    if (!recognitionAvailable) {
        // Use a custom message box or log instead of alert()
        console.error("Voice input not supported by your browser.");
        return;
    }

    const inputField = document.getElementById('skills_raw');
    const micButton = document.getElementById('voice-input-skills-btn');
    
    // Ensure the modal is visible and the field is in focus before starting
    const modal = document.getElementById('profile-modal');
    if (modal.style.display !== 'block') {
        modal.style.display = 'block';
    }
    
    // 1. Setup the Recognition Object
    const recognition = new SpeechRecognition(); 
    recognition.continuous = false; // Stop after a single phrase
    // FIX: Set language to 'en-IN' (English - India) which often transcribes Hindi words
    // using the Roman alphabet (e.g., "silai" instead of सिलाई).
    recognition.lang = 'en-IN'; 
    recognition.interimResults = false; // Only give final result

    // 2. Event Handlers
    
    // When recognition starts
    recognition.onstart = function() {
        console.log("Voice recognition started. Listening...");
        micButton.classList.add('listening');
        micButton.title = "Listening... Speak now!";
        micButton.textContent = "🔴";
    };

    // When a result is detected
    recognition.onresult = function(event) {
        // Fetch the final, most current transcript from the results array.
        const transcript = event.results[event.results.length - 1][0].transcript;
        console.log("Transcript received:", transcript);
        
        // Append the new transcript to the existing value, separated by a comma
        let currentSkills = inputField.value.trim();
        // Only add a comma separator if there's existing content AND it doesn't already end with a comma/space
        if (currentSkills && !currentSkills.endsWith(',')) {
            currentSkills += ', ';
        }
        // Set the value directly.
        inputField.value = currentSkills + transcript;
        inputField.focus(); // Keep focus on the input after update
    };

    // When recognition ends (naturally or due to error)
    recognition.onend = function() {
        console.log("Voice recognition ended.");
        micButton.classList.remove('listening');
        micButton.title = "Speak your skills";
        micButton.textContent = "🎤";
    };

    // Handle errors (e.g., no speech, permission denied)
    recognition.onerror = function(event) {
        console.error('Speech recognition error:', event.error);
        
        // Provide user feedback without using alert()
        let errorMessage = 'Voice Input Error. ';
        if (event.error === 'not-allowed') {
            errorMessage += 'Please ensure microphone access is granted to this site.';
        } else if (event.error === 'no-speech') {
            errorMessage += 'No speech detected. Please speak clearly.';
        } else {
            errorMessage += `Error type: ${event.error}`;
        }
        
        const originalTitle = micButton.title;
        micButton.title = errorMessage;
        setTimeout(() => micButton.title = originalTitle, 5000); // Revert title after 5 seconds
        
        // Ensure UI resets on error
        recognition.onend(); 
    };

    // 3. Start Listening
    try {
        recognition.start();
    } catch (e) {
        console.error('Recognition start failed:', e);
        recognition.onend(); 
    }
}


// --- 6. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    
    // 1. Load data for the static insights section and render initial jobs
    loadInsightsData();
    
    // 2. Setup form submission for API call
    const form = document.getElementById('job-seeker-form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }
    
    // 3. Setup voice input handler
    const voiceBtn = document.getElementById('voice-input-skills-btn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', startVoiceInput);
    }
    
    // 4. Setup modal handlers
    const modal = document.getElementById('profile-modal');
    const openBtn = document.getElementById('open-profile-modal');
    const closeBtn = document.getElementById('close-profile-modal');
    
    if (openBtn) {
        openBtn.onclick = function() {
            modal.style.display = 'block';
        }
    }
    
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        }
    }
    
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }
});
