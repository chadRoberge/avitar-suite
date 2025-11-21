import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default class MyPermitsCreateRoute extends Route {
  @service('current-user') currentUser;
  @service api;

  async model() {
    // Get user's accessible municipalities
    const user = this.currentUser.user;

    // Both contractors and citizens can apply to any municipality
    // Municipality settings will determine if they require approval/verification
    let municipalities = [];
    let contractor = null;

    try {
      // Fetch all active municipalities
      const municipalitiesResponse = await this.api.get('/municipalities?active=true');
      municipalities = municipalitiesResponse.municipalities || [];

      // If contractor, also fetch contractor info for license data
      if (this.currentUser.isContractor && user.contractor_id) {
        const contractorResponse = await this.api.get(`/contractors/${user.contractor_id}`);
        contractor = contractorResponse.contractor;
      }
    } catch (error) {
      console.error('Error loading municipalities:', error);
    }

    return {
      municipalities,
      contractor,
      user,
      isContractor: this.currentUser.isContractor,
      contractor_id: user.contractor_id,
      // Initialize wizard state
      wizard: {
        currentStep: 1,
        totalSteps: 5,
        permitData: {
          municipalityId: null,
          propertyId: null,
          permitTypeId: null,
          type: null,
          description: '',
          scopeOfWork: '',
          estimatedValue: 0,
          squareFootage: null,
          applicant: {
            name: `${user.first_name} ${user.last_name}`,
            email: user.email,
            phone: user.phone || '',
            relationshipToProperty: 'contractor',
          },
          contractor_id: user.contractor_id,
          submitted_by: user._id,
        },
      },
    };
  }
}
