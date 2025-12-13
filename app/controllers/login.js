import Controller from '@ember/controller';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class LoginController extends Controller {
  @service router;
  @service session;
  @service api;
  @service('current-user') currentUser;
  @tracked showLogin = true;
  @tracked isLoading = false;
  @tracked errorMessage = '';

  // Track form data directly in controller for reactivity
  @tracked loginEmail = '';
  @tracked loginPassword = '';
  @tracked signupFirstName = '';
  @tracked signupLastName = '';
  @tracked signupEmail = '';
  @tracked signupPassword = '';
  @tracked signupConfirmPassword = '';
  @tracked signupUserType = 'residential';
  @tracked signupBusinessName = '';
  @tracked signupBusinessType = '';

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

    try {
      // Client-side validation
      if (!this.loginEmail || !this.loginPassword) {
        throw new Error('Please fill in all fields');
      }

      if (!this.loginEmail.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      // Call API
      const data = await this.api.postUnauth('/auth/login', {
        email: this.loginEmail.toLowerCase(),
        password: this.loginPassword,
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

      // Load current user data and permissions
      await this.currentUser.load();
      console.log('Current user loaded with permissions');

      // Reset form
      this.loginEmail = '';
      this.loginPassword = '';

      // Redirect based on user role
      if (this.currentUser.isContractorOrCitizen) {
        // Contractors and citizens go to their personal dashboard
        this.router.transitionTo('my-permits');
      } else {
        // Municipal staff and Avitar staff go to municipality selection
        this.router.transitionTo('municipality-select');
      }
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

    try {
      // Client-side validation
      if (
        !this.signupFirstName ||
        !this.signupLastName ||
        !this.signupEmail ||
        !this.signupPassword ||
        !this.signupConfirmPassword
      ) {
        throw new Error('Please fill in all fields');
      }

      // Additional validation for commercial accounts
      if (this.signupUserType === 'commercial') {
        if (!this.signupBusinessName || !this.signupBusinessType) {
          throw new Error(
            'Business name and type are required for commercial accounts',
          );
        }
      }

      if (!this.signupEmail.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      if (this.signupPassword.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }

      if (this.signupPassword !== this.signupConfirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Prepare API request data
      const signupData = {
        firstName: this.signupFirstName.toUpperCase(),
        lastName: this.signupLastName.toUpperCase(),
        email: this.signupEmail.toLowerCase(),
        password: this.signupPassword,
        userType: this.signupUserType,
      };

      // Add business fields for commercial accounts
      if (this.signupUserType === 'commercial') {
        signupData.businessName = this.signupBusinessName;
        signupData.businessType = this.signupBusinessType;
      }

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

      // Load current user data and permissions
      await this.currentUser.load();
      console.log('Current user loaded with permissions');

      // Reset signup form
      this.signupFirstName = '';
      this.signupLastName = '';
      this.signupEmail = '';
      this.signupPassword = '';
      this.signupConfirmPassword = '';
      this.signupUserType = 'residential';
      this.signupBusinessName = '';
      this.signupBusinessType = '';

      // Redirect based on user role
      if (this.currentUser.isContractorOrCitizen) {
        // Contractors and citizens go to their personal dashboard
        this.router.transitionTo('my-permits');
      } else {
        // Municipal staff and Avitar staff go to municipality selection
        this.router.transitionTo('municipality-select');
      }
    } catch (error) {
      this.errorMessage = error.message || 'Signup failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  @action
  updateLoginField(field, event) {
    if (field === 'email') {
      this.loginEmail = event.target.value;
    } else if (field === 'password') {
      this.loginPassword = event.target.value;
    }
  }

  @action
  updateSignupField(field, event) {
    switch (field) {
      case 'firstName':
        this.signupFirstName = event.target.value;
        break;
      case 'lastName':
        this.signupLastName = event.target.value;
        break;
      case 'email':
        this.signupEmail = event.target.value;
        break;
      case 'password':
        this.signupPassword = event.target.value;
        break;
      case 'confirmPassword':
        this.signupConfirmPassword = event.target.value;
        break;
      case 'businessName':
        this.signupBusinessName = event.target.value;
        break;
      case 'businessType':
        this.signupBusinessType = event.target.value;
        break;
    }
  }

  @action
  selectUserType(userType) {
    this.signupUserType = userType;
  }
}
