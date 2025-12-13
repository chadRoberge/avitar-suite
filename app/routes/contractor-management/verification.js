import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ContractorManagementVerificationRoute extends Route {
  @service api;
  @service('current-user') currentUser;
  @service router;

  async beforeModel() {
    // Only contractors can access (contractor_id not required - this page creates it)
    if (!this.currentUser.isContractor) {
      this.router.transitionTo('my-permits');
    }
  }

  async model() {
    const parentModel = this.modelFor('contractor-management');

    console.log('📋 Verification route model hook');
    console.log('   - needsOnboarding:', parentModel.needsOnboarding);
    console.log('   - contractor:', parentModel.contractor);
    console.log(
      '   - user contractor_id:',
      this.currentUser.user?.contractor_id,
    );

    try {
      // Get existing verification application
      const verificationResponse = await this.api.get(
        '/contractor-verification/my-verification',
      );
      console.log(
        '   - verification loaded:',
        verificationResponse.verification,
      );

      // If onboarding is needed, also fetch available plans
      let plans = [];
      if (parentModel.needsOnboarding) {
        try {
          console.log('🔍 Fetching contractor plans (needsOnboarding=true)...');
          const plansResponse = await this.api.get('/contractors/plans');
          plans = plansResponse.plans || [];
          console.log('✅ Loaded plans:', plans.length, 'plans');
          console.log('   Plan details:', plans);
        } catch (plansError) {
          console.error('❌ Error loading subscription plans:', plansError);
        }
      } else {
        console.log('⏭️  Skipping plan fetch (needsOnboarding=false)');
      }

      return {
        verification: verificationResponse.verification,
        contractor: parentModel.contractor,
        user: this.currentUser.user,
        needsOnboarding: parentModel.needsOnboarding,
        availablePlans: plans,
      };
    } catch (error) {
      console.error('Error loading verification:', error);

      // Still fetch plans if onboarding needed
      let plans = [];
      if (parentModel.needsOnboarding) {
        try {
          console.log('🔍 Fetching contractor plans (in error handler)...');
          const plansResponse = await this.api.get('/contractors/plans');
          plans = plansResponse.plans || [];
          console.log('✅ Loaded plans:', plans.length, 'plans');
        } catch (plansError) {
          console.error('❌ Error loading subscription plans:', plansError);
        }
      }

      return {
        verification: null,
        contractor: parentModel.contractor,
        user: this.currentUser.user,
        needsOnboarding: parentModel.needsOnboarding,
        availablePlans: plans,
      };
    }
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    controller.setupFormData();
  }
}
