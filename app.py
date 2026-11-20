# app.py

import os
import pandas as pd
import numpy as np
from flask import Flask, render_template, request, jsonify
import joblib # Used for loading scikit-learn models like RandomForest
from fuzzywuzzy import fuzz 

# Initialize Flask application
app = Flask(__name__)

# --- CONFIGURATION ---
DATA_FILE = 'static/synthetic_data_expanded.csv'
MODEL_FILE = 'rf_job_matcher_model.pkl' # Corrected filename for your uploaded model

# --- MAPPINGS (Must match script.js and training logic) ---
EDU_MAP = {'None': 0, '8th Pass': 1, '10th Pass': 2, 'Diploma': 3, 'Graduate': 4, 'Post-Graduate': 5}
DIGITAL_LITERACY_MAP = {"Low": 0, "Medium": 0.5, "High": 1}

# VERNACULAR SKILL MAPPING (Crucial for voice input)
VERNACULAR_SKILL_MAP = {
    # --- Tailoring/Sewing Expansion ---
    'silai': 'sewing',
    'tailor': 'sewing',
    'tailoring': 'sewing',
    'kapde silna': 'sewing',
    'stiching': 'sewing',
    'hemming': 'sewing',
    'cutting': 'sewing',
    'silana': 'sewing',
    'embroidery': 'sewing',
    'pattern cutting': 'sewing',
    
    # --- Other Common Skills ---
    'khana banana': 'cooking',
    'khana': 'cooking',
    'cook': 'cooking',
    'rasoi ka kaam': 'cooking',
    'house keep': 'cleaning',
    'rasoi': 'cooking',
    'safai': 'cleaning',
    'pochha': 'cleaning',
    'barty': 'dishwashing',
    'barton dhona': 'dishwashing',
    'driving': 'driver',
    'computer ka kaam': 'data entry',
    'computer': 'data entry',
    'typing': 'data entry',
    'padhana': 'teaching',
    'tuition': 'teaching',
    'padhai': 'teaching',
    'bachho ko dekhna': 'childcare',
    'daycare': 'childcare',
    'patient care': 'caregiver',
    'home nurse': 'caregiver',
    # Add more mappings here as you identify common user voice inputs
}

# Global variables to hold data and model
job_data = None
matcher_model = None

# --- UTILITY FUNCTIONS ---

def load_data_and_model():
    """Loads CSV data and the ML model into global variables."""
    global job_data, matcher_model
    
    # 1. Load Job Data (Handle 26 columns)
    try:
        # Load the CSV. We use a generic column list here to read all 26 columns
        df = pd.read_csv(DATA_FILE, header=None)
        
        # Define 26 columns based on the CSV header structure
        all_26_columns = [
            'seeker_id', 'job_id', 'skills', 'skills_required', 'experience_years', 
            'experience_required', 'education', 'education_required', 'seeker_city', 
            'job_city', 'work_type_preference', 'work_type', 'mobility_constraint', 
            'digital_literacy', 'phone_access', 'preferred_language', 
            'income_expectation_monthly_inr', 'salary_offered_monthly_inr', 
            'skills_overlap_jaccard_placeholder', 'experience_diff_abs_placeholder', 
            'education_match_placeholder', 'location_match_placeholder', 
            'work_type_match_score_placeholder', 'salary_match_ratio_placeholder', 
            'accessibility_score_placeholder', 'label'
        ]

        # Use the first row as the actual header and load data, or use placeholder if needed
        # Since the provided snippet showed the header row, we skip row 0 when loading data
        df.columns = all_26_columns
        job_data = df.iloc[1:].copy() 
        
        # Convert salary column to numeric, handling potential errors
        job_data['salary_offered_monthly_inr'] = pd.to_numeric(job_data['salary_offered_monthly_inr'], errors='coerce').fillna(0).astype(int)
        print(f"Loaded {len(job_data)} job records from {DATA_FILE}")

    except Exception as e:
        print(f"Error loading data file {DATA_FILE}: {e}")
        job_data = pd.DataFrame()
        
    # 2. Load ML Model
    try:
        # Using joblib for scikit-learn model loading
        matcher_model = joblib.load(MODEL_FILE)
        print(f"Successfully loaded ML model from {MODEL_FILE}")
    except FileNotFoundError:
        print(f"Model file {MODEL_FILE} not found. Running in MOCK matching mode.")
    except Exception as e:
        print(f"Error loading model: {e}. Running in MOCK matching mode.")


def preprocess_profile(profile_data):
    """
    1. Translates vernacular skills to standard English terms.
    2. Transforms raw user profile data into the feature vector expected by the ML model.
    """
    
    # 1. Standardize Skills (Handle voice input "silai")
    raw_skills = profile_data['skills_raw'].split(',')
    standardized_skills = []
    
    for skill in raw_skills:
        skill = skill.strip().lower()
        # Translate vernacular term to standard term, otherwise keep original
        standard_skill = VERNACULAR_SKILL_MAP.get(skill, skill)
        standardized_skills.append(standard_skill)
    
    seeker_skills_string = ", ".join(standardized_skills)

    # --- MOCK FEATURE CREATION (Must match your model's training features) ---
    # The presence of the skills are checked against the standardized list
    features = {
        'education_encoded': EDU_MAP.get(profile_data['education'], 0),
        'experience_years': profile_data['experience_years'],
        'income_expectation': profile_data['income_expectation'],
        'digital_literacy_score': DIGITAL_LITERACY_MAP.get(profile_data['digital_literacy'], 0),
        'mobility_constraint_binary': 1 if profile_data['mobility_constraint'] == 'Yes' else 0,
        'work_type_remote_pref': 1 if profile_data['work_type_preference'] == 'Remote' else 0,
        
        # Check for standardized skills
        'skill_cooking': 1 if any(s in seeker_skills_string for s in ['cook', 'cooking', 'chef']) else 0,
        'skill_computer': 1 if any(s in seeker_skills_string for s in ['computer', 'data entry', 'typing']) else 0,
        
        # ENHANCED CHECK FOR SEWING/TAILORING
        'skill_sewing': 1 if any(s in seeker_skills_string for s in ['sewing', 'tailor', 'tailoring', 'embroidery']) else 0, 
        
        'skill_childcare': 1 if any(s in seeker_skills_string for s in ['childcare', 'babysitter']) else 0,
        # Add checks for any other specific skill features your model expects
    }
    
    # Order features as expected by the model (CRITICAL STEP)
    # This list must be the EXACT order used during model training.
    feature_order = [
        'education_encoded', 'experience_years', 'income_expectation', 
        'digital_literacy_score', 'mobility_constraint_binary', 
        'work_type_remote_pref', 'skill_cooking', 'skill_computer',
        'skill_sewing', 'skill_childcare' # Assuming these are 10 features, adjust as needed
    ]
    
    # Check if the model was loaded successfully, otherwise, use a known feature count (e.g., 8 or 10)
    
    # Convert dictionary to a numpy array for prediction
    feature_vector = np.array([features.get(f, 0) for f in feature_order]).reshape(1, -1)
    
    return feature_vector, standardized_skills

def match_jobs(feature_vector, standardized_skills):
    """
    Applies the ML model or uses mock logic to find and score job matches.
    """
    base_score = 0.5 # Default score if model is not loaded
    
    if matcher_model:
        try:
            # Predict probability of a match (class 1)
            # Assumes your model is a classifier that takes *only* seeker features and outputs a base score
            # Note: A real system usually predicts match score for a seeker-job pair
            match_probabilities = matcher_model.predict_proba(feature_vector)[:, 1]
            base_score = match_probabilities[0] 
            
        except Exception as e:
            print(f"ML Model prediction failed during feature application: {e}. Falling back to MOCK scoring.")
            base_score = 0.5 
    
    results = []
    
    for index, job in job_data.iterrows():
        job_skills_raw = str(job['skills_required']).lower()
        
        # Calculate skill overlap score using fuzzy matching
        skill_match_score = 0
        if job_skills_raw and standardized_skills:
            max_fuzz_score = 0
            for seeker_skill in standardized_skills:
                # Use partial ratio for partial matches between a seeker skill and the job requirement string
                score = fuzz.partial_ratio(seeker_skill.strip(), job_skills_raw)
                if score > max_fuzz_score:
                    max_fuzz_score = score
            
            skill_match_score = max_fuzz_score / 100.0 

        # Combine scores: (Profile Fit * 0.5) + (Skill Match * 0.5)
        # Weighting the ML model's prediction and the immediate skill match
        final_probability = (base_score * 0.5) + (skill_match_score * 0.5)
        
        # Clamp probability
        final_probability = min(1.0, max(0.0, final_probability))

        results.append({
            'job_id': job['job_id'],
            'job_title': job.get('job_title', 'Job Opportunity'),
            'skills_required': job['skills_required'],
            'salary_offered_monthly_inr': job['salary_offered_monthly_inr'],
            'job_city': job['job_city'],
            'work_type': job['work_type'],
            'match_probability': final_probability 
        })

    # Sort and return top 10 matches
    results.sort(key=lambda x: x['match_probability'], reverse=True)
    return results[:10]


# --- FLASK ROUTES ---

@app.route('/')
def index():
    """Serves the main HTML page."""
    # Ensure the templates folder contains SheWorks.html
    return render_template('SheWorks.html')

@app.route('/api/match', methods=['POST'])
def api_match():
    """Endpoint for receiving the job seeker profile and returning job matches."""
    if job_data is None or job_data.empty:
        return jsonify({'error': 'Job data not loaded on server. Check static/synthetic_data_expanded.csv.'}), 500

    try:
        profile_data = request.json
        
        # 1. Preprocess the raw input (including voice-transcribed skills_raw)
        feature_vector, standardized_skills = preprocess_profile(profile_data)
        
        # 2. Match jobs
        matches = match_jobs(feature_vector, standardized_skills)
        
        return jsonify(matches)
        
    except Exception as e:
        print(f"API Matching Error: {e}")
        return jsonify({'error': f'Internal server error during matching: {e}'}), 500

# --- INITIALIZATION ---

if __name__ == '__main__':
    # Load resources before the server starts
    load_data_and_model() 
    
    # Run the Flask app
    app.run(debug=True)
