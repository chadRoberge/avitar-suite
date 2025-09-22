import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ApplicationRoute extends Route {
  @service router;
  @service session;
  @service('current-user') currentUser;

  async beforeModel() {
    // First, try to restore session from localStorage
    this.session.restore();

    // If user is authenticated (after restore), load their data and redirect appropriately
    if (this.session.isAuthenticated) {
      try {
        console.log('Attempting to restore session...');
        await this.currentUser.load();
        console.log('Session restored successfully');
        // Redirect to municipality selection if no specific route requested
        if (this.router.currentURL === '/' || this.router.currentURL === '') {
          this.router.transitionTo('municipality-select');
        }
      } catch (error) {
        // If loading user fails, session may be invalid
        console.warn(
          'Failed to load user session, token may be expired:',
          error.message,
        );
        this.session.invalidate();
        this.router.transitionTo('login');
      }
    } else {
      console.log('No valid session found, redirecting to login');
      // Not authenticated, redirect to login
      this.router.transitionTo('login');
    }
  }
}
