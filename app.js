// app.js - Main application logic (Fixed for Electron)
console.log('🔍 Debugging module availability:');
console.log('- require available:', typeof require !== 'undefined');
console.log('- electron available:', typeof require !== 'undefined' && require.resolve ? 'yes' : 'no');

// Try to load modules with error handling
let GitHubAPI, RepoStorage, ipcRenderer;

try {
    if (typeof require !== 'undefined') {
        console.log('📁 Attempting to load modules...');
        ipcRenderer = require('electron').ipcRenderer;
        console.log('✅ ipcRenderer loaded');
        
        GitHubAPI = require('./github-api');
        console.log('✅ GitHubAPI loaded');
        
        RepoStorage = require('./repo-storage');
        console.log('✅ RepoStorage loaded');
    }
} catch (error) {
    console.error('❌ Module loading failed:', error.message);
    console.error('📍 Error details:', error);
}


class RepoSpaceApp {
    constructor() {
        // Initialize components (with fallbacks for missing modules)
        this.githubAPI = GitHubAPI ? new GitHubAPI() : null;
        this.repoStorage = RepoStorage ? new RepoStorage() : null;
        this.currentRepo = null;
        this.searchTimeout = null;
        
        // DOM elements
        this.elements = {};
        
        // Initialize app when DOM is loaded
        this.init();
    }
    
    // Initialize the application
    init() {
        console.log('🚀 RepoSpace starting...');
        
        // Cache DOM elements
        this.cacheElements();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize theme
        this.initializeTheme();
        
        // Ensure storage directory exists
        if (this.repoStorage) {
            this.repoStorage.ensureBaseDirectory();
        }
        
        console.log('✅ RepoSpace initialized');
    }
    
    // Cache frequently used DOM elements
    cacheElements() {
        this.elements = {
            themeToggle: document.getElementById('themeToggle'),
            themeIcon: document.getElementById('themeIcon'),
            browseSavedBtn: document.getElementById('browseSavedBtn'),
            loginBtn: document.getElementById('loginBtn'),
            userInfo: document.getElementById('userInfo'),
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            repoGrid: document.getElementById('repoGrid'),
            saveModal: document.getElementById('saveModal'),
            repoName: document.getElementById('repoName'),
            customCategory: document.getElementById('customCategory')
        };
        
        // Check if all elements were found
        const missingElements = Object.entries(this.elements)
            .filter(([key, element]) => !element)
            .map(([key]) => key);
            
        if (missingElements.length > 0) {
            console.warn('Missing DOM elements:', missingElements);
        }
    }
    
    // Set up all event listeners
    setupEventListeners() {
        // Theme toggle
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        if (this.elements.browseSavedBtn) {
    				this.elements.browseSavedBtn.addEventListener('click', () => this.showSavedRepos());
				}

        // Authentication
        if (this.elements.loginBtn) {
            this.elements.loginBtn.addEventListener('click', () => this.handleLogin());
        }
        
        // Search functionality
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
            this.elements.searchInput.addEventListener('keypress', (e) => this.handleSearchKeypress(e));
        }
        
        // Modal functionality
        if (this.elements.saveModal) {
            this.elements.saveModal.addEventListener('click', (e) => this.handleModalClick(e));
        }
        if (this.elements.searchBtn) {
    			this.elements.searchBtn.addEventListener('click', () => {
        		const query = this.elements.searchInput.value.trim();
        		if (query) {
            	this.searchRepositories(query);
        		}
    			});
				}
        
        // Category selection
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectCategory(btn));
        });
        
        // Global keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleGlobalKeyboard(e));
    }
    

    // Initialize theme based on saved preference
    initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        const body = document.body;
        
        if (savedTheme === 'dark') {
            body.classList.add('dark-theme');
            if (this.elements.themeIcon) {
                this.elements.themeIcon.textContent = '☀️';
            }
        } else {
            body.classList.remove('dark-theme');
            if (this.elements.themeIcon) {
                this.elements.themeIcon.textContent = '🌙';
            }
        }
    }
    
    // Toggle between light and dark theme
    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.toggle('dark-theme');
        
        if (this.elements.themeIcon) {
            this.elements.themeIcon.textContent = isDark ? '☀️' : '🌙';
        }
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        console.log(`🎨 Switched to ${isDark ? 'dark' : 'light'} theme`);
    }
    
    // Handle GitHub OAuth login
    async handleLogin() {
        if (!ipcRenderer) {
            this.showError('OAuth not available - not running in Electron');
            return;
        }
        
        try {
            this.elements.loginBtn.textContent = 'Signing in...';
            this.elements.loginBtn.disabled = true;
            
            const accessToken = await ipcRenderer.invoke('start-oauth');
            
            // Update GitHub API with token
            if (this.githubAPI) {
                this.githubAPI = new GitHubAPI(accessToken);
            }
            
            // Update UI
            this.elements.loginBtn.style.display = 'none';
            this.elements.userInfo.style.display = 'block';
            this.elements.userInfo.textContent = '✅ Signed in';
            
            console.log('🔑 Successfully authenticated with GitHub');
            
        } catch (error) {
            console.error('❌ Login failed:', error);
            this.showError('Login failed: ' + error.message);
            
            // Reset button
            this.elements.loginBtn.textContent = 'Sign in with GitHub';
            this.elements.loginBtn.disabled = false;
        }
    }
		showSavedRepos() {
    		if (!this.repoStorage) {
        		this.showError('Storage system not available');
        		return;
    		}
    
    		const categories = this.repoStorage.getCategories();
    
    		if (categories.length === 0) {
        		this.elements.repoGrid.innerHTML = `
            		<div style="text-align: center; padding: 40px; color: var(--text-color);">
                		<div style="font-size: 3rem; margin-bottom: 20px;">📁</div>
                		<h3>No saved repositories yet</h3>
                		<p>Search and save some repositories to see them here!</p>
            		</div>
        		`;
        		return;
    		}
    
    		// Display categories and their repos
    		let html = '';
    		categories.forEach(category => {
        		const repos = this.repoStorage.getReposByCategory(category);
        		html += `
            		<div style="margin-bottom: 30px;">
                		<h3 style="color: var(--primary-color); margin-bottom: 15px;">📂 ${category} (${repos.length})</h3>
                		<div class="repo-grid">
                    		${repos.map(repo => this.createSavedRepoCard(repo)).join('')}
                		</div>
            		</div>
        		`;
    		});
    
    		this.elements.repoGrid.innerHTML = html;
    		console.log(`📁 Showing ${categories.length} categories with saved repos`);
		}
    
    // Handle search input with debouncing
    handleSearchInput(e) {
        clearTimeout(this.searchTimeout);
        
        const query = e.target.value.trim();
        if (query.length > 2) {
            this.searchTimeout = setTimeout(() => {
                this.searchRepositories(query);
            }, 500); // Wait 500ms after user stops typing
        } else if (query.length === 0) {
            this.clearResults();
        }
    }
    
    // Handle search on Enter key
    handleSearchKeypress(e) {
        if (e.key === 'Enter') {
            clearTimeout(this.searchTimeout);
            const query = e.target.value.trim();
            if (query) {
                this.searchRepositories(query);
            }
        }
    }
    
    // Search repositories using GitHub API
    async searchRepositories(query) {
        if (!this.githubAPI) {
            this.showError('GitHub API not available');
            return;
        }
        
        try {
            console.log('🔍 Searching for:', query);
            
            // Show loading state
            this.showLoading();
            
            // Search using GitHub API
            const results = await this.githubAPI.searchRepositories(query);
            
            // Display results
            this.displaySearchResults(results.items || []);
            
        } catch (error) {
            console.error('❌ Search failed:', error);
            this.showError(`Search failed: ${error.message}`);
        }
    }
    
    // Display search results
    displaySearchResults(repositories) {
        if (!this.elements.repoGrid) return;
        
        if (repositories.length === 0) {
            this.elements.repoGrid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-color);">
                    <h3>No repositories found</h3>
                    <p>Try different keywords or check your spelling</p>
                </div>
            `;
            return;
        }
        
        this.elements.repoGrid.innerHTML = repositories.map(repo => this.createRepoCard(repo)).join('');
        console.log(`📦 Found ${repositories.length} repositories`);
    }
    
    // Create HTML for repository card
    createRepoCard(repo) {
        const description = (repo.description || 'No description available').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        
        return `
            <div class="repo-card" data-repo="${repo.full_name}">
                <div class="repo-header">
                		<a href="#" class="repo-name" onclick="app.viewRepo('${repo.full_name}')">${repo.full_name}</a>
                    <div class="repo-stars">⭐ ${this.formatNumber(repo.stargazers_count)}</div>
                </div>
                <p class="repo-description">
                    ${repo.description || 'No description available'}
                </p>
                <div class="repo-meta">
                    <div class="repo-language">
                        ${repo.language ? `
                            <div class="language-dot" style="background-color: ${this.getLanguageColor(repo.language)};"></div>
                            ${repo.language}
                        ` : 'No language specified'}
                    </div>
                    <span>Updated ${this.formatDate(repo.updated_at)}</span>
                </div>
                <button class="btn btn-secondary save-btn" onclick="app.openSaveModal('${repo.full_name}', '${repo.clone_url}', '${description}', '${repo.language || ''}', ${repo.stargazers_count})">
    								💾 Save
								</button>
								<button class="btn btn-secondary save-btn" onclick="app.openRepoFolder('${repo.full_name}')" style="right: 70px;">
    								📁 Browse
								</button>
            </div>
        `;
    }
		createSavedRepoCard(repo) {
    		return `
        		<div class="repo-card">
            		<div class="repo-header">
                		<div class="repo-name">${repo.fullName}</div>
                		<div class="repo-stars">⭐ ${this.formatNumber(repo.stars)}</div>
            		</div>
            		<p class="repo-description">${repo.description}</p>
            		<div class="repo-meta">
                		<div class="repo-language">
                    		${repo.language ? `
                        		<div class="language-dot" style="background-color: ${this.getLanguageColor(repo.language)};"></div>
                        		${repo.language}
                    		` : 'No language'}
                		</div>
                		<span>Saved ${this.formatDate(repo.savedAt)}</span>
            		</div>
            		<button class="btn btn-primary save-btn" onclick="app.openRepoFolder('${repo.fullName}')">
                		📁 Open Folder
            		</button>
        		</div>
    		`;
		}
    

    viewRepo(fullName) {
    // Check if repo is saved locally first
    		if (this.repoStorage && this.repoStorage.checkRepoExists(fullName)) {
        		this.showSavedRepos|(fullName);
    		} else {
        	// Fallback to GitHub
        	window.open(`https://github.com/${fullName}`, '_blank');
    		}
		}

		showSavedRepos() {
    	const categories = this.repoStorage.getCategories();
    	// Create UI to browse saved repos by category
    	// Show file tree, README preview, etc.
		}
    
    // Open save modal with repository data
    openSaveModal(fullName, cloneUrl, description = '', language = '', stars = 0) {
        this.currentRepo = {
            fullName: fullName,
            cloneUrl: cloneUrl,
            description: description,
            language: language,
            stars: stars
        };
        
        if (this.elements.repoName) {
            this.elements.repoName.textContent = fullName;
        }
        
        if (this.elements.saveModal) {
            this.elements.saveModal.style.display = 'block';
        }
        
        // Load existing categories
        this.loadExistingCategories();
        
        console.log('💾 Opening save modal for:', fullName);
    }
    
    // Load and display existing categories
    loadExistingCategories() {
        if (!this.repoStorage) return;
        
        const categories = this.repoStorage.getCategories();
        const categoryGrid = document.querySelector('.category-grid');
        
        if (!categoryGrid) return;
        
        // Remove any previously added custom categories
        const existingCustom = categoryGrid.querySelectorAll('.category-btn.custom');
        existingCustom.forEach(btn => btn.remove());
        
        // Add existing categories as options
        categories.forEach(category => {
            const btn = document.createElement('div');
            btn.className = 'category-btn custom';
            btn.dataset.category = category;
            btn.textContent = `📁 ${category}`;
            btn.addEventListener('click', () => this.selectCategory(btn));
            categoryGrid.appendChild(btn);
        });
    }
    
    // Handle category selection
    selectCategory(btn) {
        // Remove selection from all buttons
        document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        
        // Select clicked button
        btn.classList.add('selected');
        if (this.elements.customCategory) {
            this.elements.customCategory.value = btn.dataset.category;
        }
    }
    
    // Save repository
    async saveRepository() {
        const category = this.elements.customCategory ? this.elements.customCategory.value.trim() : '';
        
        if (!category) {
            this.showError('Please select or enter a category');
            return;
        }
        
        if (!this.currentRepo) {
            this.showError('No repository selected');
            return;
        }
        
        if (!this.repoStorage) {
            this.showError('Storage system not available');
            return;
        }
        
        try {
            console.log(`💾 Saving ${this.currentRepo.fullName} to category: ${category}`);
            
            // Save metadata first
            const saved = this.repoStorage.saveRepoMetadata(this.currentRepo, category);
            
            if (!saved) {
                this.showError(`Repository already exists in "${category}" category`);
                return;
            }
            
            // Download and save files
            await this.downloadRepositoryFiles(this.currentRepo);
            
            // Show success message
            this.showSuccess(`✅ Repository saved to "${category}" category!`);
            
            // Close modal
            this.closeSaveModal();
            
        } catch (error) {
            console.error('❌ Failed to save repository:', error);
            this.showError('Failed to save repository: ' + error.message);
        }
    }
    
    // Download repository files
    async downloadRepositoryFiles(repoData) {
        if (!this.githubAPI || !this.repoStorage) {
            throw new Error('Required services not available');
        }
        
        try {
            const [owner, repo] = repoData.fullName.split('/');
            
            console.log(`📥 Downloading files from ${repoData.fullName}...`);
            
            // Get all files using GitHub API
            const files = await this.githubAPI.getAllRepositoryFiles(owner, repo);
            
            // Save files to disk
            const savedPath = await this.repoStorage.saveRepositoryFiles(repoData.fullName, files);
            
            console.log(`✅ Successfully downloaded ${files.length} files to: ${savedPath}`);
            
        } catch (error) {
            console.error('❌ Failed to download repository files:', error);
            throw error;
        }
    }
		
		async openRepoFolder(fullName) {
        try {
            const result = await ipcRenderer.invoke('open-repo-folder', fullName);
            if (result.success) {
                console.log('📁 Opened repo folder');
            } else {
                this.showError('Failed to open folder: ' + result.error);
            }
        } catch (error) {
            this.showError('Failed to open folder: ' + error.message);
        }
    }
    
    // Close save modal
    closeSaveModal() {
        if (this.elements.saveModal) {
            this.elements.saveModal.style.display = 'none';
        }
        
        // Reset form
        document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('selected'));
        if (this.elements.customCategory) {
            this.elements.customCategory.value = '';
        }
        this.currentRepo = null;
    }
    
    // Handle modal clicks (close when clicking outside)
    handleModalClick(e) {
        if (e.target.id === 'saveModal') {
            this.closeSaveModal();
        }
    }
    
    // Handle global keyboard shortcuts
    handleGlobalKeyboard(e) {
        // Escape key closes modal
        if (e.key === 'Escape' && this.elements.saveModal && this.elements.saveModal.style.display === 'block') {
            this.closeSaveModal();
        }
        
        // Ctrl/Cmd + K focuses search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            if (this.elements.searchInput) {
                this.elements.searchInput.focus();
            }
        }
    }
    
    // Utility functions
    showLoading() {
        if (this.elements.repoGrid) {
            this.elements.repoGrid.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">🔍</div>
                    <div>Searching repositories...</div>
                </div>
            `;
        }
    }
    
    clearResults() {
        if (this.elements.repoGrid) {
            this.elements.repoGrid.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-color); opacity: 0.6;">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🔍</div>
                    <h3>Start by searching for repositories</h3>
                    <p>Try searching for topics like "react", "python", "machine-learning", or "blockchain"</p>
                </div>
            `;
        }
    }
    
    showError(message) {
        alert('❌ ' + message);
        console.error(message);
    }
    
    showSuccess(message) {
        alert(message);
        console.log(message);
    }
    
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) return '1 day ago';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`;
        return `${Math.ceil(diffDays / 30)} months ago`;
    }
    
    getLanguageColor(language) {
        const colors = {
            'JavaScript': '#f1e05a',
            'Python': '#3572A5',
            'Java': '#b07219',
            'TypeScript': '#2b7489',
            'C++': '#f34b7d',
            'C': '#555555',
            'Go': '#00ADD8',
            'Rust': '#dea584',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
            'PHP': '#4F5D95',
            'Ruby': '#701516',
            'Swift': '#ffac45',
            'Kotlin': '#F18E33'
        };
        return colors[language] || '#666666';
    }
}

// Global functions for HTML onclick events
function saveRepository() {
    if (window.app) {
        window.app.saveRepository();
    }
}

function closeSaveModal() {
    if (window.app) {
        window.app.closeSaveModal();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new RepoSpaceApp();
});

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RepoSpaceApp;
}
