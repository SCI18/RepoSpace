// repo-storage.js - Handles all repository storage operations
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class RepoStorage {
    constructor() {
        this.storageKey = 'repospace_saved_repos';
        this.baseDir = path.join(os.homedir(), 'RepoSpace');
    }

    // Ensure RepoSpace directory exists
    async ensureBaseDirectory() {
        try {
            await fs.ensureDir(this.baseDir);
            return this.baseDir;
        } catch (error) {
            console.error('Failed to create RepoSpace directory:', error);
            throw error;
        }
    }

    // Get all saved repos from localStorage
    getSavedRepos() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Failed to load saved repos:', error);
            return {};
        }
    }

    // Save repository metadata to localStorage
    saveRepoMetadata(repoData, category) {
        try {
            const saved = this.getSavedRepos();

            if (!saved[category]) {
                saved[category] = [];
            }

            // Check if repo already exists in this category
            const exists = saved[category].find(r => r.fullName === repoData.fullName);
            if (!exists) {
                const repoMetadata = {
                    fullName: repoData.fullName,
                    cloneUrl: repoData.cloneUrl,
                    description: repoData.description || 'No description',
                    language: repoData.language || 'Unknown',
                    stars: repoData.stars || 0,
                    savedAt: new Date().toISOString(),
                    localPath: this.getRepoPath(repoData.fullName, category),
                    category: category
                };

                saved[category].push(repoMetadata);
                localStorage.setItem(this.storageKey, JSON.stringify(saved));
                return true;
            }
            return false; // Already exists
        } catch (error) {
            console.error('Failed to save repo metadata:', error);
            throw error;
        }
    }

    // Get the local file path for a repository
		getRepoPath(fullName, category = 'uncategorized') {
    		return path.join(this.baseDir, category, fullName.replace('/', '-'));
		}

    // Save repository files to disk
		async saveRepositoryFiles(repoName, files, category = 'uncategorized') {
		    try {
    		    const repoDir = this.getRepoPath(repoName, category);
        
        		await fs.ensureDir(path.dirname(repoDir));

        		await fs.ensureDir(repoDir);
    
            // Save each file
            for (const file of files) {
                const filePath = path.join(repoDir, file.path);

                // Ensure directory exists for file
                await fs.ensureDir(path.dirname(filePath));

                // 🔑 FIX: handle text vs binary
                if (Buffer.isBuffer(file.content)) {
                    // Binary → write as raw buffer
                    await fs.writeFile(filePath, file.content);
                } else {
                    // Text → write as UTF-8
                    await fs.writeFile(filePath, file.content, 'utf8');
                }
            }

            // Create a metadata file
            const metadataPath = path.join(repoDir, '.repospace-meta.json');
            const metadata = {
                repoName: repoName,
                downloadedAt: new Date().toISOString(),
                fileCount: files.length,
                totalSize: files.reduce((size, file) => {
                    if (Buffer.isBuffer(file.content)) {
                        return size + file.content.length;
                    } else {
                        return size + Buffer.byteLength(file.content, 'utf8');
                    }
                }, 0)
            };
            await fs.writeJSON(metadataPath, metadata, { spaces: 2 });

            console.log(`✅ Saved ${files.length} files to: ${repoDir}`);
            return repoDir;

        } catch (error) {
            console.error('Failed to save repository files:', error);
            throw error;
        }
    }

    // Get repositories by category
    getReposByCategory(category) {
        const saved = this.getSavedRepos();
        return saved[category] || [];
    }

    // Get all categories
    getCategories() {
        const saved = this.getSavedRepos();
        return Object.keys(saved).sort();
    }

    // Check if repository exists locally
    async checkRepoExists(fullName) {
        try {
            const repoPath = this.getRepoPath(fullName);
            return await fs.pathExists(repoPath);
        } catch (error) {
            return false;
        }
    }

    // Get repository statistics
    async getRepoStats(fullName) {
        try {
            const repoPath = this.getRepoPath(fullName);
            const metadataPath = path.join(repoPath, '.repospace-meta.json');

            if (await fs.pathExists(metadataPath)) {
                return await fs.readJSON(metadataPath);
            }
            return null;
        } catch (error) {
            console.error('Failed to get repo stats:', error);
            return null;
        }
    }

    // Remove repository (metadata and files)
    async removeRepo(fullName, category) {
        try {
            // Remove from localStorage
            const saved = this.getSavedRepos();
            if (saved[category]) {
                saved[category] = saved[category].filter(r => r.fullName !== fullName);
                if (saved[category].length === 0) {
                    delete saved[category];
                }
                localStorage.setItem(this.storageKey, JSON.stringify(saved));
            }

            // Remove files from disk
            const repoPath = this.getRepoPath(fullName);
            if (await fs.pathExists(repoPath)) {
                await fs.remove(repoPath);
                console.log(`🗑️ Removed repository files: ${repoPath}`);
            }

            return true;
        } catch (error) {
            console.error('Failed to remove repository:', error);
            throw error;
        }
    }

    // Get total storage usage
    async getStorageUsage() {
        try {
            if (!(await fs.pathExists(this.baseDir))) {
                return { totalSize: 0, repoCount: 0 };
            }

            const repos = await fs.readdir(this.baseDir);
            let totalSize = 0;

            for (const repo of repos) {
                const repoPath = path.join(this.baseDir, repo);
                const stats = await fs.stat(repoPath);
                if (stats.isDirectory()) {
                    // Get directory size (simplified)
                    const files = await this.getDirectorySize(repoPath);
                    totalSize += files;
                }
            }

            return {
                totalSize: totalSize,
                repoCount: repos.length,
                basePath: this.baseDir
            };

        } catch (error) {
            console.error('Failed to calculate storage usage:', error);
            return { totalSize: 0, repoCount: 0 };
        }
    }

    // Helper: Calculate directory size
    async getDirectorySize(dirPath) {
        try {
            let size = 0;
            const files = await fs.readdir(dirPath);

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stats = await fs.stat(filePath);

                if (stats.isDirectory()) {
                    size += await this.getDirectorySize(filePath);
                } else {
                    size += stats.size;
                }
            }

            return size;
        } catch (error) {
            return 0;
        }
    }

    // Format file size for display
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = RepoStorage;
