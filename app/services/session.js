import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class SessionService extends Service {
  @tracked data = {
    authenticated: {
      user: null,
    },
  };

  get isAuthenticated() {
    return !!this.data.authenticated.user;
  }

  get(key) {
    if (key === 'defaultMunicipality') {
      return localStorage.getItem('defaultMunicipality');
    }
    return null;
  }

  set(key, value) {
    if (key === 'defaultMunicipality') {
      localStorage.setItem('defaultMunicipality', value);
    }
  }

  authenticate(userData) {
    this.data.authenticated.user = userData;
    localStorage.setItem('authToken', userData.token);
    localStorage.setItem('userData', JSON.stringify(userData));
  }

  invalidate() {
    this.data.authenticated.user = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('defaultMunicipality');
  }

  // Load session from localStorage on service init
  restore() {
    const token = localStorage.getItem('authToken');
    const userData = localStorage.getItem('userData');

    if (token && userData) {
      try {
        this.data.authenticated.user = JSON.parse(userData);
      } catch (error) {
        console.error('Failed to restore session:', error);
        this.invalidate();
      }
    }
  }
}
