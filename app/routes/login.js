import Route from '@ember/routing/route';

export default class LoginRoute extends Route {
  model() {
    return {
      showLogin: true,
      loginForm: {
        email: '',
        password: '',
      },
      signupForm: {
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        confirmPassword: '',
        userType: 'residential', // Default to residential
      },
    };
  }
}
