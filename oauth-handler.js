const { AuthorizationCode } = require('simple-oauth2');

class OAuthHandler {
  constructor(clientId, clientSecret) {
    this.client = new AuthorizationCode({
      client: {
        id: clientId,
        secret: clientSecret,
      },
      auth: {
        tokenHost: 'https://github.com',
        tokenPath: '/login/oauth/access_token',
        authorizePath: '/login/oauth/authorize',
      },
      options: {
        authorizationMethod: 'body', // GitHub prefers POST body
      },
    });
  }

  getAuthURL() {
    return this.client.authorizeURL({
      redirect_uri: 'http://localhost:8080/callback', // Different port
      scope: 'repo user',
      state: 'github-client-auth'
    });
  }

  async getAccessToken(code) {
    try {
      const tokenParams = {
        code: code,
        redirect_uri: 'http://localhost:8080/callback', // Match the auth URL
        scope: 'repo user',
      };

      const accessToken = await this.client.getToken(tokenParams);
      return accessToken.token.access_token;
    } catch (error) {
      console.error('Access Token Error:', error.message);
      console.error('Full error:', error);
      throw error;
    }
  }
}

module.exports = OAuthHandler;
