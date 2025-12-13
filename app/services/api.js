import Service from '@ember/service';
import { inject as service } from '@ember/service';
import config from 'avitar-suite/config/environment';

export default class ApiService extends Service {
  @service session;
  @service loading;

  get baseURL() {
    return `${config.APP.API_HOST}/api`;
  }

  get headers() {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.session.isAuthenticated) {
      const token = localStorage.getItem('authToken');
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    return headers;
  }

  async request(url, options = {}) {
    // Check if this is a background/sync operation that shouldn't show loading
    const isBackground = options.background === true || options.sync === true;
    const showLoading = options.showLoading !== false && !isBackground; // default to true unless explicitly false or background
    const loadingMessage = options.loadingMessage || 'Loading...';

    let requestId;
    if (showLoading) {
      requestId = this.loading.startLoading(loadingMessage);
    }

    try {
      const response = await fetch(`${this.baseURL}${url}`, {
        headers: { ...this.headers, ...options.headers },
        method: options.method || 'GET',
        body: options.body,
      });

      if (response.status === 401) {
        // Token expired or invalid, logout user
        this.session.invalidate();
        throw new Error('Authentication required');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `API Error: ${response.status} ${response.statusText}`,
        );
      }

      return response.json();
    } finally {
      if (showLoading && requestId) {
        this.loading.stopLoading(requestId);
      }
    }
  }

  async get(url, params = {}, options = {}) {
    const searchParams = new URLSearchParams(params);
    const fullUrl = searchParams.toString() ? `${url}?${searchParams}` : url;
    return this.request(fullUrl, options);
  }

  async post(url, data = {}, options = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async patch(url, data = {}, options = {}) {
    return this.request(url, {
      method: 'PATCH',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async put(url, data = {}, options = {}) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data),
      ...options,
    });
  }

  async delete(url, options = {}) {
    return this.request(url, {
      method: 'DELETE',
      ...options,
    });
  }

  async upload(url, formData) {
    const token = localStorage.getItem('authToken');
    const fullUrl = `${this.baseURL}${url}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Don't set Content-Type - let browser set it with boundary for multipart/form-data
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error ||
          errorData.message ||
          `Upload failed: ${response.statusText}`,
      );
    }

    return response.json();
  }

  async uploadFile(url, formData, options = {}) {
    const token = localStorage.getItem('authToken');
    const fullUrl = `${this.baseURL}${url}`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track progress
      if (options.onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            options.onProgress(percentComplete);
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            reject(new Error('Invalid JSON response'));
          }
        } else {
          try {
            const errorData = JSON.parse(xhr.responseText);
            reject(
              new Error(
                errorData.error ||
                  errorData.message ||
                  `Upload failed: ${xhr.statusText}`,
              ),
            );
          } catch {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed: Network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.open('POST', fullUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      // Don't set Content-Type - let browser set it with boundary for multipart/form-data

      xhr.send(formData);
    });
  }

  // Unauthenticated requests (login, signup)
  async postUnauth(url, data = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        // No auth header
      },
    });
  }
}
