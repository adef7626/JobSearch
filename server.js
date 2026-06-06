const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup directories
const uploadsDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer for memory upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.use(express.json());

// Enable CORS for cross-origin requests (e.g. from GitHub Pages)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
// Serve static frontend files securely from root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/styles.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'styles.css'));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

// File-based Cache Helper
const cacheFile = path.join(__dirname, 'data', 'search_cache.json');
function readCache() {
  try {
    if (fs.existsSync(cacheFile)) {
      const data = fs.readFileSync(cacheFile, 'utf8');
      return JSON.parse(data || '{}');
    }
  } catch (e) {
    console.error('Cache read error:', e.message);
  }
  return {};
}

function writeCache(cacheObj) {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cacheObj, null, 2), 'utf8');
  } catch (e) {
    console.error('Cache write error:', e.message);
  }
}

// Kanban Server-side Persistence Helpers
const appsFile = path.join(__dirname, 'data', 'applications.json');
function readApps() {
  try {
    if (fs.existsSync(appsFile)) {
      const data = fs.readFileSync(appsFile, 'utf8');
      return JSON.parse(data || '[]');
    }
  } catch (e) {
    console.error('Applications read error:', e.message);
  }
  return [];
}

function writeApps(appsArr) {
  try {
    fs.writeFileSync(appsFile, JSON.stringify(appsArr, null, 2), 'utf8');
  } catch (e) {
    console.error('Applications write error:', e.message);
  }
}

// Local TF-IDF Cosine Similarity Engine
function calculateCosineSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;

  const tokenize = (text) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 1);
  };

  const stopwords = new Set([
    'the', 'a', 'and', 'or', 'of', 'to', 'in', 'is', 'for', 'on', 'with', 'at', 'by', 'from',
    'an', 'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'us',
    'our', 'you', 'your', 'i', 'me', 'my', 'he', 'him', 'his', 'she', 'her', 'has', 'have',
    'had', 'do', 'does', 'did', 'be', 'been', 'being', 'was', 'were', 'are', 'am', 'but',
    'as', 'if', 'then', 'else', 'than', 'so', 'can', 'will', 'should', 'would', 'could'
  ]);

  const tokens1 = tokenize(text1).filter(w => !stopwords.has(w));
  const tokens2 = tokenize(text2).filter(w => !stopwords.has(w));

  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  const tf1 = {};
  const tf2 = {};
  const vocab = new Set();

  tokens1.forEach(word => {
    tf1[word] = (tf1[word] || 0) + 1;
    vocab.add(word);
  });

  tokens2.forEach(word => {
    tf2[word] = (tf2[word] || 0) + 1;
    vocab.add(word);
  });

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  vocab.forEach(word => {
    const val1 = tf1[word] || 0;
    const val2 = tf2[word] || 0;
    dotProduct += val1 * val2;
    magnitude1 += val1 * val1;
    magnitude2 += val2 * val2;
  });

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  const similarity = dotProduct / (magnitude1 * magnitude2);
  return Math.round(similarity * 100);
}

// Optional Gemini Matcher
async function getGeminiMatching(resumeText, jobDescription, apiKey) {
  const activeKey = apiKey || process.env.GEMINI_API_KEY;
  if (!activeKey) {
    return null;
  }

  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + activeKey;
    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Analyze the similarity between the candidate's resume and the job description.\n\n" +
                    "Resume:\n" + resumeText + "\n\n" +
                    "Job Description:\n" + jobDescription + "\n\n" +
                    "Return a JSON object matching this schema:\n" +
                    "{\n" +
                    "  \"score\": number (0-100 representing matching percentage based on qualifications, experience, and skills),\n" +
                    "  \"matchingSkills\": string[] (list of overlapping skills),\n" +
                    "  \"missingSkills\": string[] (list of required skills missing or weak in the resume),\n" +
                    "  \"fitLevel\": string (\"High\" | \"Medium\" | \"Low\"),\n" +
                    "  \"summary\": string (1-2 sentence summary of why this is a match or mismatch)\n" +
                    "}"
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    const res = await axios.post(url, payload, { timeout: 10000 });
    if (res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts && res.data.candidates[0].content.parts[0]) {
      const resultText = res.data.candidates[0].content.parts[0].text;
      return JSON.parse(resultText);
    }
    return null;
  } catch (error) {
    console.error('Gemini match error:', error.message);
    return null;
  }
}

// Heuristic job titles extractor (Local Fallback)
function extractJobTitlesFromResume(resumeText) {
  const commonTitles = [
    'software engineer', 'software developer', 'frontend developer', 'backend developer', 
    'full stack developer', 'fullstack developer', 'react developer', 'javascript developer',
    'node developer', 'python developer', 'java developer', 'devops engineer', 
    'system administrator', 'project manager', 'product manager', 'data scientist', 
    'data analyst', 'qa engineer', 'quality assurance', 'ui/ux designer', 'web designer',
    'process engineer', 'chemical engineer', 'mechanical engineer', 'electrical engineer'
  ];
  
  const textLower = resumeText.toLowerCase();
  const foundTitles = [];
  
  commonTitles.forEach(title => {
    if (textLower.includes(title)) {
      foundTitles.push(title);
    }
  });
  
  if (foundTitles.length === 0) {
    return ['Software Engineer'];
  }
  
  return foundTitles.map(t => t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).slice(0, 2);
}

// AI target positions extractor
async function extractTargetPositionsViaGemini(resumeText, apiKey) {
  try {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;
    const payload = {
      contents: [
        {
          parts: [
            {
              text: "Analyze the following resume and extract the candidate's current or target job title(s) that should be used as search keywords to find matching jobs.\n\n" +
                    "Resume:\n" + resumeText + "\n\n" +
                    "Return a JSON object containing a 'positions' array with 1 to 3 job titles (strings), e.g. {\"positions\": [\"Software Engineer\", \"React Developer\"]}"
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };
    const res = await axios.post(url, payload, { timeout: 8000 });
    if (res.data && res.data.candidates && res.data.candidates[0] && res.data.candidates[0].content && res.data.candidates[0].content.parts && res.data.candidates[0].content.parts[0]) {
      const resultText = res.data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(resultText);
      if (parsed && Array.isArray(parsed.positions)) {
        return parsed.positions.filter(Boolean);
      }
    }
  } catch (error) {
    console.error('Gemini position extraction error:', error.message);
  }
  return null;
}

// Scraper: DuckDuckGo HTML Search Workaround (generic query tool)
async function searchDuckDuckGo(query) {
  try {
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.result').each((i, el) => {
      let titleLink = $(el).find('a.result__a').first();
      if (!titleLink.length) {
        titleLink = $(el).find('.result__url').first();
      }
      const title = titleLink.text().trim();
      const href = titleLink.attr('href');
      const snippet = $(el).find('.result__snippet').text().trim();

      if (href && (href.startsWith('/l/?') || href.includes('uddg='))) {
        let actualUrl = href;
        try {
          const urlParams = new URLSearchParams(href.split('?')[1]);
          actualUrl = urlParams.get('uddg') || href;
        } catch (e) {
          actualUrl = href;
        }

        if (title && actualUrl) {
          results.push({ title, url: actualUrl, snippet });
        }
      }
    });

    return results;
  } catch (error) {
    console.error('DuckDuckGo search error:', error.message);
    return [];
  }
}

// Scraper: LinkedIn Guest Job Search API
async function searchLinkedIn(position, company, location) {
  const jobs = [];
  try {
    let query = position;
    if (company) query += ' ' + company;
    
    const url = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' +
                'keywords=' + encodeURIComponent(query) +
                '&location=' + encodeURIComponent(location || 'worldwide') +
                '&start=0';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    $('li').each((i, el) => {
      const title = $(el).find('.base-search-card__title').text().trim() || 
                    $(el).find('.job-search-card__title').text().trim();
      const comp = $(el).find('.base-search-card__subtitle').text().trim() || 
                   $(el).find('.job-search-card__company-name').text().trim();
      const jobUrl = $(el).find('a.base-card__full-link').attr('href') || 
                     $(el).find('a.base-search-card__title-link').attr('href');
      const loc = $(el).find('.job-search-card__location').text().trim();
      const date = $(el).find('time').text().trim();

      if (title && comp) {
        jobs.push({
          title,
          company: comp,
          url: jobUrl ? jobUrl.split('?')[0] : '',
          location: loc || location,
          date: date || 'Recently',
          source: 'LinkedIn',
          descriptionSnippet: ''
        });
      }
    });
  } catch (error) {
    console.error('LinkedIn search error:', error.message);
  }

  // Fallback: search engine query if LinkedIn blocked us or returned 0 results
  if (jobs.length === 0) {
    let q = 'site:linkedin.com/jobs/view ' + position;
    if (company) q += ' "' + company + '"';
    if (location) q += ' "' + location + '"';

    console.log('LinkedIn API returned empty, running DuckDuckGo fallback...');
    const searchResults = await searchDuckDuckGo(q);
    searchResults.forEach(res => {
      let title = res.title;
      let compName = company || 'LinkedIn Post';
      if (title.includes(' hiring ')) {
        const parts = title.split(' hiring ');
        compName = parts[0].trim();
        title = parts[1].replace(/in\s+[A-Za-z]+.*/g, '').trim();
      }

      jobs.push({
        title: title || position,
        company: compName,
        url: res.url,
        location: location || 'Remote',
        date: 'Recently',
        source: 'LinkedIn',
        descriptionSnippet: res.snippet
      });
    });
  }

  return jobs.slice(0, 10);
}

// Scraper: Naukri JSON API Client with Web Scrape Fallback
async function searchNaukri(position, company, location) {
  const jobs = [];
  try {
    let keyword = position;
    if (company) keyword += ' ' + company;

    // Direct JSON API Call
    const url = 'https://www.naukri.com/jobapi/v3/search';
    const response = await axios.get(url, {
      params: {
        noOfResults: 20,
        keyword: keyword,
        location: location || '',
        searchType: 'adv'
      },
      headers: {
        'appid': '109',
        'systemid': 'Naukri',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 8000
    });

    if (response.data && response.data.jobDetails) {
      response.data.jobDetails.forEach(job => {
        jobs.push({
          title: job.title,
          company: job.companyName,
          url: job.jdURL || 'https://www.naukri.com',
          location: job.placeOfWorkCityType || location,
          date: job.createdDate || 'Recently',
          source: 'Naukri.com',
          descriptionSnippet: job.tagsAndSkills || job.jobDescription || ''
        });
      });
    }
  } catch (error) {
    console.error('Naukri API error:', error.message);
  }

  // Fallback: Scraping search index if JSON API failed
  if (jobs.length === 0) {
    console.log('Naukri API failed, executing DuckDuckGo fallback...');
    let q = 'site:naukri.com/job-listings ' + position;
    if (company) q += ' "' + company + '"';
    if (location) q += ' "' + location + '"';

    const searchResults = await searchDuckDuckGo(q);
    searchResults.forEach(res => {
      let title = res.title.replace(' - Naukri.com', '').replace(' Jobs', '').trim();
      let compName = company || 'Naukri Employer';
      
      // Parse company name from title "Software Engineer Job at Google"
      if (title.toLowerCase().includes(' job at ')) {
        const parts = title.split(/ job at /i);
        title = parts[0].trim();
        compName = parts[1].replace(/in\s+[A-Za-z]+.*/g, '').trim();
      }

      jobs.push({
        title: title || position,
        company: compName,
        url: res.url,
        location: location || 'Remote',
        date: 'Recently',
        source: 'Naukri.com',
        descriptionSnippet: res.snippet
      });
    });
  }

  return jobs.slice(0, 10);
}

// Scraper: Company Websites (Greenhouse/Lever aggregate)
async function searchCompanyATS(position, company, location) {
  const jobs = [];
  try {
    let q = '(site:lever.co OR site:greenhouse.io)';
    if (company) q += ' "' + company + '"';
    q += ' ' + position;
    if (location) q += ' "' + location + '"';

    console.log('Searching company ATS links via query:', q);
    const searchResults = await searchDuckDuckGo(q);

    searchResults.forEach(res => {
      let source = 'Company Website (ATS)';
      let compName = company || 'Company';

      if (res.url.includes('lever.co')) {
        source = 'Lever';
        const match = res.url.match(/lever\.co\/([^\/]+)/);
        if (match) compName = match[1];
      } else if (res.url.includes('greenhouse.io')) {
        source = 'Greenhouse';
        const match = res.url.match(/greenhouse\.io\/([^\/]+)/);
        if (match) compName = match[1];
      }

      compName = compName.charAt(0).toUpperCase() + compName.slice(1);

      jobs.push({
        title: res.title.replace(/\s+-\s+.*$/, '').replace(/Job\s+Posting.*$/, '').trim(),
        company: compName,
        url: res.url,
        location: location || 'Remote',
        date: 'Active',
        source: source,
        descriptionSnippet: res.snippet
      });
    });
  } catch (error) {
    console.error('Company ATS search error:', error.message);
  }
  return jobs.slice(0, 10);
}

// Helper to crawl a job URL and extract its full description
async function getJobFullDescription(jobUrl, source, snippet) {
  if (!jobUrl) return snippet || '';
  try {
    const response = await axios.get(jobUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
      },
      timeout: 5000
    });
    
    const $ = cheerio.load(response.data);
    let desc = '';

    if (source === 'LinkedIn') {
      desc = $('.show-more-less-html__markup').text().trim() || 
             $('.description__text').text().trim() ||
             $('.jobs-description__content').text().trim() ||
             $('article').text().trim();
    } else if (source === 'Naukri.com') {
      desc = $('.job-desc').text().trim() || 
             $('.jd-desc').text().trim() ||
             $('.jd-description').text().trim() ||
             $('.jd-info').text().trim();
    } else if (source === 'Lever') {
      desc = $('.section.page-centered').text().trim() || 
             $('.posting-description').text().trim() ||
             $('body').text().trim();
    } else if (source === 'Greenhouse') {
      desc = $('#content').text().trim() || 
             $('#details').text().trim() ||
             $('.job-body').text().trim() ||
             $('body').text().trim();
    } else {
      desc = $('body').text().trim();
    }

    desc = desc.replace(/\s+/g, ' ').trim();
    return desc || snippet || '';
  } catch (error) {
    return snippet || '';
  }
}

// API Routes

// 1. Upload Resume Route
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let parsedText = '';
    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.pdf') {
      const data = await pdfParse(req.file.buffer);
      parsedText = data.text;
    } else if (ext === '.txt') {
      parsedText = req.file.buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file format. Please upload a .pdf or .txt file.' });
    }

    parsedText = parsedText.replace(/\s+/g, ' ').trim();
    
    if (parsedText.length < 50) {
      return res.status(400).json({ error: 'Unable to extract sufficient text from the resume. Is it scanned or empty?' });
    }

    res.json({
      filename: req.file.originalname,
      textLength: parsedText.length,
      preview: parsedText.slice(0, 800) + '...',
      resumeText: parsedText
    });
  } catch (error) {
    console.error('Resume parse error:', error);
    res.status(500).json({ error: 'Failed to parse resume: ' + error.message });
  }
});

// 2. Main Aggregated Job Search & Match Route
app.post('/api/search', async (req, res) => {
  const { resumeText, positions, companies, locations, geminiKey, experience, workMode, jobType } = req.body;

  if (!resumeText) {
    return res.status(400).json({ error: 'Resume text is required' });
  }

  let queryPositions = [];
  if (positions && positions.filter(Boolean).length > 0) {
    queryPositions = positions.filter(Boolean);
  } else {
    console.log('Target position not provided. Extracting from resume...');
    
    // 1. Try Gemini extraction
    const geminiKeyToUse = geminiKey || process.env.GEMINI_API_KEY;
    if (geminiKeyToUse) {
      queryPositions = await extractTargetPositionsViaGemini(resumeText, geminiKeyToUse);
    }
    
    // 2. Fallback to local heuristic extraction
    if (!queryPositions || queryPositions.length === 0) {
      queryPositions = extractJobTitlesFromResume(resumeText);
    }
    
    console.log('Extracted search positions from resume:', queryPositions);
  }

  if (queryPositions.length === 0) {
    return res.status(400).json({ error: 'Unable to extract search positions from your resume. Please specify your target position manually.' });
  }
  let queryCompanies = Array.isArray(companies) ? companies.filter(Boolean) : (companies ? [companies] : []);
  if (queryCompanies.length === 0) queryCompanies = [''];
  let queryLocations = Array.isArray(locations) ? locations.filter(Boolean) : (locations ? [locations] : []);
  if (queryLocations.length === 0) queryLocations = [''];

  // Cache Lookup
  const cacheInput = {
    positions: queryPositions,
    companies: queryCompanies,
    locations: queryLocations,
    experience: experience || 'all',
    workMode: workMode || 'all',
    jobType: jobType || 'all'
  };
  const cacheKey = crypto.createHash('md5').update(JSON.stringify(cacheInput)).digest('hex');
  const activeCache = readCache();
  const cachedData = activeCache[cacheKey];

  if (cachedData) {
    const ageMinutes = (Date.now() - cachedData.timestamp) / (1000 * 60);
    if (ageMinutes < 30) {
      console.log('Cache hit! Serving results instantly. Age:', Math.round(ageMinutes) + 'm');
      return res.json(cachedData.data);
    } else {
      console.log('Cache entry expired. Triggering fresh search.');
      delete activeCache[cacheKey];
      writeCache(activeCache);
    }
  }

  console.log('Starting Job Search Platform with parameters:', {
    positions: queryPositions,
    companies: queryCompanies,
    locations: queryLocations,
    experience: experience || 'all',
    workMode: workMode || 'all',
    jobType: jobType || 'all'
  });

  const allJobsMap = new Map();
  const searchPromises = [];

  queryPositions.forEach(pos => {
    queryCompanies.forEach(comp => {
      queryLocations.forEach(loc => {
        // LinkedIn
        searchPromises.push(
          searchLinkedIn(pos, comp, loc).then(jobs => {
            jobs.forEach(j => {
              const key = (j.title + '::' + j.company).toLowerCase();
              if (!allJobsMap.has(key)) allJobsMap.set(key, j);
            });
          }).catch(err => console.error('LinkedIn runner error:', err.message))
        );

        // Naukri
        searchPromises.push(
          searchNaukri(pos, comp, loc).then(jobs => {
            jobs.forEach(j => {
              const key = (j.title + '::' + j.company).toLowerCase();
              if (!allJobsMap.has(key)) allJobsMap.set(key, j);
            });
          }).catch(err => console.error('Naukri runner error:', err.message))
        );

        // Company ATS (Greenhouse/Lever)
        searchPromises.push(
          searchCompanyATS(pos, comp, loc).then(jobs => {
            jobs.forEach(j => {
              const key = (j.title + '::' + j.company).toLowerCase();
              if (!allJobsMap.has(key)) allJobsMap.set(key, j);
            });
          }).catch(err => console.error('ATS runner error:', err.message))
        );
      });
    });
  });

  try {
    await Promise.all(searchPromises);
    const rawJobs = Array.from(allJobsMap.values());
    console.log('Found ' + rawJobs.length + ' raw unique job listings. Applying query filters...');

    // 1. Apply Experience, WorkMode, and JobType filters post-scraping
    let filteredRawJobs = rawJobs;

    // Work Mode Filter
    if (workMode && workMode !== 'all') {
      filteredRawJobs = filteredRawJobs.filter(job => {
        const matchText = (job.title + ' ' + job.descriptionSnippet).toLowerCase();
        if (workMode === 'remote') {
          return matchText.includes('remote') || matchText.includes('wfh') || matchText.includes('work from home') || matchText.includes('anywhere');
        } else if (workMode === 'hybrid') {
          return matchText.includes('hybrid') || matchText.includes('flexible') || matchText.includes('partially remote');
        } else if (workMode === 'onsite') {
          return !matchText.includes('remote only') && !matchText.includes('work from home') && !matchText.includes('wfh');
        }
        return true;
      });
    }

    // Experience Filter
    if (experience && experience !== 'all') {
      filteredRawJobs = filteredRawJobs.filter(job => {
        const titleLower = job.title.toLowerCase();
        const descLower = job.descriptionSnippet.toLowerCase();
        const matchText = titleLower + ' ' + descLower;

        // Try parsing numeric experience ranges from text (e.g. "10-15 Yrs", "5+ years", etc.)
        let parsedRange = null;
        // Range like "10-15 Yrs" or "10 to 15 years"
        const rangeRegex = /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:yrs|years|yr|year|exp)/i;
        const matchRange = matchText.match(rangeRegex);
        if (matchRange) {
          parsedRange = {
            min: parseInt(matchRange[1], 10),
            max: parseInt(matchRange[2], 10)
          };
        } else {
          // Plus like "5+ Yrs"
          const plusRegex = /(\d+)\s*\+\s*(?:yrs|years|yr|year|exp)/i;
          const matchPlus = matchText.match(plusRegex);
          if (matchPlus) {
            parsedRange = {
              min: parseInt(matchPlus[1], 10),
              max: 99
            };
          } else {
            // Single like "5 years"
            const singleRegex = /(\d+)\s*(?:yrs|years|yr|year|exp)/i;
            const matchSingle = matchText.match(singleRegex);
            if (matchSingle) {
              const yrs = parseInt(matchSingle[1], 10);
              parsedRange = {
                min: yrs,
                max: yrs
              };
            }
          }
        }

        if (parsedRange) {
          if (experience === 'junior') {
            return parsedRange.min <= 2;
          } else if (experience === 'senior') {
            return parsedRange.min >= 5 || parsedRange.max >= 8;
          } else if (experience === 'mid') {
            return parsedRange.min >= 2 && parsedRange.min <= 6;
          }
        }

        // Fallback to keyword matching if no numeric pattern was found
        const seniorKeywords = ['senior', 'lead', 'architect', 'manager', 'principal', 'director', 'head', 'sr.', '5+ years', '10+ years'];
        const juniorKeywords = ['junior', 'entry', 'associate', '0-2 years', '1-2 years', 'intern', 'graduate', 'fresh', 'fresher', 'jr.'];

        if (experience === 'junior') {
          const hasJunior = juniorKeywords.some(kw => matchText.includes(kw));
          const hasSenior = seniorKeywords.some(kw => titleLower.includes(kw));
          return hasJunior || !hasSenior;
        } else if (experience === 'senior') {
          return seniorKeywords.some(kw => matchText.includes(kw));
        } else if (experience === 'mid') {
          const hasSenior = seniorKeywords.some(kw => titleLower.includes(kw));
          const hasJunior = juniorKeywords.some(kw => titleLower.includes(kw));
          return !hasSenior && !hasJunior;
        }
        return true;
      });
    }

    // Job Type Filter
    if (jobType && jobType !== 'all') {
      filteredRawJobs = filteredRawJobs.filter(job => {
        const matchText = (job.title + ' ' + job.descriptionSnippet).toLowerCase();
        if (jobType === 'internship') {
          return matchText.includes('intern') || matchText.includes('trainee') || matchText.includes('apprenticeship');
        } else if (jobType === 'contract') {
          return matchText.includes('contract') || matchText.includes('freelance') || matchText.includes('temporary');
        } else if (jobType === 'parttime') {
          return matchText.includes('part-time') || matchText.includes('part time') || matchText.includes('hours');
        } else if (jobType === 'fulltime') {
          return !matchText.includes('intern') && !matchText.includes('freelance') && !matchText.includes('contractor');
        }
        return true;
      });
    }

    console.log('Filters applied. Matching ' + filteredRawJobs.length + ' jobs...');

    // Limit matching to top 15 jobs to control execution time
    const processingJobs = filteredRawJobs.slice(0, 15);

    const matchPromises = processingJobs.map(async (job) => {
      const fullDescription = await getJobFullDescription(job.url, job.source, job.descriptionSnippet);
      job.description = fullDescription || job.descriptionSnippet || 'No description available.';

      // Local Match
      job.localScore = calculateCosineSimilarity(resumeText, job.description);

      // Gemini Match
      const geminiAnalysis = await getGeminiMatching(resumeText, job.description, geminiKey);
      if (geminiAnalysis) {
        job.score = geminiAnalysis.score;
        job.matchingSkills = geminiAnalysis.matchingSkills;
        job.missingSkills = geminiAnalysis.missingSkills;
        job.fitLevel = geminiAnalysis.fitLevel;
        job.summary = geminiAnalysis.summary;
        job.matchMethod = 'Gemini AI';
      } else {
        job.score = job.localScore;
        job.matchingSkills = [];
        job.missingSkills = [];
        job.fitLevel = job.score >= 70 ? 'High' : (job.score >= 40 ? 'Medium' : 'Low');
        job.summary = 'Matched locally using term-overlap algorithms. Overlap score: ' + job.score + '%.';
        job.matchMethod = 'Local Matcher';
      }

      return job;
    });

    const matchedJobs = await Promise.all(matchPromises);
    matchedJobs.sort((a, b) => b.score - a.score);

    const resultPayload = {
      totalFound: rawJobs.length,
      processedCount: matchedJobs.length,
      jobs: matchedJobs
    };

    // Cache the query
    const cacheStore = readCache();
    cacheStore[cacheKey] = {
      timestamp: Date.now(),
      data: resultPayload
    };
    writeCache(cacheStore);

    res.json(resultPayload);
  } catch (error) {
    console.error('Unified search error:', error);
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

// 3. Kanban CRUD API Endpoints
app.get('/api/applications', (req, res) => {
  const apps = readApps();
  res.json(apps);
});

app.post('/api/applications', (req, res) => {
  const cardInput = req.body;
  if (!cardInput.title || !cardInput.company) {
    return res.status(400).json({ error: 'Title and Company are required' });
  }

  const apps = readApps();
  
  if (!cardInput.id) {
    cardInput.id = 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  }

  const existingIndex = apps.findIndex(a => a.id === cardInput.id);
  
  if (existingIndex !== -1) {
    // Update fields in place
    apps[existingIndex] = Object.assign(apps[existingIndex], cardInput);
    writeApps(apps);
    res.json(apps[existingIndex]);
  } else {
    // Create new applications card record
    const newCard = {
      id: cardInput.id,
      title: cardInput.title,
      company: cardInput.company,
      location: cardInput.location || 'Remote',
      source: cardInput.source || 'Manual',
      url: cardInput.url || '',
      score: cardInput.score || 0,
      fitLevel: cardInput.fitLevel || 'Low',
      column: cardInput.column || 'Saved',
      notes: cardInput.notes || '',
      contactName: cardInput.contactName || '',
      contactEmail: cardInput.contactEmail || '',
      interviewDate: cardInput.interviewDate || '',
      salaryRange: cardInput.salaryRange || ''
    };
    apps.push(newCard);
    writeApps(apps);
    res.json(newCard);
  }
});

app.delete('/api/applications/:id', (req, res) => {
  const id = req.params.id;
  const apps = readApps();
  const filtered = apps.filter(a => a.id !== id);
  
  if (apps.length === filtered.length) {
    return res.status(404).json({ error: 'Application record not found' });
  }
  
  writeApps(filtered);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log('==================================================');
  console.log('Job Search and Matching Platform Running!');
  console.log('URL: http://localhost:' + PORT);
  console.log('==================================================');
});
