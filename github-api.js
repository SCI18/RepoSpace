// github-api.js
const { Octokit } = require("@octokit/rest");

class GitHubAPI {
  constructor(accessToken = null) {
    this.octokit = new Octokit(
      accessToken ? { auth: accessToken } : {}
    );
    this.authenticated = !!accessToken;
  }

  // Get repositories for authenticated user
  async getUserRepositories() {
    if (!this.authenticated) {
      throw new Error("Authentication required");
    }
    try {
      const response = await this.octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
      });
      return response.data;
    } catch (error) {
      console.error("❌ Error fetching user repositories:", error);
      throw error;
    }
  }

  // Search public repositories
  async searchRepositories(query, page = 1) {
    try {
      const response = await this.octokit.rest.search.repos({
        q: query,
        sort: "stars",
        order: "desc",
        per_page: 30,
        page,
      });
      return response.data;
    } catch (error) {
      console.error("❌ Error searching repositories:", error);
      throw error;
    }
  }

  // Get repository metadata
  async getRepository(owner, repo) {
    try {
      const response = await this.octokit.rest.repos.get({ owner, repo });
      return response.data;
    } catch (error) {
      console.error("❌ Error fetching repository:", error);
      throw error;
    }
  }

  // Get repository contents at a path
  async getRepositoryContents(owner, repo, path = "") {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });
      return response.data;
    } catch (error) {
      console.error("❌ Error fetching repository contents:", error);
      throw error;
    }
  }

  // Get file content (decoded from base64)
  async getFileContent(owner, repo, path) {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      // ⚠ FIX: Node doesn’t have atob; use Buffer
      return Buffer.from(response.data.content, "base64").toString("utf-8");
    } catch (error) {
      console.error("❌ Error fetching file content:", error);
      throw error;
    }
  }

  // Recursively get all files in a repo
  async getAllRepositoryFiles(owner, repo, path = "") {
    try {
      const contents = await this.getRepositoryContents(owner, repo, path);
      let allFiles = [];

      for (const item of contents) {
        if (item.type === "file") {
          const content = await this.getFileContent(owner, repo, item.path);
          allFiles.push({
            path: item.path,
            content,
            type: item.type,
          });
        } else if (item.type === "dir") {
          // Recurse into directories
          const subFiles = await this.getAllRepositoryFiles(owner, repo, item.path);
          allFiles = allFiles.concat(subFiles);
        }
      }

      return allFiles;
    } catch (error) {
      console.error("❌ Error fetching all repository files:", error);
      throw error;
    }
  }
}

// ⚠ FIX: Match class name exactly
module.exports = GitHubAPI;
