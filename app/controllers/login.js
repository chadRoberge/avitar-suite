import Controller from '@ember/controller';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class LoginController extends Controller {
  @service router;
  @service session;
  @service api;
  @tracked showLogin = true;
  @tracked isLoading = false;
  @tracked errorMessage = '';

  @action
  toggleForm() {
    this.showLogin = !this.showLogin;
    this.errorMessage = '';
  }

  @action
  async handleLogin(event) {
    event.preventDefault();
    this.isLoading = true;
    this.errorMessage = '';

    const { email, password } = this.model.loginForm;

    try {
      // Client-side validation
      if (!email || !password) {
        throw new Error('Please fill in all fields');
      }

      if (!email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      // Call API
      const data = await this.api.postUnauth('/auth/login', {
        email: email.toLowerCase(),
        password,
      });

      if (!data.success) {
        throw new Error(data.message || 'Login failed');
      }

      // Authenticate user via session service
      this.session.authenticate({
        ...data.user,
        token: data.token,
      });

      console.log('Login successful for:', data.user.fullName);

      // Reset form
      this.model.loginForm = {
        email: '',
        password: '',
      };

      // Redirect to municipality selection
      this.router.transitionTo('municipality-select');
    } catch (error) {
      this.errorMessage = error.message || 'Login failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  @action
  async handleSignup(event) {
    event.preventDefault();
    this.isLoading = true;
    this.errorMessage = '';

    const { firstName, lastName, email, password, confirmPassword, userType } =
      this.model.signupForm;

    try {
      // Client-side validation
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        throw new Error('Please fill in all fields');
      }

      if (!email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Prepare API request data
      const signupData = {
        firstName: firstName.toUpperCase(),
        lastName: lastName.toUpperCase(),
        email: email.toLowerCase(),
        password,
        userType,
      };

      // Call API
      const data = await this.api.postUnauth('/auth/register', signupData);

      if (!data.success) {
        throw new Error(data.message || 'Registration failed');
      }

      // Authenticate user via session service
      this.session.authenticate({
        ...data.user,
        token: data.token,
      });

      console.log('Signup successful for:', data.user.fullName);

      // Reset signup form
      this.model.signupForm = {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        userType: 'residential',
      };

      // Redirect to municipality selection
      this.router.transitionTo('municipality-select');
    } catch (error) {
      this.errorMessage = error.message || 'Signup failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  @action
  updateLoginField(field, event) {
    this.model.loginForm[field] = event.target.value;
  }

  @action
  updateSignupField(field, event) {
    this.model.signupForm[field] = event.target.value;
  }

  @action
  selectUserType(userType) {
    this.model.signupForm.userType = userType;
  }
}
